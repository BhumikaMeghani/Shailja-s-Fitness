/** Trusted selection validation stays here; Convex owns atomic persistence. */
import { randomBytes } from 'node:crypto'
import { api, read, write, type BookingRow } from './db'
import { services, production, env } from './env'
import { PLAN_DURATION_DAYS, planByName } from '../lib/plans'
import { sampleSlots } from './slots'

export function development(): boolean {
  return !production && env.DEVELOPMENT_AVAILABILITY
}

export async function availabilitySlots(serviceId: string, day: string) {
  const slots = sampleSlots(serviceId, day)
  const taken = new Set(await read(api.studio.taken, {
    slots, now: Math.floor(Date.now() / 1000),
  }))
  return slots.map(slot => ({ starts_at: slot, available: !taken.has(slot) }))
}

export async function reserve(
  data: Record<string, unknown>, userId: string, mode: 'demo' | 'held',
): Promise<{ record: BookingRow; created: boolean }> {
  if (!development()) {
    throw new Error('Real availability is not configured. Booking is currently unavailable.')
  }
  const service = services().find(s => s.id === data.service)
  const startsAt = data.starts_at
  if (!service || typeof startsAt !== 'string') throw new Error('Choose a class and an available time.')
  const plan = typeof data.plan === 'string' ? planByName(data.plan) : null
  if (typeof data.plan === 'string' && data.plan && !plan) {
    throw new Error('Choose one of the six yoga plans.')
  }
  const day = startsAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid date.')
  if (!sampleSlots(service.id, day).includes(startsAt)) {
    throw new Error('This time is unavailable. Please select another slot.')
  }
  if (mode === 'held' && !plan) {
    throw new Error('Choose a yoga plan: paid test bookings are priced by the plan, not the class format.')
  }
  const now = Math.floor(Date.now() / 1000)
  return write(api.studio.reserve, { record: {
    id: randomBytes(16).toString('hex'), user_id: userId, service: service.id,
    starts_at: startsAt, status: mode,
    amount: plan?.price_paise ?? null,
    duration: PLAN_DURATION_DAYS, currency: 'INR',
    expires: mode === 'held' ? now + 900 : null, order_id: null, payment_id: null, created: now,
  } })
}

/** Forward validated provider fields, not arbitrary gateway metadata. */
export function paymentFields(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Payment details are invalid.')
  const payment = value as Record<string, unknown>
  if (typeof payment.id !== 'string' || typeof payment.order_id !== 'string' ||
      typeof payment.currency !== 'string' || typeof payment.status !== 'string' ||
      typeof payment.amount !== 'number' || !Number.isSafeInteger(payment.amount)) {
    throw new Error('Payment details are invalid.')
  }
  return {
    id: payment.id, order_id: payment.order_id, amount: payment.amount,
    currency: payment.currency, status: payment.status,
  }
}

export function confirmPayment(record: BookingRow, payment: unknown) {
  return write(api.studio.confirmPayment, { id: record.id, payment: paymentFields(payment) })
}

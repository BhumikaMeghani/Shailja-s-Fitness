/**
 * Booking domain logic: slot validation, transactional reservation,
 * and payment confirmation. Ported from app.py.
 */
import { randomBytes } from 'node:crypto'
import { beginImmediate, commit, rollback, query, queryOne, run, type BookingRow } from './db'
import { services, production } from './env'
import { sampleSlots, istDateKey, nowIst } from './slots'

const ACTIVE_STATUSES = "'demo','held','pending','confirmed'"

export function development(): boolean {
  return !production && process.env.DEVELOPMENT_AVAILABILITY !== 'false'
}

export function releaseExpired(): void {
  // Pending orders deliberately retain their slot until reconciled. Never
  // reassign a potentially paid slot merely because a customer closed their browser.
  run("UPDATE bookings SET status='expired' WHERE status='held' AND expires<?", Math.floor(Date.now() / 1000))
}

export function availabilitySlots(serviceId: string, day: string): { starts_at: string; available: boolean }[] {
  releaseExpired()
  const taken = new Set(
    query<{ starts_at: string }>(
      `SELECT starts_at FROM bookings WHERE status IN (${ACTIVE_STATUSES})`,
    ).map(row => row.starts_at),
  )
  return sampleSlots(serviceId, day).map(slot => ({ starts_at: slot, available: !taken.has(slot) }))
}

/** Validates and reserves a slot transactionally. `mode` is 'demo' or 'held'. */
export function reserve(data: Record<string, unknown>, userId: number | null, mode: 'demo' | 'held'): BookingRow {
  const service = services().find(s => s.id === data.service)
  const startsAt = typeof data.starts_at === 'string' ? data.starts_at : null
  if (!development()) {
    throw new Error('Real availability is not configured. Booking is currently unavailable.')
  }
  if (!service || typeof startsAt !== 'string') {
    throw new Error('Choose a class and an available time.')
  }
  const dayMatch = /^\d{4}-\d{2}-\d{2}$/.exec(startsAt.slice(0, 10))
  if (!dayMatch) throw new Error('Choose a valid date.')
  const day = istDateKey(new Date(`${startsAt.slice(0, 10)}T12:00:00`))
  if (!sampleSlots(service.id, day).includes(startsAt)) {
    throw new Error('This time is unavailable. Please select another slot.')
  }
  if (mode === 'held' && (!service.price_paise || !service.duration_minutes)) {
    throw new Error('Test price and duration must be explicitly configured first.')
  }
  releaseExpired()
  beginImmediate()
  try {
    const existing = queryOne<BookingRow>(
      `SELECT * FROM bookings WHERE starts_at=? AND status IN (${ACTIVE_STATUSES})`,
      startsAt,
    )
    if (existing) {
      commit() // Release the deferred transaction cleanly before the domain error.
      if (existing.user_id === userId && existing.service === service.id) {
        return existing
      }
      throw new Error('This slot was just reserved. Please choose another time.')
    }
    const record: BookingRow = {
      id: randomBytes(16).toString('hex'),
      user_id: userId as number,
      service: service.id,
      starts_at: startsAt,
      status: mode,
      amount: service.price_paise ? service.price_paise + service.tax_paise : null,
      duration: service.duration_minutes,
      currency: 'INR',
      expires: mode === 'held' ? Math.floor(Date.now() / 1000) + 900 : null,
      order_id: null,
      payment_id: null,
      created: Math.floor(Date.now() / 1000),
    }
    run(
      `INSERT INTO bookings(id,user_id,service,starts_at,status,amount,duration,currency,expires,created)
       VALUES($id,$user_id,$service,$starts_at,$status,$amount,$duration,$currency,$expires,$created)`,
      record.id, record.user_id, record.service, record.starts_at, record.status,
      record.amount, record.duration, record.currency, record.expires, record.created,
    )
    commit()
    return record
  } catch (error) {
    rollback()
    throw error
  }
}

/** Confirms a captured payment for a booking, idempotent and safe under concurrency. */
export function confirmPayment(record: BookingRow, payment: Record<string, unknown>): void {
  if (
    payment.order_id !== record.order_id ||
    payment.amount !== record.amount ||
    payment.currency !== 'INR' ||
    payment.status !== 'captured' ||
    typeof payment.id !== 'string'
  ) {
    throw new Error('Payment has not been captured for this order and amount.')
  }
  beginImmediate()
  try {
    const current = queryOne<BookingRow>('SELECT * FROM bookings WHERE id=?', record.id)
    if (!current || !['pending', 'confirmed'].includes(current.status)) {
      commit()
      throw new Error('This booking cannot be confirmed.')
    }
    if (current.payment_id && current.payment_id !== payment.id) {
      commit()
      throw new Error('A different payment has already confirmed this booking.')
    }
    run(
      "UPDATE bookings SET status='confirmed',payment_id=? WHERE id=? AND status IN ('pending','confirmed')",
      payment.id, record.id,
    )
    commit()
  } catch (error) {
    rollback()
    if (String(error).includes('UNIQUE')) {
      throw new Error('This payment has already been processed for another booking.')
    }
    throw error
  }
}

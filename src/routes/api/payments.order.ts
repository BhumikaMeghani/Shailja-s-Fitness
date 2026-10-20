import { createFileRoute } from '@tanstack/react-router'
import { env } from '~/server/env'
import { api, write, type BookingRow } from '~/server/db'
import { reserve } from '~/server/booking'
import { fail, protectedWrite, apiHandler, domainFailure } from '~/server/http'
import { razorpay } from '~/server/razorpay'

export const Route = createFileRoute('/api/payments/order')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const configured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)
        if (!configured) {
          return fail('Razorpay test keys and webhook secret are not configured. Use the demo journey instead.', 503)
        }
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body, session } = guard.ctx
        if (!session.user_id) return fail('Please sign in to continue.', 401)

        let record: BookingRow
        let created: boolean
        try {
          const reserved = await reserve(body, session.user_id, 'held')
          record = reserved.record
          created = reserved.created
        } catch (error) {
          return domainFailure(error, 'Booking failed.')
        }
        if (!created) {
          if (record.order_id && record.status === 'pending') {
            return Response.json({
              order_id: record.order_id, amount: record.amount, currency: 'INR',
              key_id: env.RAZORPAY_KEY_ID, booking: record.id,
            })
          }
          return fail('This selection already has a reservation or an order in progress.', 409)
        }
        // Mark pending BEFORE the external call: ambiguous network failures must
        // not release a slot which might have a successfully created Razorpay order.
        await write(api.studio.markPending, { id: record.id })
        try {
          const order = await razorpay('POST', 'orders', {
            amount: record.amount, currency: 'INR', receipt: record.id,
            notes: { booking_id: record.id },
          })
          if (order.amount !== record.amount || order.currency !== 'INR') {
            throw new Error('Gateway amount mismatch')
          }
          if (typeof order.id !== 'string') throw new Error('Gateway order ID is missing')
          await write(api.studio.attachOrder, { id: record.id, order_id: order.id })
          record.order_id = order.id
        } catch {
          return fail('Test order could not be completed. The slot is held for reconciliation; no payment is confirmed.', 502)
        }
        return Response.json({
          order_id: record.order_id, amount: record.amount, currency: 'INR',
          key_id: env.RAZORPAY_KEY_ID, booking: record.id,
        })
      }),
    },
  },
})

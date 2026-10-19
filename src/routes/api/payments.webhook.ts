import { createFileRoute } from '@tanstack/react-router'
import { createHmac } from 'node:crypto'
import { env } from '~/server/env'
import { queryOne, run, type BookingRow } from '~/server/db'
import { safeEquals } from '~/server/password'
import { fail } from '~/server/http'
import { confirmPayment } from '~/server/booking'

export const Route = createFileRoute('/api/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = env.RAZORPAY_WEBHOOK_SECRET
        if (!secret) return fail('Webhook is not configured.', 503)
        const raw = await request.arrayBuffer()
        const expected = createHmac('sha256', secret).update(Buffer.from(raw)).digest('hex')
        if (!safeEquals(expected, request.headers.get('x-razorpay-signature') || '')) {
          return fail('Invalid webhook signature.', 400)
        }
        let event: unknown
        try {
          event = JSON.parse(Buffer.from(raw).toString('utf-8'))
        } catch {
          event = null
        }
        if (typeof event !== 'object' || event === null || Array.isArray(event)) {
          return fail('Expected a webhook object.')
        }
        const webhook = event as Record<string, unknown>
        // Hash the signed payload: cannot be bypassed by changing an unsigned event ID.
        const eventId = createHmac('sha256', secret).update(Buffer.from(raw)).digest('hex')
        if (queryOne<{ id: string }>('SELECT id FROM webhook_events WHERE id=?', eventId)) {
          return Response.json({ received: true })
        }
        if (webhook.event === 'payment.captured') {
          const envelope = (webhook.payload as Record<string, unknown> | undefined)?.payment as
            | Record<string, unknown>
            | undefined
          const payment = (envelope?.entity ?? {}) as Record<string, unknown>
          const record = queryOne<BookingRow>('SELECT * FROM bookings WHERE order_id=?', String(payment.order_id))
          if (!record) return fail('Order pending reconciliation. Retry delivery.', 503)
          try {
            confirmPayment(record, payment)
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Payment could not be confirmed.', 409)
          }
        }
        run('INSERT OR IGNORE INTO webhook_events VALUES(?,?)', eventId, Math.floor(Date.now() / 1000))
        return Response.json({ received: true })
      },
    },
  },
})

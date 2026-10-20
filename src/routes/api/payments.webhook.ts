import { createFileRoute } from '@tanstack/react-router'
import { createHmac } from 'node:crypto'
import { env } from '~/server/env'
import { api, write } from '~/server/db'
import { safeEquals } from '~/server/password'
import { fail, apiHandler, domainFailure } from '~/server/http'
import { paymentFields } from '~/server/booking'

export const Route = createFileRoute('/api/payments/webhook')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
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
        let payment = null
        if (webhook.event === 'payment.captured') {
          const envelope = (webhook.payload as Record<string, unknown> | undefined)?.payment as
            | Record<string, unknown>
            | undefined
          try {
            payment = paymentFields(envelope?.entity)
          } catch (error) {
            return domainFailure(error, 'Payment could not be confirmed.')
          }
        }
        try {
          if (!await write(api.studio.webhook, { event_id: eventId, payment })) {
            return fail('Order pending reconciliation. Retry delivery.', 503)
          }
        } catch (error) {
          return domainFailure(error, 'Payment could not be confirmed.')
        }
        return Response.json({ received: true })
      }),
    },
  },
})

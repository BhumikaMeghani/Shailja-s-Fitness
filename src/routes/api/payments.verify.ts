import { createFileRoute } from '@tanstack/react-router'
import { api, read } from '~/server/db'
import { env } from '~/server/env'
import { safeEquals } from '~/server/password'
import { createHmac } from 'node:crypto'
import { fail, protectedWrite, apiHandler, domainFailure } from '~/server/http'
import { razorpay } from '~/server/razorpay'
import { confirmPayment } from '~/server/booking'

export const Route = createFileRoute('/api/payments/verify')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body, session } = guard.ctx
        if (!session.user_id) return fail('Please sign in to continue.', 401)

        if (typeof body.booking !== 'string') {
          return fail('A booking reference is required.')
        }
        const record = await read(api.studio.getBooking, { id: body.booking, user_id: session.user_id })
        if (!record || !record.order_id) return fail('Test order not found.', 404)

        const paymentId = body.razorpay_payment_id
        const signature = body.razorpay_signature
        if (
          typeof paymentId !== 'string' ||
          !/^pay_[A-Za-z0-9_]{1,100}$/.test(paymentId) ||
          typeof signature !== 'string'
        ) {
          return fail('Payment verification details are missing.')
        }
        const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
          .update(`${record.order_id}|${paymentId}`)
          .digest('hex')
        if (body.razorpay_order_id !== record.order_id || !safeEquals(expected, signature)) {
          return fail('Invalid payment signature. No payment was confirmed.', 400)
        }
        let payment: Record<string, unknown>
        try {
          payment = await razorpay('GET', `payments/${paymentId}`)
        } catch {
          return fail('Verification is pending. Check the booking status shortly.', 502)
        }
        if (payment.status !== 'captured') {
          return Response.json({
            status: 'pending',
            message: 'Awaiting test payment capture. Your booking is not confirmed.',
          })
        }
        try {
          await confirmPayment(record, payment)
        } catch (error) {
          return domainFailure(error, 'Payment verification failed.')
        }
        return Response.json({
          status: 'confirmed',
          message: 'Razorpay TEST payment verified. This is not a real appointment.',
        })
      }),
    },
  },
})

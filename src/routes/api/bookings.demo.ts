import { createFileRoute } from '@tanstack/react-router'
import { fail, protectedWrite } from '~/server/http'
import { reserve, development } from '~/server/booking'

export const Route = createFileRoute('/api/bookings/demo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body, session } = guard.ctx

        if (!session.user_id) {
          return fail('Please sign in to continue.', 401)
        }

        let record
        try {
          record = reserve(body, session.user_id, 'demo')
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Booking failed.', 409)
        }
        if (record.status !== 'demo') {
          return fail('A test payment already exists for this slot. Check its status.', 409)
        }
        return Response.json({
          booking: record.id,
          status: 'demo',
          message: 'Demo reservation only. Not a real appointment. No payment taken.',
        })
      },
    },
  },
})

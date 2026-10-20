import { createFileRoute } from '@tanstack/react-router'
import { api, read } from '~/server/db'
import { currentSession } from '~/server/session'
import { fail, apiHandler } from '~/server/http'

export const Route = createFileRoute('/api/bookings/$bookingId')({
  server: {
    handlers: {
      GET: apiHandler(async ({ request, params }) => {
        const session = await currentSession(request)
        if (!session || !session.user_id) {
          return fail('Please sign in to continue.', 401)
        }
        const record = await read(api.studio.getBooking, {
          id: params.bookingId, user_id: session.user_id,
        })
        if (!record) return fail('Booking not found.', 404)
        return Response.json({ id: record.id, status: record.status })
      }),
    },
  },
})

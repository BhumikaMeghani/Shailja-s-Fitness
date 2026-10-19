import { createFileRoute } from '@tanstack/react-router'
import { queryOne, type BookingRow } from '~/server/db'
import { currentSession } from '~/server/session'
import { fail } from '~/server/http'

export const Route = createFileRoute('/api/bookings/$bookingId')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const session = currentSession(request)
        if (!session || !session.user_id) {
          return fail('Please sign in to continue.', 401)
        }
        const record = queryOne<BookingRow>(
          'SELECT id,status FROM bookings WHERE id=? AND user_id=?',
          params.bookingId, session.user_id,
        )
        if (!record) return fail('Booking not found.', 404)
        return Response.json({ id: record.id, status: record.status })
      },
    },
  },
})

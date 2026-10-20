import { createFileRoute } from '@tanstack/react-router'
import { services } from '~/server/env'
import { fail, apiHandler } from '~/server/http'
import { development, availabilitySlots } from '~/server/booking'

export const Route = createFileRoute('/api/availability')({
  server: {
    handlers: {
      GET: apiHandler(async ({ request }) => {
        const url = new URL(request.url)
        const service = url.searchParams.get('service') || ''
        if (!services().some(s => s.id === service)) {
          return fail('Choose a valid class.')
        }
        const day = url.searchParams.get('date') || ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00`).getTime())) {
          return fail('Choose a valid date.')
        }
        if (!development()) {
          return Response.json({ slots: [], development: false, message: 'Real studio availability is not connected yet.' })
        }
        return Response.json({ slots: await availabilitySlots(service, day), development: true })
      }),
    },
  },
})

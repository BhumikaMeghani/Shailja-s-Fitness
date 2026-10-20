import { createFileRoute } from '@tanstack/react-router'
import { api, write, DatabaseUnavailable } from '~/server/db'
import { QUERY_RECIPIENT, mailtoFallback, sendQuery, type QueryDetails } from '~/server/mailer'
import { fail, limited, clientIp, apiHandler, protectedWrite } from '~/server/http'

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body } = guard.ctx

        // Any live session may submit; booking an account is not required.
        const nameRaw = body.name
        const addressRaw = body.address
        const emailRaw = body.email
        const mobileRaw = body.mobile
        const messageRaw = body.message
        if (typeof nameRaw !== 'string' || typeof addressRaw !== 'string' ||
            typeof mobileRaw !== 'string' || typeof messageRaw !== 'string') {
          return fail('Please fill in every field before submitting.')
        }
        if (emailRaw !== undefined && emailRaw !== null && typeof emailRaw !== 'string') {
          return fail('Enter a valid email address.')
        }

        const name = nameRaw.trim()
        const address = addressRaw.trim()
        const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''
        const mobile = mobileRaw.replace(/\s+/g, ' ').trim()
        const message = messageRaw.trim()
        if (name.length < 2 || name.length > 80) return fail('Enter a name between 2 and 80 characters.')
        if (address.length < 5 || address.length > 300) return fail('Enter an address between 5 and 300 characters.')
        // The dial code plus digits; spaces and dashes are tolerated.
        if (!/^\+?[0-9][0-9\s-]{5,19}$/.test(mobile)) return fail('Enter a valid mobile number.')
        if (message.length < 5 || message.length > 2000) return fail('Enter a message between 5 and 2000 characters.')
        if (email && (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
          return fail('Enter a valid email address.')
        }

        if (await limited(`contact:${clientIp(request)}`, 5)) {
          return fail('Too many messages. Please try again in 15 minutes.', 429)
        }

        const details: QueryDetails = { name, address, email, mobile, message }
        try {
          await write(api.studio.submitQuery, {
            name: details.name, address: details.address,
            email: details.email || null, mobile: details.mobile, message: details.message,
          })
        } catch (error) {
          if (error instanceof DatabaseUnavailable) return fail(error.message, 503)
          return fail('Saving your query failed. Please try again shortly.', 503)
        }
        // Every saved query is emailed to the studio from the server itself.
        const { delivered } = await sendQuery(details)
        return Response.json({
          ok: true, delivered, recipient: QUERY_RECIPIENT,
          ...(delivered ? {} : { mailto: mailtoFallback(details) }),
        })
      }),
    },
  },
})

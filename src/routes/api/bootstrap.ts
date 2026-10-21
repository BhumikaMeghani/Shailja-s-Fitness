import { createFileRoute } from '@tanstack/react-router'
import { env, contact, services } from '~/server/env'
import { apiHandler } from '~/server/http'
import { development } from '~/server/booking'
import { currentSessionContext, newSession, sessionCookieHeader } from '~/server/session'
import { istDateKey, nowIst } from '~/server/slots'

export const Route = createFileRoute('/api/bootstrap')({
  server: {
    handlers: {
      GET: apiHandler(async ({ request }) => {
        const current = await currentSessionContext(request)
        let token: string | null = null
        let csrf: string
        let user: { email: string } | null = null
        if (!current) {
          const fresh = await newSession(null, request)
          token = fresh.token
          csrf = fresh.csrf
        } else {
          csrf = current.session.csrf
          user = current.user
        }
        const payload = {
          csrf,
          user,
          services: services(),
          development: development(),
          today: istDateKey(nowIst()),
          timezone: 'Asia/Kolkata',
          payments_configured: Boolean(
            env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET,
          ),
          contact,
        }
        return token
          ? Response.json(payload, { headers: { 'Set-Cookie': sessionCookieHeader(token) } })
          : Response.json(payload)
      }),
    },
  },
})

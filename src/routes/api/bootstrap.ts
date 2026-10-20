import { createFileRoute } from '@tanstack/react-router'
import { env, contact, services } from '~/server/env'
import { api, read } from '~/server/db'
import { apiHandler } from '~/server/http'
import { development } from '~/server/booking'
import { currentSession, newSession, sessionCookieHeader } from '~/server/session'
import { istDateKey, nowIst } from '~/server/slots'

export const Route = createFileRoute('/api/bootstrap')({
  server: {
    handlers: {
      GET: apiHandler(async ({ request }) => {
        const current = await currentSession(request)
        let token: string | null = null
        let csrf: string
        let user: { email: string } | null = null
        if (!current) {
          const fresh = await newSession(null, request)
          token = fresh.token
          csrf = fresh.csrf
        } else {
          csrf = current.csrf
          const row = current.user_id
            ? await read(api.studio.getUser, { field: 'id', value: current.user_id })
            : null
          user = row ? { email: row.email } : null
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

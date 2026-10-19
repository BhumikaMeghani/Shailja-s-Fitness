import { createFileRoute } from '@tanstack/react-router'
import { env, contact, services } from '~/server/env'
import { queryOne } from '~/server/db'
import { development } from '~/server/booking'
import { currentSession, newSession, sessionCookieHeader } from '~/server/session'
import { istDateKey, nowIst } from '~/server/slots'
import type { UserRow } from '~/server/db'

export const Route = createFileRoute('/api/bootstrap')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const current = currentSession(request)
        let token: string | null = null
        let csrf: string
        let user: { email: string } | null = null
        if (!current) {
          const fresh = newSession(null, request)
          token = fresh.token
          csrf = fresh.csrf
        } else {
          csrf = current.csrf
          const row = current.user_id
            ? queryOne<UserRow>('SELECT email FROM users WHERE id=?', current.user_id)
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
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { api, read, write } from '~/server/db'
import { randomBytes } from 'node:crypto'
import { hashPassword, verifyWerkzeugHash, sha256Hex } from '~/server/password'
import { newSession, sessionCookieHeader } from '~/server/session'
import { fail, limited, clientIp, hashEmail, protectedWrite, apiHandler } from '~/server/http'

// A real password hash for unknown accounts avoids an obvious timing discrepancy.
let DUMMY_HASH: string | null = null
function dummyHash(): string {
  if (!DUMMY_HASH) DUMMY_HASH = hashPassword(sha256Hex(String(Math.random())))
  return DUMMY_HASH
}

export const Route = createFileRoute('/api/auth/$action')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request, params }) => {
        const action = params.action
        if (!['register', 'login', 'logout'].includes(action)) {
          return fail('Unknown authentication action.', 404)
        }
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body } = guard.ctx

        if (action === 'logout') {
          const fresh = await newSession(null, request)
          return Response.json({ csrf: fresh.csrf, user: null }, { headers: { 'Set-Cookie': sessionCookieHeader(fresh.token) } })
        }

        const emailRaw = body.email
        const passwordRaw = body.password
        if (typeof emailRaw !== 'string' || typeof passwordRaw !== 'string') {
          return fail('Enter an email and password.')
        }
        const email = emailRaw.trim().toLowerCase()
        // Rate-limit IP and normalized account independently, including successful attempts.
        if (await limited(`ip:${clientIp(request)}`, 30) || await limited(`email:${hashEmail(email)}`, 10)) {
          return fail('Too many attempts. Please try again in 15 minutes.', 429)
        }
        if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return fail('Enter a valid email address.')
        }
        if (passwordRaw.length < 12 || passwordRaw.length > 128) {
          return fail('Use a password between 12 and 128 characters.')
        }

        let userId: string
        if (action === 'register') {
          const id = await write(api.studio.register, {
            id: randomBytes(16).toString('hex'), email, password_hash: hashPassword(passwordRaw),
          })
          if (!id) {
            return fail('Unable to create this account. Try signing in instead.', 409)
          }
          userId = id
        } else {
          const row = await read(api.studio.getUser, { field: 'email', value: email })
          const valid = verifyWerkzeugHash(row ? row.password_hash : dummyHash(), passwordRaw)
          if (!row || !valid) {
            return fail('Email or password is incorrect.', 401)
          }
          userId = row.id
        }
        const fresh = await newSession(userId, request)
        return Response.json(
          { user: { email }, csrf: fresh.csrf },
          { headers: { 'Set-Cookie': sessionCookieHeader(fresh.token) } },
        )
      }),
    },
  },
})

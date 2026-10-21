import { createFileRoute } from '@tanstack/react-router'
import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { api, read, write } from '~/server/db'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '~/server/password'
import { newSession, sessionCookieHeader } from '~/server/session'
import { apiHandler, fail, protectedWrite } from '~/server/http'

/**
 * Bridges a verified Clerk identity into the site's HttpOnly server session so
 * booking endpoints can attribute appointments to a studio account. The studio
 * row is linked (or created without a usable password) so email+password
 * sign-in stays exclusive to Clerk on the /sign-in page.
 */
export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response

        let clerkUserId = ''
        try {
          clerkUserId = (await auth()).userId ?? ''
        } catch {
          // Clerk middleware is optional; without keys there is nothing to bridge.
        }
        if (!clerkUserId) return fail('Please sign in before continuing.', 401)

        let email: string | null | undefined
        try {
          const clerkUser = await clerkClient().users.getUser(clerkUserId)
          const primary = clerkUser.primaryEmailAddress
          email = typeof primary === 'string'
            ? primary
            : primary?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress
        } catch {
          return fail('Your account could not be verified. Please try again.', 503)
        }
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return fail('Add an email address to your account to continue.', 422)
        }
        const normalized = email.trim().toLowerCase()

        const existing = await read(api.studio.getUser, { field: 'email', value: normalized })
        let userId = existing?.id ?? ''
        if (!userId) {
          // A random registered hash keeps the stored schema intact while the
          // password itself can never sign in.
          userId = (await write(api.studio.register, {
            id: randomBytes(16).toString('hex'),
            email: normalized,
            password_hash: hashPassword(randomBytes(24).toString('hex')),
          })) ?? ''
        }
        if (!userId) {
          // Race guard: another request may have registered the same email.
          const reread = await read(api.studio.getUser, { field: 'email', value: normalized })
          userId = reread?.id ?? ''
        }
        if (!userId) return fail('Connecting your account failed. Please try again.', 503)

        const fresh = await newSession(userId, request)
        return Response.json(
          { user: { email: normalized }, csrf: fresh.csrf },
          { headers: { 'Set-Cookie': sessionCookieHeader(fresh.token) } },
        )
      }),
    },
  },
})

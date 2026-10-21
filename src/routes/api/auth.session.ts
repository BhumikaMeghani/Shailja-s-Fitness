import { createFileRoute } from '@tanstack/react-router'
import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { api, write } from '~/server/db'
import { randomBytes } from 'node:crypto'
import { newSession, sessionCookieHeader } from '~/server/session'
import { apiHandler, domainFailure, fail, protectedWrite } from '~/server/http'

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

        let email: string | undefined
        try {
          const clerkUser = await clerkClient().users.getUser(clerkUserId)
          // An unverified email must never claim an existing local account.
          const primary = clerkUser.emailAddresses.find(address =>
            address.id === clerkUser.primaryEmailAddressId)
          if (primary?.verification?.status === 'verified') email = primary.emailAddress
        } catch {
          return fail('Your account could not be verified. Please try again.', 503)
        }
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return fail('Verify your primary email address to continue.', 422)
        }
        const normalized = email.trim().toLowerCase()

        let account: { id: string; email: string }
        try {
          account = await write(api.studio.linkClerkAccount, {
            clerk_user_id: clerkUserId, email: normalized,
            new_user_id: randomBytes(16).toString('hex'),
          })
        } catch (error) {
          return domainFailure(error, 'Connecting your account failed. Please try again.')
        }

        const fresh = await newSession(account.id, request)
        return Response.json(
          { user: { email: account.email }, csrf: fresh.csrf },
          { headers: { 'Set-Cookie': sessionCookieHeader(fresh.token) } },
        )
      }),
    },
  },
})

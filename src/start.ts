/**
 * Start instance. This file replaces TanStack Start's default CSRF-only
 * middleware chain, so createCsrfMiddleware is listed explicitly, followed by
 * Clerk's request middleware which makes auth() available server-side.
 *
 * Clerk only activates once both keys exist in the environment; the site
 * keeps working without them and the Bootcamp sign-in gate turns on
 * automatically when they are present.
 */
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => {
  const clerkConfigured =
    Boolean(process.env.VITE_CLERK_PUBLISHABLE_KEY) && Boolean(process.env.CLERK_SECRET_KEY)
  return {
    requestMiddleware: [
      csrfMiddleware,
      ...(clerkConfigured ? [clerkMiddleware({ signInUrl: '/sign-in', signUpUrl: '/sign-up' })] : []),
    ],
  }
})

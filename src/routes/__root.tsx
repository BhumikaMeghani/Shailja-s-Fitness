import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { SiteAuthProvider } from '~/components/SiteAuth'
import styles from '~/styles.css?url'
import bpWellnessStyles from '~/bp-wellness.css?url'

// Clerk renders only when configured; without a publishable key the site
// runs exactly as before and no auth context is mounted.
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// The Clerk instance name is generic ("Something"); brand the sign-in card itself.
const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Shailja’s Fitness',
    },
  },
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#efe6da' },
      {
        name: 'description',
        content: 'Find your balance, build your strength, feel your best at Shailja’s Fitness. Yoga, Zumba, dance, fitness and weight loss — celebrating 7+ years of wellness.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'stylesheet', href: bpWellnessStyles },
      { rel: 'icon', href: '/brand.svg', type: 'image/svg+xml' },
    ],
    title: 'Shailja’s Fitness — A little stronger. A little more you.',
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {clerkPublishableKey
          ? <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" localization={clerkLocalization}><SiteAuthProvider>{children}</SiteAuthProvider></ClerkProvider>
          : <SiteAuthProvider>{children}</SiteAuthProvider>}
        <Scripts />
      </body>
    </html>
  )
}

export default function RootRoute() {
  return <Outlet />
}

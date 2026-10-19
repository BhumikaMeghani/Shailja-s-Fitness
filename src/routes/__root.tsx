import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import styles from '~/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#16877F' },
      {
        name: 'description',
        content: 'Make space for yourself at Shailja’s Fitness. Explore yoga, movement and wellness, and discover your next step.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
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
        {children}
        <Scripts />
      </body>
    </html>
  )
}

export default function RootRoute() {
  return <Outlet />
}

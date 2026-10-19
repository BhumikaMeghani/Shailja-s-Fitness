import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

// Security headers mirror the Flask configuration. Script sources include
// inline scripts because SSR hydration embeds an inline serialization payload,
// plus Razorpay Checkout. API responses are marked no-store.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://*.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-src https://*.razorpay.com",
    "connect-src 'self' https://*.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
}

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    nitro({
      routeRules: {
        '/**': { headers: securityHeaders },
        '/api/**': {
          headers: { ...securityHeaders, 'Cache-Control': 'no-store' },
        },
      },
    }),
  ],
})

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

/* Clerk adds its Frontend API (+clerk.accounts.dev), clerk.com asset
 * endpoints, and the telemetry collector to the base sources. */
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://*.razorpay.com https://*.clerk.accounts.dev https://*.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    // Plan exports decode locally fetched photos through blob URLs before
    // drawing thumbnails on a canvas. This does not permit blob scripts.
    "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.accounts.dev",
    "frame-src https://*.razorpay.com https://www.google.com https://maps.google.com https://*.clerk.accounts.dev",
    "connect-src 'self' https://*.razorpay.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.telemetry.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.clerk.accounts.dev",
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
        // Only content-hashed derivatives are immutable. Original image URLs
        // remain replaceable, and private API responses are never cached.
        '/optimized/**': {
          headers: { ...securityHeaders, 'Cache-Control': 'public, max-age=31536000, immutable' },
        },
        '/api/**': {
          headers: { ...securityHeaders, 'Cache-Control': 'no-store' },
        },
      },
    }),
  ],
})

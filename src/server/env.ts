/**
 * Environment configuration, ported from the Flask create_app() config.
 * A small .env loader keeps the same behaviour: the process environment wins.
 * No secrets are logged.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_DURATION_DAYS } from '../lib/plans'

function loadEnvironment(): void {
  for (const name of ['.env', '.env.local']) {
    const path = join(process.cwd(), name)
    try {
    const text = readFileSync(path, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      const value = rest.join('=').replace(/^["']|["']$/g, '')
      if (process.env[key.trim()] === undefined) process.env[key.trim()] = value
    }
    } catch {
      // Missing optional files are fine; process environment wins.
    }
  }
}

loadEnvironment()

export const env = {
  APP_ENV: process.env.APP_ENV || 'development',
  CONVEX_URL: process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || '',
  CONVEX_SERVER_KEY: process.env.CONVEX_SERVER_KEY || '',
  SECRET_KEY: process.env.SECRET_KEY || '',

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  DEVELOPMENT_AVAILABILITY: (process.env.DEVELOPMENT_AVAILABILITY || 'true').toLowerCase() === 'true',

  STUDIO_EMAIL: process.env.STUDIO_EMAIL || '',
  STUDIO_PHONE: process.env.STUDIO_PHONE || '',
  STUDIO_ADDRESS: process.env.STUDIO_ADDRESS || '',

  // Gmail SMTP delivery for contact queries. SMTP_USER is the sending Gmail
  // account; SMTP_APP_PASSWORD is an App Password, never the login password.
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number.parseInt(process.env.SMTP_PORT || '465', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD || '',
  CONTACT_NOTIFY_EMAIL: process.env.CONTACT_NOTIFY_EMAIL || '',
}

export const production = env.APP_ENV !== 'development'

if (production && env.SECRET_KEY.length < 32) {
  throw new Error('Set a strong SECRET_KEY before production deployment.')
}
if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
  throw new Error('Only Razorpay TEST keys are supported.')
}

export const contact = {
  email: env.STUDIO_EMAIL,
  phone: env.STUDIO_PHONE,
  address: env.STUDIO_ADDRESS,
}

export interface Service {
  id: string
  name: string
  description: string
  icon: string
  /** Class formats have no price of their own; booking prices come from the plan. */
  price_paise: number | null
  duration_days: number
  currency: string
}

/** The three class formats offered in the booking dialog. The six yoga plans
 * (src/lib/plans.ts) add the price; plan does not depend on the format. */
export function services(): Service[] {
  return [
    ['online', 'Online Live Class', 'A little space for wellness, wherever you are.', 'video'],
    ['studio', 'Studio Class', 'Make room for movement in a shared studio setting.', 'home'],
    ['private', 'Private Class', 'Explore a more personal approach to your practice.', 'user'],
  ].map(([id, name, description, icon]) => ({
    id,
    name,
    description,
    icon,
    price_paise: null,
    duration_days: PLAN_DURATION_DAYS,
    currency: 'INR',
  }))
}

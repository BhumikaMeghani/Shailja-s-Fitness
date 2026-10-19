/**
 * Environment configuration, ported from the Flask create_app() config.
 * A small .env loader keeps the same behaviour: the process environment wins.
 * No secrets are logged.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvironment(): void {
  const path = join(process.cwd(), '.env')
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
    // No .env file is fine; defaults apply.
  }
}

loadEnvironment()

export const env = {
  APP_ENV: process.env.APP_ENV || 'development',
  DATABASE: process.env.DATABASE || join(process.cwd(), 'instance', 'studio.sqlite3'),
  SECRET_KEY: process.env.SECRET_KEY || '',

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  DEVELOPMENT_AVAILABILITY: (process.env.DEVELOPMENT_AVAILABILITY || 'true').toLowerCase() === 'true',

  STUDIO_EMAIL: process.env.STUDIO_EMAIL || '',
  STUDIO_PHONE: process.env.STUDIO_PHONE || '',
  STUDIO_ADDRESS: process.env.STUDIO_ADDRESS || '',
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
  price_paise: number | null
  duration_minutes: number | null
  currency: string
  tax_paise: number
}

/** Single source for service information. None means not yet supplied, never free. */
function optionalInt(name: string): number | null {
  const raw = (process.env[name] || '').trim()
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

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
    price_paise: optionalInt(`${id.toUpperCase()}_TEST_PRICE_PAISE`),
    duration_minutes: optionalInt(`${id.toUpperCase()}_DURATION_MINUTES`),
    currency: 'INR',
    tax_paise: optionalInt(`${id.toUpperCase()}_TEST_TAX_PAISE`) || 0,
  }))
}

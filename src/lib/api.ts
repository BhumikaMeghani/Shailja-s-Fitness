/**
 * Shared HTTP state; authentication lives exclusively in an HttpOnly server
 * session. Mirrors window.Studio from the previous implementation.
 */
export interface Service {
  id: string
  name: string
  description: string
  icon: string
  price_paise: number | null
  duration_days: number
  currency: string
}

export interface BootstrapData {
  csrf: string
  user: { email: string } | null
  services: Service[]
  development: boolean
  today: string
  timezone: string
  payments_configured: boolean
  contact: { email: string; phone: string; address: string }
}

export interface AvailabilityData {
  slots: { starts_at: string; available: boolean }[]
  development: boolean
  message?: string
}

export interface BookingResult {
  booking?: string
  status?: string
  message?: string
  order_id?: string
  amount?: number
  currency?: string
  key_id?: string
}

let csrf = ''

export function setCsrf(value: string): void {
  csrf = value
}

export async function api<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    signal,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as { error?: string }).error || 'Something went wrong. Please try again.'
    throw new Error(message)
  }
  return data as T
}

async function fetchBootstrap(): Promise<BootstrapData> {
  const data = await api<BootstrapData>('/api/bootstrap')
  setCsrf(data.csrf)
  return data
}

let bootstrapInFlight: Promise<BootstrapData> | undefined

/** Share simultaneous browser requests, not completed responses or SSR user data. */
export function loadBootstrap(): Promise<BootstrapData> {
  if (typeof window === 'undefined') return fetchBootstrap()
  return bootstrapInFlight ??= fetchBootstrap().finally(() => {
    bootstrapInFlight = undefined
  })
}

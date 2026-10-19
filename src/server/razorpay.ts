/**
 * Razorpay TEST-only API client. Credentials never leave the server.
 */
import { env } from './env'

export async function razorpay(method: 'POST' | 'GET', path: string, body?: unknown): Promise<Record<string, unknown>> {
  const credentials = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const error = new Error(`Razorpay ${method} ${path} failed (${response.status})`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.json() as Promise<Record<string, unknown>>
}

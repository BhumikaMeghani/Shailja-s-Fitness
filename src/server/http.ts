/**
 * API helpers: JSON responses, security headers, CSRF write protection,
 * and rate limiting ported from the Flask implementation.
 */
import { api, write, DatabaseUnavailable, type SessionRow } from './db'
import { safeEquals, sha256Hex } from './password'
import { currentSession } from './session'

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** One transport/configuration error boundary shared by every API route. */
export function apiHandler(handler: (ctx: {
  request: Request; params: Record<string, string>
}) => Response | Promise<Response>) {
  return async (ctx: { request: Request; params: Record<string, string> }): Promise<Response> => {
    try {
      return await handler(ctx)
    } catch (error) {
      if (error instanceof DatabaseUnavailable) return fail(error.message, 503)
      console.error('API request failed:', error instanceof Error ? error.name : 'unknown')
      return fail('The request could not be completed. Please try again.', 500)
    }
  }
}

export function domainFailure(error: unknown, fallback: string, status = 409): Response {
  if (error instanceof DatabaseUnavailable) return fail(error.message, 503)
  return fail(error instanceof Error ? error.message : fallback, status)
}

export function withCookie(response: Response, setCookieHeader: string): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', setCookieHeader)
  return new Response(response.body, { status: response.status, headers })
}

export interface WriteContext {
  request: Request
  session: SessionRow
  body: Record<string, unknown>
}

/**
 * Protects every POST except the webhook: a live session, matching CSRF
 * header, and a JSON object body are required, mirroring the Flask guards.
 */
export async function protectedWrite(request: Request): Promise<{ ok: true; ctx: WriteContext } | { ok: false; response: Response }> {
  const session = await currentSession(request)
  if (!session || !safeEquals(request.headers.get('x-csrf-token') || '', session.csrf)) {
    return { ok: false, response: fail('Your session expired. Refresh the page and try again.', 403) }
  }
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { ok: false, response: fail('Expected a JSON request.', 415) }
  }
  if ((Number(request.headers.get('content-length')) || 0) > 32 * 1024) {
    return { ok: false, response: fail('Request too large.', 413) }
  }
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, response: fail('Expected a JSON object.') }
    }
    body = parsed as Record<string, unknown>
  } catch {
    return { ok: false, response: fail('Expected a JSON object.') }
  }
  return { ok: true, ctx: { request, session, body } }
}

/** Rate-limit IP and normalized account independently, including successful attempts. */
export function limited(bucket: string, maximum = 10, window = 900): Promise<boolean> {
  return write(api.studio.limited, { bucket, maximum, window })
}

export function clientIp(request: Request): string {
  // Never trust arbitrary X-Forwarded-For; only use the direct remote address.
  return (request as Request & { ip?: string }).ip || 'unknown'
}

export function hashEmail(email: string): string {
  return sha256Hex(email)
}

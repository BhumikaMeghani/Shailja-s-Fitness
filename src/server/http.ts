/**
 * API helpers: JSON responses, security headers, CSRF write protection,
 * and rate limiting ported from the Flask implementation.
 */
import { beginImmediate, commit, rollback, run, queryOne, type SessionRow } from './db'
import { safeEquals, sha256Hex } from './password'
import { currentSession } from './session'

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
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
  const session = currentSession(request)
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
export function limited(bucket: string, maximum = 10, window = 900): boolean {
  const now = Math.floor(Date.now() / 1000)
  beginImmediate()
  try {
    run('DELETE FROM attempts WHERE created<?', now - 86_400)
    const row = queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM attempts WHERE bucket=? AND created>?',
      bucket, now - window,
    )
    if ((row?.c ?? 0) >= maximum) {
      commit()
      return true
    }
    run('INSERT INTO attempts VALUES(?,?)', bucket, now)
    commit()
    return false
  } catch (error) {
    rollback()
    throw error
  }
}

export function clientIp(request: Request): string {
  // Never trust arbitrary X-Forwarded-For; only use the direct remote address.
  return (request as Request & { ip?: string }).ip || 'unknown'
}

export function hashEmail(email: string): string {
  return sha256Hex(email)
}

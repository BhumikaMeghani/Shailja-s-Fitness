/**
 * Cookie/session helpers. Sessions are opaque, random and hashed in the
 * database; authentication lives exclusively in an HttpOnly server session.
 */
import { randomBytes } from 'node:crypto'
import { production } from './env'
import { api, read, write, type SessionRow } from './db'
import { sha256Hex } from './password'

export const SESSION_COOKIE = 'studio_session'

export function parseCookie(header: string | null, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${production ? 'Secure; ' : ''}SameSite=Lax; Max-Age=86400; Path=/`
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; ${production ? 'Secure; ' : ''}SameSite=Lax; Max-Age=0; Path=/`
}

export async function currentSession(request: Request): Promise<SessionRow | null> {
  const token = parseCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (!token) return null
  return read(api.studio.getSession, {
    token_hash: sha256Hex(token), now: Math.floor(Date.now() / 1000),
  })
}

/** Fresh account/session data in a single Convex call; never cached across requests. */
export async function currentSessionContext(request: Request) {
  const token = parseCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (!token) return null
  return read(api.studio.getSessionContext, {
    token_hash: sha256Hex(token), now: Math.floor(Date.now() / 1000),
  })
}

export async function newSession(user_id: string | null, request: Request): Promise<{ token: string; csrf: string }> {
  const token = Buffer.from(randomBytes(32)).toString('base64url')
  const csrf = Buffer.from(randomBytes(32)).toString('base64url')
  const old = parseCookie(request.headers.get('cookie'), SESSION_COOKIE)
  const now = Math.floor(Date.now() / 1000)
  await write(api.studio.rotateSession, {
    old_hash: sha256Hex(old),
    record: { token_hash: sha256Hex(token), user_id, csrf, expires: now + 86_400 },
  })
  return { token, csrf }
}

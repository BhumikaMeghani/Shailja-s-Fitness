/**
 * Cookie/session helpers. Sessions are opaque, random and hashed in the
 * database; authentication lives exclusively in an HttpOnly server session.
 */
import { randomBytes } from 'node:crypto'
import { production } from './env'
import { queryOne, run, beginImmediate, commit, rollback, type SessionRow } from './db'
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

export function currentSession(request: Request): SessionRow | null {
  const token = parseCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (!token) return null
  return queryOne<SessionRow>(
    'SELECT * FROM sessions WHERE token_hash=? AND expires>?',
    sha256Hex(token),
    Math.floor(Date.now() / 1000),
  )
}

export function newSession(user_id: number | null, request: Request): { token: string; csrf: string } {
  const token = Buffer.from(randomBytes(32)).toString('base64url')
  const csrf = Buffer.from(randomBytes(32)).toString('base64url')
  const old = parseCookie(request.headers.get('cookie'), SESSION_COOKIE)
  const now = Math.floor(Date.now() / 1000)
  beginImmediate()
  try {
    run('DELETE FROM sessions WHERE token_hash=? OR expires<?', sha256Hex(old), now)
    run('INSERT INTO sessions VALUES(?,?,?,?)', sha256Hex(token), user_id, csrf, now + 86_400)
    commit()
  } catch (error) {
    rollback()
    throw error
  }
  return { token, csrf }
}

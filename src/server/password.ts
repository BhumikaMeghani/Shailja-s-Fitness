/**
 * Password hashing compatible with Werkzeug's scrypt format, so accounts
 * created by the previous Flask app keep signing in: scrypt:32768:8:1$<salt>$<hex>.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 } as const
// Werkzeug allows headroom above the theoretical 128*N*r minimum; Node's
// default maxmem sits exactly at that minimum and aborts the derivation.
const MAXMEM = 176 * SCRYPT.N * SCRYPT.r

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: MAXMEM,
  })
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}$${salt}$${key.toString('hex')}`
}

export function verifyWerkzeugHash(stored: string, password: string): boolean {
  const [method, salt, checksum] = stored.split('$', 3)
  if (!salt || !/^[0-9a-f]{128}$/i.test(checksum || '') || !method.startsWith('scrypt:')) return false
  const [, n, r, p] = method.split(':')
  if (Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p) return false
  const derive = (bytes: string | Buffer) => scryptSync(password, bytes, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM,
  })
  const expected = Buffer.from(checksum, 'hex')
  // Werkzeug uses the literal salt; the initial Bun port decoded it instead.
  // Keep that fallback so accounts created by either implementation still work.
  return safeEquals(expected, derive(salt)) || safeEquals(expected, derive(Buffer.from(salt, 'base64')))
}

export function safeEquals(a: Buffer | string, b: Buffer | string): boolean {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a)
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

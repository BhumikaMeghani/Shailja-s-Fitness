/**
 * SQLite access via Bun's built-in bun:sqlite, same schema as the Flask app.
 * A single synchronous connection is appropriate for this small preview.
 */
import { Database } from 'bun:sqlite'
import { env } from './env'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    csrf TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
    bucket TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempt_lookup ON attempts(bucket, created);
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    service TEXT NOT NULL, starts_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('demo','held','pending','confirmed','expired')),
    amount INTEGER, duration INTEGER, currency TEXT NOT NULL DEFAULT 'INR',
    expires INTEGER, order_id TEXT UNIQUE, payment_id TEXT UNIQUE,
    created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS occupied_slot ON bookings(starts_at)
    WHERE status IN ('demo','held','pending','confirmed');
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL
);`

mkdirSync(dirname(env.DATABASE), { recursive: true })

export const db = new Database(env.DATABASE)
db.exec('PRAGMA foreign_keys = ON')
db.exec(schema)

export interface UserRow {
  id: number
  email: string
  password_hash: string
}

export interface SessionRow {
  token_hash: string
  user_id: number | null
  csrf: string
  expires: number
}

export interface BookingRow {
  id: string
  user_id: number
  service: string
  starts_at: string
  status: string
  amount: number | null
  duration: number | null
  currency: string
  expires: number | null
  order_id: string | null
  payment_id: string | null
  created: number
}

export type SqlValue = string | number | bigint | boolean | null | Uint8Array

export function query<T>(sql: string, ...params: SqlValue[]): T[] {
  return db.query(sql).all(...params) as T[]
}

export function queryOne<T>(sql: string, ...params: SqlValue[]): T | null {
  return (db.query(sql).get(...params) as T) ?? null
}

export function run(sql: string, ...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint } {
  return db.query(sql).run(...params) as { changes: number; lastInsertRowid: number | bigint }
}

export function beginImmediate(): void {
  db.exec('BEGIN IMMEDIATE')
}

export function commit(): void {
  if (db.inTransaction) db.exec('COMMIT')
}

export function rollback(): void {
  if (db.inTransaction) db.exec('ROLLBACK')
}

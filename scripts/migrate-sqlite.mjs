/**
 * Node 22.13+/24: the only SQLite dependency is this read-only cutover tool.
 * Usage: bun run migrate:sqlite -- instance/studio.sqlite3 [--apply]
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api.js'
import { loadEnvironment, readDeploymentSecret } from './convex-environment.mjs'

const tables = ['users', 'sessions', 'attempts', 'bookings', 'webhook_events']
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  )
  return value
}

export function snapshot(source) {
  const path = resolve(source)
  if (!existsSync(path)) throw new Error('SQLite source does not exist; no file was created.')
  const db = new DatabaseSync(path, { readOnly: true })
  let rows
  try {
    db.exec('BEGIN')
    if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok' ||
        db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('SQLite integrity or foreign-key check failed.')
    }
    rows = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]))
  } finally {
    db.close()
  }
  for (const row of rows.users) row.id = String(row.id)
  for (const table of ['sessions', 'bookings'])
    for (const row of rows[table]) if (row.user_id !== null) row.user_id = String(row.user_id)
  for (const table of tables) rows[table].sort((a, b) =>
    JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b)), 'en'))
  const encoded = JSON.stringify(canonical(rows))
  if (Buffer.byteLength(encoded) > 4_000_000 || Object.values(rows).reduce((n, r) => n + r.length, 0) > 4000) {
    throw new Error('Source exceeds the atomic cutover limit; use a reviewed batched migration.')
  }
  return { rows, digest: createHash('sha256').update(encoded).digest('hex') }
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  const source = args.find(arg => !arg.startsWith('--')) || 'instance/studio.sqlite3'
  if (args.some(arg => arg.startsWith('--') && arg !== '--apply')) throw new Error('Unknown option')
  const { rows, digest } = snapshot(source)
  const counts = Object.fromEntries(tables.map(table => [table, rows[table].length]))
  console.log('Source counts:', JSON.stringify(counts))
  console.log('Snapshot SHA256:', digest)
  if (!args.includes('--apply')) {
    console.log('Dry run only. Stop all SQLite writers before applying.')
    return
  }
  loadEnvironment()
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL
  if (!url || !url.startsWith('https://')) throw new Error('Set CONVEX_URL to the intended HTTPS cloud target.')
  const migration_key = process.env.CONVEX_MIGRATION_KEY || readDeploymentSecret('STUDIO_MIGRATION_KEY')
  console.log('Import target:', url)
  const client = new ConvexHttpClient(url, { logger: false })
  const result = await client.mutation(api.migrate.importSqlite, { ...rows, digest, migration_key })
  if (JSON.stringify(canonical(result)) !== JSON.stringify(canonical(counts))) {
    throw new Error('Committed counts differ; keep both databases and investigate.')
  }
  if (snapshot(source).digest !== digest) throw new Error('SQLite changed during cutover. Reconcile before serving traffic.')
  console.log('Verified committed counts:', JSON.stringify(result))
  console.log('Keep the private SQLite backup. Disable STUDIO_MIGRATION_KEY after verification.')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch(() => {
    // Convex errors can contain sensitive arguments; never dump their trace.
    console.error('Migration did not complete verification. Check source, target, credentials and empty-target requirement.')
    process.exitCode = 1
  })
}

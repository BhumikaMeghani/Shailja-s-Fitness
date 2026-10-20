import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export function loadEnvironment() {
  for (const name of ['.env', '.env.local']) {
    if (existsSync(name)) process.loadEnvFile(name)
  }
}

/** Read a dev-deployment secret into memory; never write or print its value. */
export function readDeploymentSecret(name) {
  if (!process.env.CONVEX_DEPLOYMENT?.startsWith('dev:')) {
    throw new Error('CLI secret lookup is development-only. Supply secrets through the server environment.')
  }
  try {
    const value = execFileSync('npx', ['convex', 'env', 'get', name], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (value.length < 32) throw new Error('Secret is missing')
    return value
  } catch {
    throw new Error(`Set ${name} on the selected Convex deployment before continuing.`)
  }
}

export function developmentEnvironment() {
  loadEnvironment()
  if ((process.env.APP_ENV || 'development') !== 'development') {
    throw new Error('Use the production start command with explicit server environment variables.')
  }
  // Use the URL configured by the Convex CLI, not a stale manual shell export.
  process.env.CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL
  if (!process.env.CONVEX_URL) throw new Error('Configure the Convex deployment first.')
  process.env.CONVEX_SERVER_KEY ||= readDeploymentSecret('STUDIO_SERVER_KEY')
}

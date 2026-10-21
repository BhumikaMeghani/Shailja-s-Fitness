import { afterEach, describe, expect, test, vi } from 'vitest'

/** The availability gate parses the environment once at module load, so each
 * case re-imports with the environment set, then cleans up. */
async function loadEnv(overrides: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value
  try {
    return await import('./env')
  } finally {
    for (const key of Object.keys(overrides)) delete process.env[key]
  }
}

describe('availability gate', () => {
  const cases: [Record<string, string>, boolean][] = [
    [{}, true],
    [{ APP_ENV: 'production' }, false],
    [{ APP_ENV: 'production', DEVELOPMENT_AVAILABILITY: 'true' }, true],
    [{ APP_ENV: 'production', DEVELOPMENT_AVAILABILITY: 'false' }, false],
    [{ APP_ENV: 'development', DEVELOPMENT_AVAILABILITY: 'false' }, false],
    [{ APP_ENV: 'production', SECRET_KEY: 'x'.repeat(32) }, false],
  ]

  for (const [overrides, expected] of cases) {
    test(`${JSON.stringify(overrides)} → ${expected}`, async () => {
      const case_ = { ...overrides }
      if (case_.APP_ENV === 'production') case_.SECRET_KEY ??= 's'.repeat(40)
      const { env, production } = await loadEnv(case_)
      expect(env.DEVELOPMENT_AVAILABILITY).toBe(expected)
      expect(production).toBe(overrides.APP_ENV === 'production')
    })
  }

  afterEach(() => {
    delete process.env.APP_ENV
    delete process.env.DEVELOPMENT_AVAILABILITY
    delete process.env.SECRET_KEY
    vi.resetModules()
  })
})

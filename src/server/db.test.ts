import { beforeEach, expect, test, vi } from 'vitest'
import { ConvexError } from 'convex/values'

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = mocks.query
    mutation = mocks.mutation
  },
}))
vi.mock('./env', () => ({
  env: {
    CONVEX_URL: 'https://fixture.convex.cloud',
    CONVEX_SERVER_KEY: 'test-only-server-key-not-for-production-123456',
  },
}))

import { api, read, write, DatabaseUnavailable, DatabaseFunctionUnavailable } from './db'

beforeEach(() => { mocks.query.mockReset(); mocks.mutation.mockReset() })

test('recognizes the exact missing public query without exposing the backend message', async () => {
  mocks.query.mockRejectedValue(new Error(
    "[Request ID: fixture] Server Error\nCould not find public function for 'studio:getSessionContext'. Did you forget to run `npx convex dev` or `npx convex deploy`?",
  ))
  const error = await read(api.studio.getSessionContext, { token_hash: 'hash', now: 200 }).catch(error => error)
  expect(error).toBeInstanceOf(DatabaseFunctionUnavailable)
  expect(error.message).toBe('The service is temporarily unavailable. Please try again shortly.')
})

test('outages, unauthorized calls and unrelated missing functions never trigger compatibility reads', async () => {
  for (const error of [
    new Error('fetch failed'),
    new ConvexError('Unauthorized'),
    new Error("Could not find public function for 'studio:anotherFunction'."),
  ]) {
    mocks.query.mockRejectedValueOnce(error)
    const result = await read(api.studio.getSessionContext, { token_hash: 'hash', now: 200 }).catch(error => error)
    expect(result).toBeInstanceOf(DatabaseUnavailable)
    expect(result).not.toBeInstanceOf(DatabaseFunctionUnavailable)
  }
})

test('mutations never use missing-function compatibility handling', async () => {
  mocks.mutation.mockRejectedValueOnce(new Error("Could not find public function for 'studio:register'."))
  const error = await write(api.studio.register, {
    id: 'fixture', email: 'fixture@example.com', password_hash: 'fixture',
  }).catch(error => error)
  expect(error).toBeInstanceOf(DatabaseUnavailable)
  expect(error).not.toBeInstanceOf(DatabaseFunctionUnavailable)
  expect(mocks.mutation).toHaveBeenCalledTimes(1)
})

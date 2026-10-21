import { afterEach, expect, test, vi } from 'vitest'
import { api, loadBootstrap } from './api'

afterEach(() => vi.unstubAllGlobals())

test('bootstrap shares only in-flight requests and refreshes completed account data', async () => {
  let complete!: (value: Response) => void
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    .mockResolvedValueOnce(Response.json({ csrf: 'new', user: null }))
    .mockResolvedValueOnce(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  const first = loadBootstrap(), second = loadBootstrap()
  expect(fetch).toHaveBeenCalledTimes(1)
  complete(Response.json({ csrf: 'old', user: { email: 'a@example.com' } }))
  expect(await first).toEqual(await second)
  expect((await loadBootstrap()).user).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(2)
  await api('/write', {})
  expect(fetch.mock.calls[2][1].headers['X-CSRF-Token']).toBe('new')
})

test('a failed bootstrap can be retried', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(Response.json({ csrf: 'retry', user: null }))
  vi.stubGlobal('fetch', fetch)
  await expect(loadBootstrap()).rejects.toThrow('offline')
  expect((await loadBootstrap()).csrf).toBe('retry')
})

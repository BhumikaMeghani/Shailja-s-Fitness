/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { beforeEach, expect, test, vi } from 'vitest'
import { createHmac, scryptSync } from 'node:crypto'
import schema from './schema'
import { api } from './_generated/api'
import { internal } from './_generated/api'
import { CONTENT_VERSION } from '../src/lib/wellness/bpEngine'

vi.hoisted(() => {
  Object.assign(process.env, {
    APP_ENV: 'development', DEVELOPMENT_AVAILABILITY: 'true',
    RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'test_secret',
    RAZORPAY_WEBHOOK_SECRET: 'test_webhook',
    // Never deliver real email using credentials from the developer's .env.
    SMTP_USER: '', SMTP_APP_PASSWORD: '',
  })
})

const modules = import.meta.glob('./**/*.ts')
let t = convexTest(schema, modules)
const server_key = 'test-only-server-key-not-for-production-123456'

vi.mock('../src/server/db', async importOriginal => {
  const original = await importOriginal<typeof import('../src/server/db')>()
  return {
    ...original,
    read: vi.fn((fn: Parameters<typeof t.query>[0], args: Record<string, unknown>) =>
      t.query(fn, { ...args, server_key })),
    write: (fn: Parameters<typeof t.mutation>[0], args: Record<string, unknown>) =>
      t.mutation(fn, { ...args, server_key }),
  }
})
vi.mock('../src/server/razorpay', () => ({ razorpay: vi.fn() }))
vi.mock('../src/server/wellness', () => ({ loadBpCatalog: vi.fn() }))
vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: vi.fn(),
  clerkClient: () => ({ users: { getUser: clerkGetUser } }),
}))
const { clerkGetUser } = vi.hoisted(() => ({ clerkGetUser: vi.fn() }))

import { Route as bootstrap } from '../src/routes/api/bootstrap'
import { Route as availability } from '../src/routes/api/availability'
import { Route as auth } from '../src/routes/api/auth.$action'
import { Route as clerkSession } from '../src/routes/api/auth.session'
import { auth as clerkAuth } from '@clerk/tanstack-react-start/server'
import { Route as demo } from '../src/routes/api/bookings.demo'
import { Route as status } from '../src/routes/api/bookings.$bookingId'
import { Route as order } from '../src/routes/api/payments.order'
import { Route as verify } from '../src/routes/api/payments.verify'
import { Route as webhook } from '../src/routes/api/payments.webhook'
import { Route as contact } from '../src/routes/api/contact'
import { Route as wellness } from '../src/routes/api/wellness.recommend'
import { loadBpCatalog } from '../src/server/wellness'
import { hashPassword, verifyWerkzeugHash } from '../src/server/password'
import { razorpay } from '../src/server/razorpay'
import { sampleSlots, istDateKey, nowIst } from '../src/server/slots'
import { DatabaseUnavailable, DatabaseFunctionUnavailable, read } from '../src/server/db'
import { apiHandler } from '../src/server/http'

type Context = { request: Request; params: Record<string, string> }
function handler(route: unknown, method: 'GET' | 'POST') {
  return (route as { options: { server: { handlers: Record<string, (ctx: Context) => Promise<Response>> } } })
    .options.server.handlers[method]
}

class Client {
  cookie = ''
  csrf = ''
  async get(route: unknown, params: Record<string, string> = {}) {
    return handler(route, 'GET')({
      request: new Request('http://localhost/api/test', { headers: { cookie: this.cookie } }), params,
    })
  }
  async post(route: unknown, body: unknown, params: Record<string, string> = {}) {
    return handler(route, 'POST')({
      request: new Request('http://localhost/api/test', { method: 'POST',
        headers: { cookie: this.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf },
        body: JSON.stringify(body),
      }), params,
    })
  }
  async bootstrap() {
    const response = await this.get(bootstrap)
    this.acceptCookie(response)
    this.csrf = (await response.json()).csrf
  }
  acceptCookie(response: Response) {
    const cookie = response.headers.get('set-cookie')
    if (cookie) this.cookie = cookie.split(';')[0]
  }
  async register(email = 'test@example.com') {
    await this.bootstrap()
    const response = await this.post(auth, { email, password: 'long-secure-password' }, { action: 'register' })
    expect(response.status).toBe(200)
    this.acceptCookie(response)
    this.csrf = (await response.json()).csrf
  }
}

beforeEach(() => {
  process.env.STUDIO_SERVER_KEY = server_key
  t = convexTest(schema, modules)
  vi.mocked(razorpay).mockReset()
  vi.mocked(read).mockClear()
  vi.mocked(loadBpCatalog).mockReset()
  vi.mocked(loadBpCatalog).mockImplementation(route =>
    t.query(api.wellness.getCatalog, { route, version: CONTENT_VERSION }))
  vi.mocked(clerkAuth).mockReset()
  clerkGetUser.mockReset()
})

function verifiedClerkUser(email = 'clerk@example.com', verified = true) {
  clerkGetUser.mockResolvedValue({
    primaryEmailAddressId: 'email_primary',
    emailAddresses: [{
      id: 'email_primary', emailAddress: email,
      verification: { status: verified ? 'verified' : 'unverified' },
    }],
  })
}

test('verified Clerk sign-in links an existing record and keeps booking ownership across sign-ins', async () => {
  const client = new Client()
  await client.register('clerk@example.com')
  const original = await t.query(api.studio.getUser, { server_key, field: 'email', value: 'clerk@example.com' })
  await t.run(ctx => ctx.db.insert('clerk_accounts', { id: 'clerk:user_fixture' }))
  vi.mocked(clerkAuth).mockResolvedValue({ userId: 'user_fixture' } as Awaited<ReturnType<typeof clerkAuth>>)
  verifiedClerkUser()
  for (let index = 0; index < 2; index++) {
    const response = await client.post(clerkSession, { clerk_user_id: 'user_attacker', user_id: 'attacker' })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    client.acceptCookie(response)
    client.csrf = (await response.json()).csrf
  }
  expect(await t.run(ctx => ctx.db.query('clerk_accounts').take(10)))
    .toEqual([expect.objectContaining({ id: 'clerk:user_fixture', user_id: original!.id })])
  const response = await client.post(demo, selection())
  expect(response.status).toBe(200)
  expect(await t.run(ctx => ctx.db.query('bookings').first()))
    .toMatchObject({ user_id: original!.id })
  expect(await t.run(ctx => ctx.db.query('users').take(10))).toHaveLength(1)
})

test('new Clerk sign-in persists both records without enabling local password login', async () => {
  const client = new Client()
  await client.bootstrap()
  vi.mocked(clerkAuth).mockResolvedValue({ userId: 'user_new' } as Awaited<ReturnType<typeof clerkAuth>>)
  verifiedClerkUser()
  expect((await client.post(clerkSession, {})).status).toBe(200)
  const account = await t.query(api.studio.getUser, { server_key, field: 'email', value: 'clerk@example.com' })
  expect(account).not.toBeNull()
  expect(verifyWerkzeugHash(account!.password_hash, '!clerk-only')).toBe(false)
  expect(await t.run(ctx => ctx.db.query('clerk_accounts').first()))
    .toMatchObject({ id: 'clerk:user_new', user_id: account!.id })
})

test('Clerk session rejects missing identity, unverified email, provider failures and invalid CSRF', async () => {
  const client = new Client()
  await client.bootstrap()
  vi.mocked(clerkAuth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof clerkAuth>>)
  expect((await client.post(clerkSession, {})).status).toBe(401)
  expect(clerkGetUser).not.toHaveBeenCalled()
  vi.mocked(clerkAuth).mockResolvedValue({ userId: 'user_new' } as Awaited<ReturnType<typeof clerkAuth>>)
  verifiedClerkUser('clerk@example.com', false)
  expect((await client.post(clerkSession, {})).status).toBe(422)
  clerkGetUser.mockRejectedValue(new Error('provider unavailable'))
  expect((await client.post(clerkSession, {})).status).toBe(503)
  verifiedClerkUser()
  client.csrf = 'wrong'
  expect((await client.post(clerkSession, {})).status).toBe(403)
  expect(await t.run(ctx => ctx.db.query('clerk_accounts').take(10))).toHaveLength(0)
  expect(await t.run(ctx => ctx.db.query('users').take(10))).toHaveLength(0)
})

function selection() {
  const day = nowIst()
  do { day.setDate(day.getDate() + 1) } while (day.getDay() === 0)
  return { service: 'online', plan: 'Normal Yoga', starts_at: sampleSlots('online', istDateKey(day))[0] }
}

test('Werkzeug literal salts and legacy Bun base64 salts both verify', () => {
  const fixture = 'scrypt:32768:8:1$literalWerkzeugSalt$4bcc7407207f6a7ecb766088cdebd9f8cd291b9d50fc29e9f7880cb03cfb5412d1b856bd9ff7912a7c739b9c3b4abc50cc5c27c63814ac1157cf69c8ff4986ae'
  expect(verifyWerkzeugHash(fixture, 'migration-fixture-password')).toBe(true)
  expect(verifyWerkzeugHash(fixture, 'wrong-password')).toBe(false)
  const salt = Buffer.from('legacy-bun-salt')
  const checksum = scryptSync('legacy-password', salt, 64, {
    N: 32768, r: 8, p: 1, maxmem: 176 * 32768 * 8,
  }).toString('hex')
  expect(verifyWerkzeugHash(`scrypt:32768:8:1$${salt.toString('base64')}$${checksum}`, 'legacy-password')).toBe(true)
  expect(verifyWerkzeugHash(hashPassword('new-password'), 'new-password')).toBe(true)
})

test('bootstrap, CSRF, registration, logout and migrated-account login use async storage', async () => {
  const client = new Client()
  expect((await client.post(auth, {}, { action: 'register' })).status).toBe(403)
  await client.register()
  const oldCookie = client.cookie
  const logout = await client.post(auth, {}, { action: 'logout' })
  client.acceptCookie(logout)
  client.csrf = (await logout.json()).csrf
  expect(client.cookie).not.toBe(oldCookie)
  const login = await client.post(auth, {
    email: 'test@example.com', password: 'long-secure-password',
  }, { action: 'login' })
  expect(login.status).toBe(200)
  expect(login.headers.get('set-cookie')).toContain('HttpOnly')
  client.acceptCookie(login)
  client.csrf = (await login.json()).csrf
  await t.run(ctx => ctx.db.insert('users', {
    id: '7', email: 'legacy@example.com',
    password_hash: 'scrypt:32768:8:1$literalWerkzeugSalt$4bcc7407207f6a7ecb766088cdebd9f8cd291b9d50fc29e9f7880cb03cfb5412d1b856bd9ff7912a7c739b9c3b4abc50cc5c27c63814ac1157cf69c8ff4986ae',
  }))
  expect((await client.post(auth, {
    email: 'legacy@example.com', password: 'migration-fixture-password',
  }, { action: 'login' })).status).toBe(200)
})

test('concurrent demo bookings have one winner and status is owner-only', async () => {
  const a = new Client(), b = new Client()
  await a.register('a@example.com')
  await b.register('b@example.com')
  const payload = selection()
  const results = await Promise.all([a.post(demo, payload), b.post(demo, payload)])
  expect(results.map(result => result.status).sort()).toEqual([200, 409])
  const winnerIndex = results.findIndex(result => result.status === 200)
  const winner = winnerIndex === 0 ? a : b
  const loser = winnerIndex === 0 ? b : a
  const booking = (await results[winnerIndex].json()).booking
  expect((await winner.get(status, { bookingId: booking })).status).toBe(200)
  expect((await loser.get(status, { bookingId: booking })).status).toBe(404)
  expect((await (await winner.post(demo, payload)).json()).booking).toBe(booking)
})

test('bootstrap uses one fresh account/session query and does not share users', async () => {
  const a = new Client(), b = new Client()
  await a.register('a@example.com')
  await b.register('b@example.com')
  for (const [client, email] of [[a, 'a@example.com'], [b, 'b@example.com']] as const) {
    vi.mocked(read).mockClear()
    const response = await client.get(bootstrap)
    expect((await response.json()).user).toEqual({ email })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(api.studio.getSessionContext, expect.anything())
  }
})

test('availability skips empty dates but reads fresh bookings and reports database failure', async () => {
  const payload = selection()
  const request = (date: string) => handler(availability, 'GET')({
    request: new Request(`http://localhost/api/availability?service=online&date=${date}`), params: {},
  })
  const sunday = nowIst()
  do { sunday.setDate(sunday.getDate() + 1) } while (sunday.getDay() !== 0)
  vi.mocked(read).mockClear()
  expect((await (await request(istDateKey(sunday))).json()).slots).toEqual([])
  expect(read).not.toHaveBeenCalled()
  const date = payload.starts_at.slice(0, 10)
  expect((await (await request(date)).json()).slots[0].available).toBe(true)
  const client = new Client()
  await client.register()
  expect((await client.post(demo, payload)).status).toBe(200)
  expect((await (await request(date)).json()).slots[0].available).toBe(false)
  vi.mocked(read).mockRejectedValueOnce(new DatabaseUnavailable())
  const failed = await request(date)
  expect(failed.status).toBe(503)
  expect((await failed.json()).slots).toBeUndefined()
})

test('bootstrap remains compatible with a backend missing the optimized session query', async () => {
  const client = new Client()
  await client.register('compatible@example.com')
  vi.mocked(read).mockClear()
  vi.mocked(read).mockRejectedValueOnce(new DatabaseFunctionUnavailable())
  const response = await client.get(bootstrap)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.user).toEqual({ email: 'compatible@example.com' })
  expect(body.csrf).toBe(client.csrf)
  expect(body.services).toHaveLength(3)
  expect(read).toHaveBeenCalledTimes(3)
  expect(read).toHaveBeenNthCalledWith(2, api.studio.getSession, expect.anything())
  expect(read).toHaveBeenNthCalledWith(3, api.studio.getUser, expect.anything())
  expect(JSON.stringify(body)).not.toContain('password_hash')
})

test('bootstrap does not disguise database outages as a compatibility fallback', async () => {
  const client = new Client()
  await client.bootstrap()
  vi.mocked(read).mockClear()
  vi.mocked(read).mockRejectedValueOnce(new DatabaseUnavailable())
  expect((await client.get(bootstrap)).status).toBe(503)
  expect(read).toHaveBeenCalledTimes(1)
})

test('orders return the saved gateway ID, reuse pending orders, and verify captures', async () => {
  const client = new Client()
  await client.register()
  vi.mocked(razorpay).mockResolvedValueOnce({ id: 'order_fixture', amount: 150000, currency: 'INR' })
  const payload = selection()
  const response = await client.post(order, { ...payload, amount: 1 })
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.order_id).toBe('order_fixture')
  expect(vi.mocked(razorpay).mock.calls[0][2]).toMatchObject({ amount: 150000 })
  expect((await (await client.post(order, payload)).json()).order_id).toBe('order_fixture')
  expect(razorpay).toHaveBeenCalledTimes(1)
  vi.mocked(razorpay).mockResolvedValue({
    id: 'pay_fixture', order_id: 'order_fixture', amount: 150000, currency: 'INR', status: 'captured',
  })
  const signature = createHmac('sha256', 'test_secret').update('order_fixture|pay_fixture').digest('hex')
  for (let i = 0; i < 2; i++) expect((await (await client.post(verify, {
    booking: result.booking, razorpay_order_id: result.order_id,
    razorpay_payment_id: 'pay_fixture', razorpay_signature: signature,
  })).json()).status).toBe('confirmed')
})

test('signed duplicate webhooks are atomic and malformed captures are rejected', async () => {
  const client = new Client()
  await client.register()
  vi.mocked(razorpay).mockResolvedValueOnce({ id: 'order_fixture', amount: 150000, currency: 'INR' })
  expect((await client.post(order, selection())).status).toBe(200)
  const deliver = (event: unknown) => {
    const body = JSON.stringify(event)
    return handler(webhook, 'POST')({ params: {}, request: new Request('http://localhost/api/webhook', {
      method: 'POST', body,
      headers: { 'X-Razorpay-Signature': createHmac('sha256', 'test_webhook').update(body).digest('hex') },
    }) })
  }
  const event = { event: 'payment.captured', payload: { payment: { entity: {
    id: 'pay_fixture', order_id: 'order_fixture', amount: 150000, currency: 'INR', status: 'captured',
  } } } }
  expect((await deliver(event)).status).toBe(200)
  expect((await deliver(event)).status).toBe(200)
  expect(await t.run(async ctx => (await ctx.db.query('webhook_events').collect()).length)).toBe(1)
  expect((await deliver({ event: 'payment.captured', payload: null })).status).toBe(409)
})

test('database outages return 503 without exposing internal errors', async () => {
  const wrapped = apiHandler(async () => { throw new DatabaseUnavailable() })
  const response = await wrapped({ request: new Request('http://localhost'), params: {} })
  expect(response.status).toBe(503)
})

test('contact queries are saved to query_from_user and return a studio mailto', async () => {
  const client = new Client()
  await client.bootstrap() //Submitting requires only a live session, not an account.
  const payload = {
    name: 'Asha Verma', address: '12 Lake View Road, Indore 452001',
    email: 'asha@example.com', mobile: '+91 98765 43210',
    message: 'Do you offer therapeutic yoga on weekend evenings?',
  }
  const response = await client.post(contact, payload)
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.ok).toBe(true)
  expect(result.delivered).toBe(false) // SMTP is not configured in tests.
  expect(result.mailto).toContain('mailto:bhoomikameghani0110@gmail.com')
  expect(result.mailto).toContain('Website%20query%20from%20Asha%20Verma')
  const rows = await t.run(async ctx => ctx.db.query('query_from_user').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    name: 'Asha Verma', address: '12 Lake View Road, Indore 452001',
    email: 'asha@example.com', mobile: '+91 98765 43210',
  })
  expect(rows[0].created).toBeGreaterThan(0)
  // Malformed submissions are rejected before any attempt row is burned.
  expect((await client.post(contact, { name: 'A', address: 'x', mobile: '1', message: 'hi' })).status).toBe(400)
})

test('BP API requires valid readings, explicit unit and CSRF, not an account; returns fixed Convex content', async () => {
  const client = new Client()
  const input = { systolic: 118, diastolic: 76, weight: 72, weightUnit: 'kg' }
  expect((await client.post(wellness, input)).status).toBe(403)
  await client.bootstrap()
  expect((await client.post(wellness, { ...input, weightUnit: '' })).status).toBe(400)
  expect((await client.post(wellness, { ...input, weight: null })).status).toBe(400)
  expect((await client.post(wellness, [])).status).toBe(400)
  await t.mutation(internal.wellness.seedCatalog, {})
  const response = await client.post(wellness, input)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const result = await response.json()
  expect(result.bpCategory).toBe('normal')
  expect(result.recommendations).toHaveLength(3)
  expect(result.recommendations.every((p: { steps: string[] }) => p.steps.length === 4)).toBe(true)
  expect(result.inputs).toMatchObject(input)
  expect(result.weightPersonalization).toBe('general_wellness')
  expect(loadBpCatalog).toHaveBeenCalledExactlyOnceWith('normal')
  expect(JSON.stringify(result).toLowerCase()).not.toContain('bmi')
  // No account/profile or health-readings collection is created.
  expect(await t.run(ctx => ctx.db.query('users').first())).toBeNull()
  const session = await t.run(ctx => ctx.db.query('sessions').first())
  expect(session).not.toHaveProperty('weight')
  expect(session).not.toHaveProperty('systolic')
})

test('BP API stop screens need no content query; missing/unavailable catalog fails closed', async () => {
  const client = new Client()
  await client.bootstrap()
  const input = { systolic: 118, diastolic: 76, weight: 72, weightUnit: 'kg' }
  for (const [patch, expected] of [
    [{ symptoms: ['severe_breathlessness'] }, 'emergency'],
    [{ systolic: 185 }, 'severe'],
    [{ systolic: 125, diastolic: 122 }, 'severe'],
    [{ exerciseRestricted: true }, 'exercise_restricted'],
  ] as const) {
    const response = await client.post(wellness, { ...input, ...patch })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.status).toBe(expected)
    expect(result.recommendations).toEqual([])
    expect(result.dietGuidance).toBeNull()
  }
  expect(loadBpCatalog).not.toHaveBeenCalled()
  expect((await client.post(wellness, input)).status).toBe(503)
  vi.mocked(loadBpCatalog).mockRejectedValueOnce(new Error('provider failed'))
  const failure = await client.post(wellness, input)
  expect(failure.status).toBe(503)
  expect((await failure.json()).error).not.toContain('provider failed')
  // Non-gating symptoms still route to poses once content is available.
  await t.mutation(internal.wellness.seedCatalog, {})
  const nonGating = await client.post(wellness, { ...input, symptoms: ['chest_pain', 'dizziness'] })
  expect(nonGating.status).toBe(200)
  const nonGatingBody = await nonGating.json()
  expect(nonGatingBody.status).toBe('ok')
  expect(nonGatingBody.recommendations).toHaveLength(3)
  expect(loadBpCatalog).toHaveBeenLastCalledWith('normal')
})

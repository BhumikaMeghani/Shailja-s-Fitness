/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import { CONTENT_VERSION, ROUTE_POSES } from '../src/lib/wellness/bpEngine'

const modules = import.meta.glob('./**/*.ts')

test('catalog is empty before explicit seed; seed creates three fixed routes and is idempotent', async () => {
  const t = convexTest(schema, modules)
  expect(await t.query(api.wellness.getCatalog, { route: 'normal', version: CONTENT_VERSION })).toBeNull()
  expect(await t.mutation(internal.wellness.seedCatalog, {})).toEqual({ inserted: 3, existing: 0, version: CONTENT_VERSION })
  expect(await t.mutation(internal.wellness.seedCatalog, {})).toEqual({ inserted: 0, existing: 3, version: CONTENT_VERSION })
  for (const route of ['normal', 'low', 'high'] as const) {
    const content = await t.query(api.wellness.getCatalog, { route, version: CONTENT_VERSION })
    expect(content?.poses.map(p => p.id)).toEqual(ROUTE_POSES[route])
    expect(content?.reviewStatus).toBe('pending_professional_review')
    expect(content?.poses.every(p => p.steps.length === 4 && p.image.alt)).toBe(true)
  }
  expect(await t.query(api.wellness.getCatalog, { route: 'normal', version: 'missing' })).toBeNull()
  expect(await t.run(ctx => ctx.db.query('users').first())).toBeNull()
  expect(await t.run(ctx => ctx.db.query('sessions').first())).toBeNull()
})

test('seed never overwrites existing content and invalid route content fails closed', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.wellness.seedCatalog, {})
  await t.run(async ctx => {
    const row = await ctx.db.query('wellness_catalog')
      .withIndex('by_version_and_route', q => q.eq('version', CONTENT_VERSION).eq('route', 'high')).unique()
    if (!row) throw new Error('Missing seeded route')
    await ctx.db.patch('wellness_catalog', row._id, { poses: row.poses.slice(0, 2) })
  })
  await t.mutation(internal.wellness.seedCatalog, {})
  expect(await t.query(api.wellness.getCatalog, { route: 'high', version: CONTENT_VERSION })).toBeNull()
})

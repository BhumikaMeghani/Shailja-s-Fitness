import { ConvexError, v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import { wellnessCatalog, wellnessRoute } from './wellnessModel'
import { CONTENT_VERSION, validBpCatalog, type BpCatalog, type BpRoute } from '../src/lib/wellness/bpEngine'
import seed from './wellnessSeed.json'

/** Public content only. BP, weight, symptoms and account IDs never reach Convex. */
export const getCatalog = query({
  args: { route: wellnessRoute, version: v.string() },
  returns: v.union(wellnessCatalog, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('wellness_catalog')
      .withIndex('by_version_and_route', q => q.eq('version', args.version).eq('route', args.route))
      .unique()
    if (!row) return null
    const { _id, _creationTime, ...catalog } = row
    if (!validBpCatalog(catalog, args.route)) return null
    return catalog
  },
})

/** Operator-only, non-destructive seed. Never overwrites reviewed/existing rows. */
export const seedCatalog = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), existing: v.number(), version: v.string() }),
  handler: async ctx => {
    let inserted = 0
    let existing = 0
    for (const route of ['normal', 'low', 'high'] as BpRoute[]) {
      const catalog: BpCatalog = {
        route, version: CONTENT_VERSION, reviewStatus: 'pending_professional_review',
        poses: seed.poses[route], diet: seed.diet[route], safetyMessage: seed.routeSafety[route],
      }
      if (!validBpCatalog(catalog, route)) throw new ConvexError('Invalid wellness seed content.')
      const row = await ctx.db.query('wellness_catalog')
        .withIndex('by_version_and_route', q => q.eq('version', CONTENT_VERSION).eq('route', route))
        .unique()
      if (row) { existing++; continue }
      await ctx.db.insert('wellness_catalog', catalog)
      inserted++
    }
    return { inserted, existing, version: CONTENT_VERSION }
  },
})

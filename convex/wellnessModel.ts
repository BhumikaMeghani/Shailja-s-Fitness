import { v } from 'convex/values'

export const wellnessRoute = v.union(v.literal('normal'), v.literal('low'), v.literal('high'))
export const wellnessPose = v.object({
  id: v.string(), name: v.string(), displayName: v.string(), benefits: v.string(),
  steps: v.array(v.string()), safetyNote: v.string(),
  image: v.object({ src: v.string(), alt: v.string(), fallback: v.string(), license: v.string() }),
})
export const wellnessCatalog = v.object({
  route: wellnessRoute, version: v.string(),
  reviewStatus: v.union(v.literal('pending_professional_review'), v.literal('reviewed')),
  poses: v.array(wellnessPose),
  diet: v.object({ do: v.array(v.string()), dont: v.array(v.string()) }),
  safetyMessage: v.string(),
})

import { createFileRoute } from '@tanstack/react-router'
import { apiHandler, fail, protectedWrite } from '~/server/http'
import { loadBpCatalog } from '~/server/wellness'
import {
  completeBpRecommendation, prepareBpRecommendation,
  routeForCategory, validateBpInput,
} from '~/lib/wellness/bpEngine'

export const Route = createFileRoute('/api/wellness/recommend')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const validated = validateBpInput(guard.ctx.body)
        if (!validated.ok) return Response.json({
          status: 'validation_error', errors: validated.errors,
          error: 'Check the highlighted fields and re-measure unexpected readings.',
        }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
        // Classify/stop first; never send health inputs to Convex content queries.
        const result = prepareBpRecommendation(validated.input)
        if (result.status !== 'ok') return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
        try {
          const catalog = await loadBpCatalog(routeForCategory(result.bpCategory))
          if (!catalog) return fail('Wellness content is unavailable. No yoga plan was generated. Please try again later.', 503)
          return Response.json(completeBpRecommendation(result, catalog), { headers: { 'Cache-Control': 'no-store' } })
        } catch {
          return fail('Wellness content could not load. No yoga plan was generated. For concerning symptoms or readings, seek medical help rather than waiting.', 503)
        }
      }),
    },
  },
})

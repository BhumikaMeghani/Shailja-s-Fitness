import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { CONTENT_VERSION, type BpRoute } from '~/lib/wellness/bpEngine'
import { env } from './env'

/** Read public content only; no health readings or identity leave this server. */
export async function loadBpCatalog(route: BpRoute) {
  return new ConvexHttpClient(env.CONVEX_URL).query(api.wellness.getCatalog, {
    route, version: CONTENT_VERSION,
  })
}

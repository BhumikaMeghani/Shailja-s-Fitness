/**
 * Server-to-server Convex access. Browsers use the existing cookie/CSRF API.
 * CONVEX_SERVER_KEY must never be exposed as a VITE_ variable.
 */
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError, type Infer } from 'convex/values'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { booking, session, user } from '../../convex/schema'
import { env } from './env'

export type UserRow = Infer<typeof user>
export type SessionRow = Infer<typeof session>
export type BookingRow = Infer<typeof booking>

export class DatabaseUnavailable extends Error {
  constructor() {
    super('The service is temporarily unavailable. Please try again shortly.')
  }
}

let client: ConvexHttpClient | undefined
function database(): ConvexHttpClient {
  if (!env.CONVEX_URL || env.CONVEX_SERVER_KEY.length < 32) throw new DatabaseUnavailable()
  const url = new URL(env.CONVEX_URL)
  if (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new DatabaseUnavailable()
  }
  return client ??= new ConvexHttpClient(env.CONVEX_URL)
}

type ServerFunction = FunctionReference<'query' | 'mutation', 'public'>
type PrivateArgs<F extends ServerFunction> = Omit<FunctionArgs<F>, 'server_key'>

async function call<F extends ServerFunction>(
  kind: 'query' | 'mutation', fn: F, args: PrivateArgs<F>,
): Promise<FunctionReturnType<F>> {
  try {
    const params = { ...args, server_key: env.CONVEX_SERVER_KEY } as FunctionArgs<F>
    return kind === 'query'
      ? await database().query(fn as FunctionReference<'query'>, params)
      : await database().mutation(fn as FunctionReference<'mutation'>, params)
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === 'string' && error.data !== 'Unauthorized') {
      throw new Error(error.data)
    }
    // Never expose traces, credentials or request arguments to browsers.
    throw new DatabaseUnavailable()
  }
}

export function read<F extends FunctionReference<'query', 'public'>>(fn: F, args: PrivateArgs<F>) {
  return call('query', fn, args)
}

export function write<F extends FunctionReference<'mutation', 'public'>>(fn: F, args: PrivateArgs<F>) {
  return call('mutation', fn, args)
}

export { api }

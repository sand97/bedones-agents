import type { PrismaService } from '../../prisma/prisma.service'

/** A write the agent attempted on the database during a dry-run. */
export interface CapturedWrite {
  model: string
  action: string
  args: unknown
}

const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
])

function fakeWriteResult(action: string, args: Record<string, unknown>): unknown {
  const data = (args?.data ?? {}) as Record<string, unknown>
  const where = (args?.where ?? {}) as Record<string, unknown>
  switch (action) {
    case 'createMany':
    case 'createManyAndReturn':
    case 'updateMany':
    case 'updateManyAndReturn':
    case 'deleteMany':
      return { count: Array.isArray(args?.data) ? args.data.length : 0 }
    case 'delete':
      return { id: (where.id as string) ?? `dry-run-${Date.now()}`, ...where }
    default:
      // create / update / upsert — return the written data plus a fake id so the
      // calling tool can read back e.g. `ticket.id` / `ticket.title`.
      return { id: (where.id as string) ?? `dry-run-${Date.now()}`, ...data }
  }
}

function isModelDelegate(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).findMany === 'function'
  )
}

/**
 * Wrap a real PrismaService so that:
 *  - reads (findMany/findUnique/findFirst/count/aggregate/…) hit the real DB —
 *    the agent sees the real catalog, history, promotions, labels, …;
 *  - writes (create/update/upsert/delete/…) are RECORDED but never executed,
 *    and a plausible result is returned to the calling tool.
 *
 * This gives a faithful "what would the agent do" run with zero mutation, and
 * — unlike an interactive transaction held open across slow LLM round-trips —
 * never blocks a DB connection or hits a transaction timeout.
 */
export function createDryRunPrisma(real: PrismaService): {
  prisma: PrismaService
  writes: CapturedWrite[]
} {
  const writes: CapturedWrite[] = []

  const wrapDelegate = (modelName: string, delegate: Record<string, unknown>) =>
    new Proxy(delegate, {
      get(target, prop) {
        const value = (target as Record<string | symbol, unknown>)[prop]
        if (typeof prop === 'string' && WRITE_ACTIONS.has(prop) && typeof value === 'function') {
          return (args: Record<string, unknown> = {}) => {
            writes.push({ model: modelName, action: prop, args })
            return Promise.resolve(fakeWriteResult(prop, args))
          }
        }
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value
      },
    })

  const proxy = new Proxy(real as unknown as Record<string | symbol, unknown>, {
    get(target, prop) {
      const value = target[prop]
      if (
        typeof prop === 'string' &&
        !prop.startsWith('$') &&
        !prop.startsWith('_') &&
        isModelDelegate(value)
      ) {
        return wrapDelegate(prop, value)
      }
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value
    },
  })

  return { prisma: proxy as unknown as PrismaService, writes }
}

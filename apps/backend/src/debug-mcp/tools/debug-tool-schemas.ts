import { z } from 'zod'

export const chatWithAgentSchema = z.object({
  message: z.string().describe('The customer message to send to the agent.'),
  history: z
    .array(
      z.object({
        from: z.enum(['customer', 'agent']).describe('Who sent this prior turn'),
        text: z.string(),
      }),
    )
    .optional()
    .describe('Optional prior turns (oldest first) to seed the conversation context.'),
  conversationId: z
    .string()
    .optional()
    .describe(
      'Optional real conversation id (this org) to load real history + contact notes from (read-only). When omitted, an ephemeral conversation is used.',
    ),
  agentId: z
    .string()
    .optional()
    .describe('Optional agent id to test. Defaults to the first agent of the organisation.'),
})

export const readTableSchema = z.object({
  table: z.string().describe('Table to read — call list_tables to see the allowed set.'),
  where: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional Prisma "where" filter. The organisation scope is always AND-ed on top.'),
  orderBy: z
    .record(z.string(), z.enum(['asc', 'desc']))
    .optional()
    .describe('Optional ordering, e.g. { "createdAt": "desc" }.'),
  limit: z.number().int().positive().max(100).optional().describe('Max rows (default 20).'),
})

export const listProductsSchema = z.object({
  search: z.string().optional().describe('Filter by product name/description.'),
  limit: z.number().int().positive().max(100).optional().describe('Max rows (default 20).'),
})

export const qdrantListSchema = z.object({
  catalogId: z
    .string()
    .optional()
    .describe('Catalog id (this org). When omitted, inspects every catalog of the org.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(256)
    .optional()
    .describe('Max points per catalog (default 50).'),
})

export const qdrantGetPointSchema = z.object({
  catalogId: z.string().describe('Catalog id (this org).'),
  productId: z.string().describe('Internal product id.'),
})

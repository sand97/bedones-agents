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
  provider: z
    .enum(['gemini', 'openai'])
    .optional()
    .describe('Force the LLM provider. Default: env (Gemini primary, OpenAI fallback).'),
  model: z
    .string()
    .optional()
    .describe(
      'Override the model id (e.g. "gemini-3-flash-preview", "gpt-5-mini"). Provider is inferred from the name when not given. Default: the env flash model.',
    ),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional()
    .describe('Sampling temperature. Default 0 for reproducible debug runs.'),
})

export const addProductsSchema = z.object({
  catalogId: z
    .string()
    .optional()
    .describe("Target catalog (this org). Defaults to the org's first catalog."),
  products: z
    .array(
      z.object({
        name: z.string(),
        price: z.number().optional(),
        currency: z.string().optional().describe('Default "XAF".'),
        description: z.string().optional(),
        category: z.string().optional(),
        imageUrl: z.string().optional().describe('Public image URL (main product image).'),
        additionalImageUrls: z
          .array(z.string())
          .optional()
          .describe('Additional public image URLs.'),
      }),
    )
    .optional()
    .describe('Explicit products to create.'),
  count: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(
      'Generate this many synthetic products (load testing), in addition to any explicit ones.',
    ),
  namePrefix: z
    .string()
    .optional()
    .describe('Name prefix for synthetic products (default "Article").'),
})

export const indexProductsSchema = z.object({
  catalogId: z
    .string()
    .optional()
    .describe("Catalog to (re)index into Qdrant (this org). Defaults to the org's first catalog."),
  limit: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe('Max products to index this call (default 200).'),
})

export const reindexCatalogSchema = z.object({
  catalogId: z
    .string()
    .optional()
    .describe("Catalog to re-sync from Meta (this org). Defaults to the org's first catalog."),
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

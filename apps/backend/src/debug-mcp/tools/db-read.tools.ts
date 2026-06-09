import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'

import { PrismaService } from '../../prisma/prisma.service'
import { debugOrgId } from '../debug-context'
import { READ_ONLY, withTitle } from '../annotations'
import { listProductsSchema, readTableSchema } from './debug-tool-schemas'

/**
 * Allow-list of readable tables. The org scope is ALWAYS AND-ed onto the query;
 * tables holding cross-org secrets (McpAccessToken, McpOAuthClient, Session, …)
 * are intentionally absent. Sensitive columns (passwordHash, accessToken,
 * refreshToken) are masked by the global Prisma `omit` and never returned.
 */
const TABLE_REGISTRY: Record<
  string,
  { model: string; orgScope: (org: string) => Record<string, unknown>; describe: string }
> = {
  Product: {
    model: 'product',
    orgScope: (org) => ({ catalog: { organisationId: org } }),
    describe: 'Catalog products (name, price, currency, category, status).',
  },
  Catalog: {
    model: 'catalog',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'Catalogs (name, providerId, analysisStatus, counts).',
  },
  Conversation: {
    model: 'conversation',
    orgScope: (org) => ({ socialAccount: { organisationId: org } }),
    describe: 'DM conversations (participant, aiOverride, lastMessageAt).',
  },
  DirectMessage: {
    model: 'directMessage',
    orgScope: (org) => ({ conversation: { socialAccount: { organisationId: org } } }),
    describe: 'DM messages (text, isFromPage, createdTime).',
  },
  Agent: {
    model: 'agent',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'AI agents (status, score, context).',
  },
  AgentSocialAccount: {
    model: 'agentSocialAccount',
    orgScope: (org) => ({ agent: { organisationId: org } }),
    describe: 'Agent↔account links + activation flags.',
  },
  Promotion: {
    model: 'promotion',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'Promotions (discountType, discountValue, status, dates).',
  },
  PromotionProduct: {
    model: 'promotionProduct',
    orgScope: (org) => ({ promotion: { organisationId: org } }),
    describe: 'Promotion↔product eligibility links.',
  },
  ContactNote: {
    model: 'contactNote',
    orgScope: (org) => ({ conversation: { socialAccount: { organisationId: org } } }),
    describe: 'Per-customer saved notes (address, phone, sizes…).',
  },
  Label: {
    model: 'label',
    orgScope: (org) => ({ socialAccount: { organisationId: org } }),
    describe: 'Conversation labels.',
  },
  Ticket: {
    model: 'ticket',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'Support tickets (lead tracking).',
  },
  TicketStatus: {
    model: 'ticketStatus',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'Ticket statuses (isDefault flag).',
  },
  SocialAccount: {
    model: 'socialAccount',
    orgScope: (org) => ({ organisationId: org }),
    describe: 'Connected social accounts (access/refresh tokens masked).',
  },
}

type Delegate = { findMany: (args: unknown) => Promise<unknown> }

@Injectable()
export class DebugDbTools {
  constructor(private readonly prisma: PrismaService) {}

  @Tool({
    name: 'list_tables',
    annotations: withTitle('Lister les tables lisibles', READ_ONLY),
    description:
      'List the database tables the debug MCP can read. Every read is scoped to the pinned organisation and sensitive fields are masked.',
    parameters: z.object({}),
  })
  async listTables() {
    return Object.entries(TABLE_REGISTRY).map(([table, c]) => ({ table, description: c.describe }))
  }

  @Tool({
    name: 'read_table',
    annotations: withTitle('Lire une table (scopée org)', READ_ONLY),
    description:
      'Read rows from an allow-listed table. The organisation scope is always enforced; sensitive columns are masked. Use list_tables first to see allowed table names.',
    parameters: readTableSchema,
  })
  async readTable(args: z.infer<typeof readTableSchema>) {
    const org = debugOrgId()
    const cfg = TABLE_REGISTRY[args.table]
    if (!cfg) {
      return {
        error: `Unknown or forbidden table "${args.table}". Allowed: ${Object.keys(TABLE_REGISTRY).join(', ')}`,
      }
    }

    const delegate = (this.prisma as unknown as Record<string, Delegate>)[cfg.model]
    try {
      const rows = await delegate.findMany({
        where: { AND: [cfg.orgScope(org), args.where ?? {}] },
        take: args.limit ?? 20,
        ...(args.orderBy ? { orderBy: args.orderBy } : {}),
      })
      return { table: args.table, count: Array.isArray(rows) ? rows.length : 0, rows }
    } catch (error: unknown) {
      return { error: `Query failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  @Tool({
    name: 'list_products',
    annotations: withTitle('Lister les produits', READ_ONLY),
    description:
      "List the organisation's catalog products with their price and currency — handy to compare against what the agent or Qdrant report.",
    parameters: listProductsSchema,
  })
  async listProducts(args: z.infer<typeof listProductsSchema>) {
    const org = debugOrgId()
    return this.prisma.product.findMany({
      where: {
        catalog: { organisationId: org },
        ...(args.search
          ? {
              OR: [
                { name: { contains: args.search, mode: 'insensitive' } },
                { description: { contains: args.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: args.limit ?? 20,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        providerProductId: true,
        name: true,
        price: true,
        currency: true,
        category: true,
        status: true,
        imageUrl: true,
        catalog: { select: { id: true, name: true, providerId: true } },
      },
    })
  }
}

import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  PendingAgentStepDto,
  PendingCommentsStepDto,
  SetupStatusResponseDto,
} from './dto/setup-status.dto'

/**
 * Returns the list of remaining onboarding actions for an organisation.
 *
 * The rules mirror the front-end `SocialSetup` placeholders so the dashboard
 * and the in-page setup helpers stay in sync:
 *
 *   • Catalog: pending iff the organisation has zero catalogs.
 *   • Comments (FB / IG / TT): pending iff the page has no `PageSettings`
 *     row or `isConfigured = false`. Comments are not checked for TikTok
 *     because we don't gate any comment moderation behind config there —
 *     but we still surface it for consistency with the UI.
 *   • Agent: pending for every messaging-capable account that is not
 *     covered by an agent in status READY/ACTIVE with score ≥ 80.
 */
@Injectable()
export class SetupStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(organisationId: string): Promise<SetupStatusResponseDto> {
    const [catalogCount, accounts, agents] = await Promise.all([
      this.prisma.catalog.count({ where: { organisationId } }),
      this.prisma.socialAccount.findMany({
        where: { organisationId },
        select: {
          id: true,
          provider: true,
          pageName: true,
          profilePictureUrl: true,
          scopes: true,
          createdAt: true,
          settings: {
            select: { isConfigured: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.agent.findMany({
        where: { organisationId },
        select: {
          id: true,
          status: true,
          score: true,
          socialAccounts: {
            select: { socialAccountId: true },
          },
        },
      }),
    ])

    const pendingComments = this.computePendingComments(accounts)
    const pendingAgents = this.computePendingAgents(accounts, agents)

    const pendingCount =
      (catalogCount === 0 ? 1 : 0) + pendingComments.length + pendingAgents.length

    return {
      catalogPending: catalogCount === 0,
      pendingComments,
      pendingAgents,
      pendingCount,
      allConfigured: pendingCount === 0,
    }
  }

  /** Lightweight helper for mutations that only need the count. */
  async getPendingCount(organisationId: string): Promise<number> {
    const status = await this.getStatus(organisationId)
    return status.pendingCount
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private computePendingComments(accounts: AccountRecord[]): PendingCommentsStepDto[] {
    return accounts
      .filter((a) => COMMENT_PROVIDERS.has(a.provider))
      .filter((a) => !a.settings?.isConfigured)
      .map((a) => ({
        socialAccountId: a.id,
        provider: a.provider,
        pageName: a.pageName,
        profilePictureUrl: a.profilePictureUrl,
        createdAt: a.createdAt,
      }))
  }

  private computePendingAgents(
    accounts: AccountRecord[],
    agents: AgentRecord[],
  ): PendingAgentStepDto[] {
    const messagingAccounts = accounts.filter((a) => isMessagingCapable(a))

    return messagingAccounts
      .map((account) => {
        const covering = agents.filter((agent) =>
          agent.socialAccounts.some((sa) => sa.socialAccountId === account.id),
        )

        const readyAndAbove = covering.find(
          (a) => (a.status === 'READY' || a.status === 'ACTIVE') && a.score >= 80,
        )

        // Account is covered by a ready, well-scored agent → not pending.
        if (readyAndAbove) return null

        const best = covering.reduce<AgentRecord | null>((acc, a) => {
          if (!acc) return a
          return a.score > acc.score ? a : acc
        }, null)

        let agentStatus: PendingAgentStepDto['agentStatus'] = 'NONE'
        if (best) {
          if (best.status === 'READY' || best.status === 'ACTIVE') {
            agentStatus = 'READY_BELOW_THRESHOLD'
          } else {
            agentStatus = 'DRAFT_OR_CONFIGURING'
          }
        }

        return {
          socialAccountId: account.id,
          provider: account.provider,
          channel: channelFor(account.provider),
          pageName: account.pageName,
          profilePictureUrl: account.profilePictureUrl,
          createdAt: account.createdAt,
          agentStatus,
          agentScore: best?.score ?? 0,
          agentId: best?.id ?? null,
        }
      })
      .filter((s): s is PendingAgentStepDto => s !== null)
  }
}

const COMMENT_PROVIDERS = new Set(['FACEBOOK', 'INSTAGRAM', 'TIKTOK'])

const MESSAGING_SCOPES = new Set([
  'messages',
  'whatsapp_business_messaging',
  'whatsapp_business_management',
  'message.list.read',
  'message.list.send',
  'message.list.manage',
])

function isMessagingCapable(account: AccountRecord): boolean {
  if (account.provider === 'WHATSAPP') return true
  return account.scopes.some((s) => MESSAGING_SCOPES.has(s))
}

function channelFor(provider: string): string {
  switch (provider) {
    case 'WHATSAPP':
      return 'WHATSAPP'
    case 'FACEBOOK':
      return 'MESSENGER'
    case 'INSTAGRAM':
      return 'INSTAGRAM_DM'
    case 'TIKTOK':
      return 'TIKTOK_DM'
    default:
      return provider
  }
}

type AccountRecord = {
  id: string
  provider: string
  pageName: string | null
  profilePictureUrl: string | null
  scopes: string[]
  createdAt: Date
  settings: { isConfigured: boolean } | null
}

type AgentRecord = {
  id: string
  status: string
  score: number
  socialAccounts: { socialAccountId: string }[]
}

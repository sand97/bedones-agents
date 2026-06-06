import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { SocialService } from '../../social/social.service'
import { mcpContext, requireAdmin } from '../mcp-context'
import { READ_ONLY, WRITE_INTERNAL, withTitle } from './annotations'
import {
  accountIdSchema,
  emptySchema,
  faqRuleSchema,
  updateAgentContextSchema,
  updatePageSettingsSchema,
} from './tool-schemas'

/**
 * Low-level "business context" tools so an LLM can read and shape the context
 * Bedones uses to auto-moderate and auto-reply — agent context, FAQ rules and
 * page moderation settings — without going through the dashboard.
 */
@Injectable()
export class McpContextTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
  ) {}

  @Tool({
    name: 'get_business_context',
    annotations: withTitle('Contexte business des agents', READ_ONLY),
    description:
      "Récupère le contexte business des agents IA de l'organisation (contexte markdown, score de complétude).",
    parameters: emptySchema,
  })
  async getBusinessContext(_a: unknown, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const agents = await this.prisma.agent.findMany({
      where: { organisationId: ctx.organisationId },
      select: { id: true, name: true, status: true, score: true, context: true },
    })
    return agents
  }

  @Tool({
    name: 'update_agent_context',
    annotations: withTitle('Mettre à jour le contexte agent', WRITE_INTERNAL),
    description:
      "Mettre à jour le contexte business (markdown) et le score d'un agent IA. Sert à définir directement le contexte sans passer par le dashboard.",
    parameters: updateAgentContextSchema,
  })
  async updateAgentContext(
    args: z.infer<typeof updateAgentContextSchema>,
    _c: unknown,
    request: unknown,
  ) {
    const ctx = mcpContext(request)
    const agent = await this.prisma.agent.findFirst({
      where: { id: args.agentId, organisationId: ctx.organisationId },
    })
    if (!agent) throw new NotFoundException('Agent introuvable')
    const updated = await this.prisma.agent.update({
      where: { id: agent.id },
      data: { context: args.context, ...(args.score != null ? { score: args.score } : {}) },
      select: { id: true, score: true },
    })
    return { success: true, agentId: updated.id, score: updated.score }
  }

  @Tool({
    name: 'get_page_settings',
    annotations: withTitle('Réglages de modération', READ_ONLY),
    description:
      "Récupère les réglages de modération d'un compte social (actions spam/indésirables, instructions, règles FAQ).",
    parameters: accountIdSchema,
  })
  async getPageSettings(args: z.infer<typeof accountIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    await this.assertAccount(ctx.organisationId, args.accountId)
    const settings = await this.prisma.pageSettings.findUnique({
      where: { socialAccountId: args.accountId },
      include: { faqRules: { select: { id: true, question: true, answer: true } } },
    })
    return settings ?? { socialAccountId: args.accountId, isConfigured: false, faqRules: [] }
  }

  @Tool({
    name: 'update_page_settings',
    annotations: withTitle('Mettre à jour les réglages', WRITE_INTERNAL),
    description:
      "Mettre à jour les réglages de modération d'un compte social. Réservé aux administrateurs.",
    parameters: updatePageSettingsSchema,
  })
  async updatePageSettings(
    args: z.infer<typeof updatePageSettingsSchema>,
    _c: unknown,
    request: unknown,
  ) {
    const ctx = mcpContext(request)
    requireAdmin(ctx)
    await this.assertAccount(ctx.organisationId, args.socialAccountId)
    return this.social.updatePageSettings(ctx.userId, args.socialAccountId, {
      undesiredCommentsAction: args.undesiredCommentsAction,
      spamAction: args.spamAction,
      customInstructions: args.customInstructions,
    })
  }

  @Tool({
    name: 'add_faq_rule',
    annotations: withTitle('Ajouter une règle FAQ', WRITE_INTERNAL),
    description:
      "Ajouter une règle FAQ (question → réponse) utilisée pour l'auto-réponse aux commentaires d'un compte social.",
    parameters: faqRuleSchema,
  })
  async addFaqRule(args: z.infer<typeof faqRuleSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    requireAdmin(ctx)
    await this.assertAccount(ctx.organisationId, args.socialAccountId)
    const existing = await this.prisma.pageSettings.findUnique({
      where: { socialAccountId: args.socialAccountId },
      include: { faqRules: { select: { question: true, answer: true } } },
    })
    const faqRules = [
      ...(existing?.faqRules ?? []),
      { question: args.question, answer: args.answer },
    ]
    return this.social.updatePageSettings(ctx.userId, args.socialAccountId, { faqRules })
  }

  private async assertAccount(organisationId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, organisationId },
      select: { id: true },
    })
    if (!account)
      throw new ForbiddenException('Compte social non autorisé pour cette organisation.')
  }
}

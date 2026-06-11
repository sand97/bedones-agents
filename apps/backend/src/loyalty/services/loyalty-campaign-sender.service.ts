import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../auth/encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../../common/config/facebook-scopes.config'
import { CampaignTemplateSelectionDto } from '../dto/loyalty.dto'
import { CampaignAudienceContact, LoyaltyAudienceService } from './loyalty-audience.service'
import { LoyaltyCampaignStatsService } from './loyalty-campaign-stats.service'

@Injectable()
export class LoyaltyCampaignSenderService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private audienceService: LoyaltyAudienceService,
    private campaignStatsService: LoyaltyCampaignStatsService,
  ) {}

  async sendCampaign(campaignId: string) {
    const campaign = await this.prisma.loyaltyCampaign.findUnique({
      where: { id: campaignId },
      include: { socialAccount: { omit: { accessToken: false } } },
    })
    if (!campaign) throw new NotFoundException('Campagne introuvable')
    if (!['SCHEDULED', 'DRAFT', 'RUNNING'].includes(campaign.status)) return
    if (campaign.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Les campagnes sont réservées aux comptes WhatsApp')
    }

    const existingSnapshot = await this.prisma.loyaltyCampaignContact.count({
      where: { campaignId },
    })
    if (existingSnapshot > 0) return

    await this.prisma.loyaltyCampaign.update({
      where: { id: campaignId },
      data: { status: 'RUNNING' },
    })

    const accessToken = await this.encryptionService.decrypt(campaign.socialAccount.accessToken)
    const contacts = await this.resolveCampaignContacts(campaign)
    const assignments = this.resolveCampaignAssignments(campaign)

    let failed = 0
    for (const contact of contacts) {
      const assignment = this.pickTemplateAssignment(assignments, contact.languageCode)
      if (!assignment) {
        failed++
        await this.createFailedCampaignContact(
          campaign.id,
          contact,
          'Aucun template pour la langue du contact',
        )
        continue
      }

      const variables = this.hydrateTemplateVariables(assignment.variableValues ?? {}, contact)
      const renderedBody = this.renderTemplateBody(assignment.body ?? '', variables)
      try {
        const platformMsgId = await this.sendWhatsAppTemplate(
          campaign.socialAccount.providerAccountId,
          contact.participantId,
          accessToken,
          assignment.metaTemplateName,
          assignment.metaTemplateLanguage,
          variables,
          {
            mpmProductRetailerIds: assignment.mpmProductRetailerIds,
            mpmSectionTitle: assignment.mpmSectionTitle,
            mpmThumbnailProductRetailerId: assignment.mpmThumbnailProductRetailerId,
          },
        )
        const message = await this.prisma.directMessage.create({
          data: {
            conversationId: contact.conversationId,
            platformMsgId,
            message: renderedBody || `[template:${assignment.metaTemplateName}]`,
            senderId: campaign.socialAccount.providerAccountId,
            senderName: 'Page',
            isFromPage: true,
            isRead: true,
            mediaType: 'template',
            deliveryStatus: 'sent',
            metadata: {
              kind: 'template',
              campaignId: campaign.id,
              templateId: assignment.metaTemplateId,
              templateName: assignment.metaTemplateName,
              templateLanguage: assignment.metaTemplateLanguage,
              variables,
              mpmProductRetailerIds: assignment.mpmProductRetailerIds ?? [],
            } satisfies Prisma.InputJsonValue,
            createdTime: new Date(),
          },
        })
        await this.prisma.loyaltyCampaignContact.create({
          data: {
            campaignId: campaign.id,
            conversationId: contact.conversationId,
            directMessageId: message.id,
            contactPhone: contact.participantId,
            contactName: contact.participantName,
            languageCode: contact.languageCode,
            templateId: assignment.metaTemplateId,
            templateName: assignment.metaTemplateName,
            templateLanguage: assignment.metaTemplateLanguage,
            platformMsgId,
            status: 'SENT',
            sentAt: new Date(),
          },
        })
        await this.prisma.conversation.update({
          where: { id: contact.conversationId },
          data: {
            lastMessageText: renderedBody || `[template:${assignment.metaTemplateName}]`,
            lastMessageAt: new Date(),
          },
        })
      } catch (error) {
        failed++
        await this.createFailedCampaignContact(
          campaign.id,
          contact,
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    await this.campaignStatsService.refreshCampaignCounts(campaign.id)
    await this.prisma.loyaltyCampaign.update({
      where: { id: campaign.id },
      data: { status: contacts.length > 0 && failed === contacts.length ? 'FAILED' : 'COMPLETED' },
    })
  }

  private async createFailedCampaignContact(
    campaignId: string,
    contact: CampaignAudienceContact,
    error: string,
  ) {
    await this.prisma.loyaltyCampaignContact.create({
      data: {
        campaignId,
        conversationId: contact.conversationId,
        contactPhone: contact.participantId,
        contactName: contact.participantName,
        languageCode: contact.languageCode,
        status: 'FAILED',
        failedAt: new Date(),
        error,
      },
    })
  }

  private resolveCampaignAssignments(campaign: {
    metaTemplateId: string | null
    metaTemplateName: string | null
    metaTemplateLanguage: string | null
    templateAssignments: unknown
    variableValues: unknown
  }): CampaignTemplateSelectionDto[] {
    const assignments =
      (campaign.templateAssignments as CampaignTemplateSelectionDto[] | null) ?? []
    if (assignments.length > 0) return assignments
    if (!campaign.metaTemplateName || !campaign.metaTemplateLanguage) return []
    return [
      {
        allLanguages: true,
        metaTemplateId: campaign.metaTemplateId ?? '',
        metaTemplateName: campaign.metaTemplateName,
        metaTemplateLanguage: campaign.metaTemplateLanguage,
        variableValues: (campaign.variableValues as Record<string, string> | null) ?? {},
      },
    ]
  }

  private pickTemplateAssignment(
    assignments: CampaignTemplateSelectionDto[],
    languageCode: string | null,
  ) {
    const normalized = languageCode ?? 'unknown'
    return (
      assignments.find((assignment) => assignment.allLanguages) ??
      assignments.find((assignment) => assignment.languageCodes?.includes(normalized)) ??
      assignments.find((assignment) => assignment.languageCodes?.includes('unknown')) ??
      null
    )
  }

  private async resolveCampaignContacts(campaign: {
    socialAccountId: string
    audienceType: string | null
    audienceCriteria: unknown
    audienceLimit: number | null
    segmentCriteria: unknown
    marketingTopic: string
  }) {
    const contacts = await this.audienceService.resolveAudienceContacts(campaign.socialAccountId, {
      audienceType: campaign.audienceType ?? undefined,
      audienceCriteria:
        (campaign.audienceCriteria as Record<string, unknown> | null) ??
        (campaign.segmentCriteria as Record<string, unknown> | null) ??
        undefined,
      audienceLimit: campaign.audienceLimit ?? undefined,
      marketingTopic: campaign.marketingTopic,
    })
    return contacts
  }

  private hydrateTemplateVariables(
    values: Record<string, string>,
    contact: CampaignAudienceContact,
  ): Record<string, string> {
    const fullName = contact.participantName || ''
    const firstName = fullName.trim().split(/\s+/)[0] ?? ''
    const lastName = fullName.trim().split(/\s+/).slice(1).join(' ')
    const replacements: Record<string, string> = {
      Nom: lastName,
      Prénom: firstName,
      Prenom: firstName,
      'Nom complet': fullName,
    }
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        let hydrated = value ?? ''
        for (const [token, replacement] of Object.entries(replacements)) {
          hydrated = hydrated.replaceAll(`[${token}]`, replacement).replaceAll(token, replacement)
        }
        return [key, hydrated]
      }),
    )
  }

  private renderTemplateBody(body: string, variables: Record<string, string>) {
    return body.replace(/{{\s*([^}]+?)\s*}}/g, (_, key: string) => variables[key.trim()] ?? '')
  }

  private buildTemplateTextParameter(name: string, text: string) {
    const parameter: Record<string, string> = { type: 'text', text: text ?? '' }
    if (!/^\d+$/.test(name)) {
      parameter.parameter_name = name
    }
    return parameter
  }

  private async sendWhatsAppTemplate(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    templateName: string,
    languageCode: string,
    variables: Record<string, string>,
    options?: {
      mpmProductRetailerIds?: string[]
      mpmSectionTitle?: string
      mpmThumbnailProductRetailerId?: string
    },
  ): Promise<string | null> {
    const entries = Object.entries(variables).sort(([a], [b]) => {
      const an = Number(a)
      const bn = Number(b)
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
      return a.localeCompare(b)
    })
    const components: Array<Record<string, unknown>> = []
    if (entries.length > 0) {
      components.push({
        type: 'body',
        parameters: entries.map(([name, text]) => this.buildTemplateTextParameter(name, text)),
      })
    }

    const mpmProductRetailerIds = (options?.mpmProductRetailerIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean)
    if (mpmProductRetailerIds.length > 30) {
      throw new BadRequestException('Un template multi-produits ne peut envoyer que 30 produits')
    }
    if (mpmProductRetailerIds.length > 0) {
      components.push({
        type: 'button',
        sub_type: 'mpm',
        index: '0',
        parameters: [
          {
            type: 'action',
            action: {
              thumbnail_product_retailer_id:
                options?.mpmThumbnailProductRetailerId ?? mpmProductRetailerIds[0],
              sections: [
                {
                  title: options?.mpmSectionTitle?.trim() || 'Products',
                  product_items: mpmProductRetailerIds.map((id) => ({
                    product_retailer_id: id,
                  })),
                },
              ],
            },
          },
        ],
      })
    }

    const res = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      },
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new BadRequestException(JSON.stringify(json?.error?.message || json))
    return (json as { messages?: Array<{ id: string }> }).messages?.[0]?.id ?? null
  }
}

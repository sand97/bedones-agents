import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  CampaignAudiencePreviewDto,
  CreateLoyaltyBonusDto,
  CreateLoyaltyCampaignDto,
  CreateLoyaltyContactDto,
  CreateLoyaltyTemplateDto,
  UpdateLoyaltyTemplateDto,
  UpdateLoyaltyBonusDto,
  UpdateLoyaltyCampaignDto,
  UpdateLoyaltyContactDto,
} from './dto/loyalty.dto'
import { LoyaltyContactService } from './services/loyalty-contact.service'
import { LoyaltyBonusService } from './services/loyalty-bonus.service'
import { LoyaltyTemplateService, type LoyaltyTemplate } from './services/loyalty-template.service'
import { LoyaltyCampaignService } from './services/loyalty-campaign.service'
import { LoyaltyCampaignSenderService } from './services/loyalty-campaign-sender.service'
import { LoyaltyEngagementService } from './services/loyalty-engagement.service'

export type { LoyaltyTemplate } from './services/loyalty-template.service'
export type {
  LoyaltyCampaignJobName,
  LoyaltyCampaignJobData,
} from './services/loyalty-campaign.service'

/**
 * Façade du domaine fidélité : délègue aux sous-services spécialisés
 * (contacts, bonus, templates, campagnes, envoi, engagement) en conservant
 * l'API publique historique.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private contactService: LoyaltyContactService,
    private bonusService: LoyaltyBonusService,
    private templateService: LoyaltyTemplateService,
    private campaignService: LoyaltyCampaignService,
    private campaignSenderService: LoyaltyCampaignSenderService,
    private engagementService: LoyaltyEngagementService,
  ) {}

  // ─── Contacts ───

  async listContacts(socialAccountId: string, params?: { search?: string }) {
    return this.contactService.listContacts(socialAccountId, params)
  }

  async createContact(data: CreateLoyaltyContactDto) {
    return this.contactService.createContact(data)
  }

  async updateContact(id: string, data: UpdateLoyaltyContactDto) {
    return this.contactService.updateContact(id, data)
  }

  async removeContact(id: string) {
    return this.contactService.removeContact(id)
  }

  // ─── Bonus ───

  async listBonuses(socialAccountId: string, params?: { search?: string; status?: string }) {
    return this.bonusService.listBonuses(socialAccountId, params)
  }

  async getBonus(id: string) {
    return this.bonusService.getBonus(id)
  }

  async createBonus(data: CreateLoyaltyBonusDto) {
    return this.bonusService.createBonus(data)
  }

  async updateBonus(id: string, data: UpdateLoyaltyBonusDto) {
    return this.bonusService.updateBonus(id, data)
  }

  async removeBonus(id: string) {
    return this.bonusService.removeBonus(id)
  }

  // ─── Templates (live from Meta — never persisted) ───

  /** Fetch the live list of WhatsApp Business message templates from Meta. */
  async listTemplates(socialAccountId: string): Promise<LoyaltyTemplate[]> {
    return this.templateService.listTemplates(socialAccountId)
  }

  /** Create a template directly on Meta (it enters Meta's review queue). */
  async createTemplate(data: CreateLoyaltyTemplateDto): Promise<LoyaltyTemplate> {
    return this.templateService.createTemplate(data)
  }

  async updateTemplate(
    socialAccountId: string,
    templateId: string,
    data: UpdateLoyaltyTemplateDto,
  ): Promise<LoyaltyTemplate> {
    return this.templateService.updateTemplate(socialAccountId, templateId, data)
  }

  /** Delete a template on Meta by name (Meta deletes all language variants). */
  async removeTemplate(socialAccountId: string, name: string): Promise<void> {
    return this.templateService.removeTemplate(socialAccountId, name)
  }

  // ─── Campaigns ───

  /**
   * Estimate how many contacts match the given segment criteria — used by the
   * campaign creation modal to give the admin live feedback as they tune the
   * thresholds.
   */
  async previewCampaignCount(
    socialAccountId: string,
    criteria: { minSpend?: number; minOrders?: number },
  ): Promise<{ count: number }> {
    return this.campaignService.previewCampaignCount(socialAccountId, criteria)
  }

  async listCampaigns(socialAccountId: string, params?: { origin?: string }) {
    return this.campaignService.listCampaigns(socialAccountId, params)
  }

  async createCampaign(data: CreateLoyaltyCampaignDto) {
    return this.campaignService.createCampaign(data)
  }

  async updateCampaign(id: string, data: UpdateLoyaltyCampaignDto) {
    return this.campaignService.updateCampaign(id, data)
  }

  async removeCampaign(id: string) {
    return this.campaignService.removeCampaign(id)
  }

  async previewCampaignAudience(socialAccountId: string, dto: CampaignAudiencePreviewDto) {
    return this.campaignService.previewCampaignAudience(socialAccountId, dto)
  }

  async getCampaignDetails(
    id: string,
    params?: { bucket?: string; page?: number; pageSize?: number },
  ) {
    return this.campaignService.getCampaignDetails(id, params)
  }

  async enqueueDueCampaigns() {
    return this.campaignService.enqueueDueCampaigns()
  }

  async sendCampaign(campaignId: string) {
    return this.campaignSenderService.sendCampaign(campaignId)
  }

  @OnEvent('campaign.whatsapp.status')
  async onWhatsAppCampaignStatus(payload: { platformMsgId: string; status: string }) {
    return this.engagementService.onWhatsAppCampaignStatus(payload)
  }

  @OnEvent('message.incoming')
  async onIncomingMessage(payload: {
    conversationId: string
    socialAccountId: string
    provider: string
    message: { text: string }
  }) {
    return this.engagementService.onIncomingMessage(payload)
  }
}

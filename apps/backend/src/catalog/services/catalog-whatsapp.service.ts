import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../auth/encryption.service'
import { CatalogAccessService } from './catalog-access.service'

@Injectable()
export class CatalogWhatsappService {
  private readonly logger = new Logger('CatalogService')
  private readonly META_API_BASE = 'https://graph.facebook.com/v22.0'

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private accessService: CatalogAccessService,
  ) {}

  /**
   * Verify user is a member of the organisation that owns this WhatsApp account.
   */
  private async assertWhatsAppAccess(userId: string, phoneNumberId: string) {
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
      select: { organisationId: true },
    })
    if (!socialAccount) throw new NotFoundException('Compte WhatsApp introuvable')
    await this.accessService.assertMembership(userId, socialAccount.organisationId)
  }

  // ─── WhatsApp Commerce Settings ───

  /**
   * List the Commerce Manager catalogue(s) linked to the number's WABA.
   *
   * This same call doubles as our SMB (WhatsApp Business app) detector: Meta
   * rejects it with error (#10) "This operation can not be performed on SMB
   * business type" for SMB numbers. That rejection is the reliable SMB signal,
   * so we surface `isSmb: true` instead of failing — only such numbers own an
   * in-app catalogue worth migrating to Commerce Manager.
   */
  async getWhatsAppCommerceSettings(userId: string, phoneNumberId: string) {
    await this.assertWhatsAppAccess(userId, phoneNumberId)
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    const response = await fetch(
      `${this.META_API_BASE}/${wabaId}/product_catalogs?access_token=${accessToken}`,
    )

    if (!response.ok) {
      const error = await response.text()
      if (this.isSmbBusinessError(error)) {
        this.logger.log(`[WhatsApp] ${phoneNumberId} is an SMB business (product_catalogs #10)`)
        return { data: [], isSmb: true }
      }
      this.logger.error(`WABA product_catalogs API error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    const data = (await response.json()) as Record<string, unknown>
    return { ...data, isSmb: false }
  }

  /**
   * Meta error (#10) returned when an operation is attempted on an SMB
   * (WhatsApp Business app) business type — our reliable SMB-number signal.
   */
  private isSmbBusinessError(raw: string): boolean {
    return /SMB business type/i.test(raw)
  }

  // ─── Catalog-Phone Association (via WABA) ───

  private async resolveWhatsAppAccount(phoneNumberId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Compte WhatsApp introuvable')
    if (!account.wabaId) throw new BadRequestException('WABA ID manquant pour ce numéro WhatsApp')
    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    return { account, accessToken, wabaId: account.wabaId }
  }

  async associatePhone(catalogId: string, phoneNumberId: string) {
    const [providerId, catalogToken] = await Promise.all([
      this.accessService.getCatalogProviderId(catalogId),
      this.accessService.resolveAccessToken(catalogId),
    ])
    const { accessToken: whatsappToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    // 1. Link catalog to WABA (idempotent — ignore "already linked" errors)
    const wabaRes = await fetch(`${this.META_API_BASE}/${wabaId}/product_catalogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catalogToken}` },
      body: JSON.stringify({ catalog_id: providerId }),
    })
    const wabaBody = await wabaRes.text()
    if (!wabaRes.ok) {
      this.logger.warn(`Meta link catalog to WABA (may already be linked): ${wabaBody}`)
    } else {
      this.logger.log(`[Catalog] WABA link response: ${wabaBody}`)
    }

    // 2. Activate commerce settings on phone number
    const phoneRes = await fetch(
      `${this.META_API_BASE}/${phoneNumberId}/whatsapp_commerce_settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${whatsappToken}` },
        body: JSON.stringify({
          catalog_id: providerId,
          is_catalog_visible: true,
          is_cart_enabled: true,
        }),
      },
    )
    if (!phoneRes.ok) {
      const error = await phoneRes.text()
      this.logger.warn(`Meta activate commerce settings (may already be set): ${error}`)
    }

    this.logger.log(
      `[Catalog] Associated catalog ${providerId} to phone ${phoneNumberId} via WABA ${wabaId}`,
    )
    return { success: true }
  }

  /**
   * Persist a catalogue ⇄ WhatsApp-number link for an SMB (WhatsApp Business
   * app) number. Such numbers can't be linked to a Commerce Manager catalogue
   * through the Meta API (#10), and WhatsApp Web exposes no reliable catalogue
   * id to verify against — so the user links it manually on their phone and we
   * trust them, recording the association in our DB. It can always be removed
   * from the catalogue controls.
   */
  async linkSmbPhone(catalogId: string, phoneNumberId: string) {
    const { account } = await this.resolveWhatsAppAccount(phoneNumberId)
    await this.prisma.catalogSocialAccount.upsert({
      where: { catalogId_socialAccountId: { catalogId, socialAccountId: account.id } },
      update: {},
      create: { catalogId, socialAccountId: account.id },
    })
    this.logger.log(`[Catalog] SMB-linked catalog ${catalogId} ⇄ account ${account.id}`)
    return { success: true }
  }

  async dissociatePhone(catalogId: string, phoneNumberId: string) {
    const [providerId, catalogToken] = await Promise.all([
      this.accessService.getCatalogProviderId(catalogId),
      this.accessService.resolveAccessToken(catalogId),
    ])
    const {
      account,
      accessToken: whatsappToken,
      wabaId,
    } = await this.resolveWhatsAppAccount(phoneNumberId)

    // 1. Deactivate commerce settings on phone number
    const phoneRes = await fetch(
      `${this.META_API_BASE}/${phoneNumberId}/whatsapp_commerce_settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${whatsappToken}` },
        body: JSON.stringify({
          catalog_id: '',
          is_catalog_visible: false,
          is_cart_enabled: false,
        }),
      },
    )
    if (!phoneRes.ok) {
      const error = await phoneRes.text()
      this.logger.warn(`Meta deactivate commerce settings (may already be off): ${error}`)
    }

    // 2. Remove catalog from WABA
    const wabaRes = await fetch(`${this.META_API_BASE}/${wabaId}/product_catalogs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catalogToken}` },
      body: JSON.stringify({ catalog_id: providerId }),
    })
    if (!wabaRes.ok) {
      const error = await wabaRes.text()
      this.logger.warn(`Meta remove catalog from WABA (may already be removed): ${error}`)
    }

    // Remove our DB link too — this is the only association SMB numbers ever had.
    await this.prisma.catalogSocialAccount.deleteMany({
      where: { catalogId, socialAccountId: account.id },
    })

    this.logger.log(
      `[Catalog] Dissociated catalog ${providerId} from phone ${phoneNumberId} via WABA ${wabaId}`,
    )
    return { success: true }
  }
}

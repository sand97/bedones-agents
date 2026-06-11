import { Injectable } from '@nestjs/common'
import { CatalogAccessService } from './services/catalog-access.service'
import { CatalogManagementService } from './services/catalog-management.service'
import { CatalogProductQueryService } from './services/catalog-product-query.service'
import { CatalogProductWriteService } from './services/catalog-product-write.service'
import { CatalogCollectionService } from './services/catalog-collection.service'
import { CatalogWhatsappService } from './services/catalog-whatsapp.service'
import { CatalogImageTemplateService } from './services/catalog-image-template.service'

/**
 * Façade du domaine catalogue : délègue aux sous-services spécialisés
 * (accès/tokens, CRUD, produits, collections, WhatsApp Commerce, templates
 * image) en conservant l'API publique historique.
 */
@Injectable()
export class CatalogService {
  constructor(
    private accessService: CatalogAccessService,
    private managementService: CatalogManagementService,
    private productQueryService: CatalogProductQueryService,
    private productWriteService: CatalogProductWriteService,
    private collectionService: CatalogCollectionService,
    private whatsappService: CatalogWhatsappService,
    private imageTemplateService: CatalogImageTemplateService,
  ) {}

  // ─── CRUD ───

  async findAllByOrg(userId: string, organisationId: string) {
    return this.managementService.findAllByOrg(userId, organisationId)
  }

  async findById(userId: string, id: string) {
    return this.managementService.findById(userId, id)
  }

  async create(
    userId: string,
    data: { organisationId: string; name: string; providerId?: string },
  ) {
    return this.managementService.create(userId, data)
  }

  async update(userId: string, id: string, data: { name?: string }) {
    return this.managementService.update(userId, id, data)
  }

  async remove(userId: string, id: string) {
    return this.managementService.remove(userId, id)
  }

  // ─── Social Account Links ───

  async linkSocialAccounts(userId: string, catalogId: string, socialAccountIds: string[]) {
    return this.managementService.linkSocialAccounts(userId, catalogId, socialAccountIds)
  }

  // ─── Products (Meta Graph API proxy) ───

  /**
   * Fetch a subset of catalog products by their Meta product IDs. Missing
   * products are returned as `null` at the matching index so the caller can
   * align the response with the request order (handy for placeholder rendering
   * on the frontend).
   */
  async findProductsByIds(catalogId: string, productIds: string[]) {
    return this.productQueryService.findProductsByIds(catalogId, productIds)
  }

  /**
   * Fetch a subset of catalog products by their retailer IDs, via Meta Graph API.
   * Resolves the access token from any social account linked to the catalog whose
   * providerId matches `catalogProviderId` (Meta catalog ID).
   *
   * Returns an array of `{ retailerId, name, imageUrl, price, currency }`. Missing
   * products are simply omitted — callers should fall back to the retailer ID.
   */
  async hydrateProductsByRetailerIds(
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    return this.productQueryService.hydrateProductsByRetailerIds(catalogProviderId, retailerIds)
  }

  async hydrateProductsByRetailerIdsWithAccessToken(
    catalogProviderId: string,
    retailerIds: string[],
    accessToken: string,
  ): Promise<
    Array<{
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    return this.productQueryService.hydrateProductsByRetailerIdsWithAccessToken(
      catalogProviderId,
      retailerIds,
      accessToken,
    )
  }

  async findProducts(
    catalogId: string,
    params?: {
      search?: string
      status?: string
      after?: string
      limit?: number
      collectionId?: string
    },
  ) {
    return this.productQueryService.findProducts(catalogId, params)
  }

  // ─── Webhook: external catalog changes ───

  async handleWebhookUpdate(providerId: string, _changes: Record<string, unknown>) {
    return this.managementService.handleWebhookUpdate(providerId, _changes)
  }

  // ─── Analysis status helpers ───

  async getAnalysisProgress(catalogId: string) {
    return this.managementService.getAnalysisProgress(catalogId)
  }

  // ─── Image Studio Templates ───

  async findImageTemplates(catalogId: string) {
    return this.imageTemplateService.findImageTemplates(catalogId)
  }

  async createImageTemplate(
    catalogId: string,
    dto: {
      name: string
      format: string
      accent?: string
      definition: Record<string, unknown>
      sourceKey?: string
    },
  ) {
    return this.imageTemplateService.createImageTemplate(catalogId, dto)
  }

  async updateImageTemplate(
    catalogId: string,
    templateId: string,
    dto: {
      name?: string
      format?: string
      accent?: string
      definition?: Record<string, unknown>
    },
  ) {
    return this.imageTemplateService.updateImageTemplate(catalogId, templateId, dto)
  }

  async deleteImageTemplate(catalogId: string, templateId: string) {
    return this.imageTemplateService.deleteImageTemplate(catalogId, templateId)
  }

  // ─── Authorization helpers ───

  /**
   * Verify user is a member of the organisation that owns this catalog.
   * Returns the catalog for convenience.
   */
  async assertCatalogAccess(userId: string, catalogId: string) {
    return this.accessService.assertCatalogAccess(userId, catalogId)
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
    return this.whatsappService.getWhatsAppCommerceSettings(userId, phoneNumberId)
  }

  // ─── Product CRUD via Meta API ───

  async createProduct(
    catalogId: string,
    data: {
      name: string
      retailerId: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
      collectionId?: string
    },
  ) {
    return this.productWriteService.createProduct(catalogId, data)
  }

  async updateProduct(
    catalogId: string,
    productId: string,
    data: {
      name?: string
      retailerId?: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
    },
  ) {
    return this.productWriteService.updateProduct(catalogId, productId, data)
  }

  async deleteProduct(catalogId: string, productId: string) {
    return this.productWriteService.deleteProduct(catalogId, productId)
  }

  // ─── Collections (Product Sets) ───

  async findCollections(catalogId: string) {
    return this.collectionService.findCollections(catalogId)
  }

  async createCollection(catalogId: string, data: { name: string; productIds?: string[] }) {
    return this.collectionService.createCollection(catalogId, data)
  }

  async updateCollection(catalogId: string, collectionId: string, data: { name?: string }) {
    return this.collectionService.updateCollection(catalogId, collectionId, data)
  }

  async deleteCollection(catalogId: string, collectionId: string) {
    return this.collectionService.deleteCollection(catalogId, collectionId)
  }

  // ─── Catalog-Phone Association (via WABA) ───

  async associatePhone(catalogId: string, phoneNumberId: string) {
    return this.whatsappService.associatePhone(catalogId, phoneNumberId)
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
    return this.whatsappService.linkSmbPhone(catalogId, phoneNumberId)
  }

  async dissociatePhone(catalogId: string, phoneNumberId: string) {
    return this.whatsappService.dissociatePhone(catalogId, phoneNumberId)
  }
}

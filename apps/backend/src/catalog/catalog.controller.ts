import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CatalogService } from './catalog.service'
import {
  CreateCatalogDto,
  UpdateCatalogDto,
  LinkSocialAccountsDto,
  CreateProductDto,
  UpdateProductDto,
  CreateCollectionDto,
  UpdateCollectionDto,
  AssociatePhoneDto,
} from './dto/catalog.dto'

@ApiTags('Catalog')
@Controller('catalog')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get('org/:organisationId')
  async findAll(
    @CurrentUser() user: { id: string },
    @Param('organisationId') organisationId: string,
  ) {
    return this.catalogService.findAllByOrg(user.id, organisationId)
  }

  @Get('whatsapp-commerce/:phoneNumberId')
  async getWhatsAppCommerceSettings(
    @CurrentUser() user: { id: string },
    @Param('phoneNumberId') phoneNumberId: string,
  ) {
    return this.catalogService.getWhatsAppCommerceSettings(user.id, phoneNumberId)
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.catalogService.findById(user.id, id)
  }

  @Post()
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateCatalogDto) {
    return this.catalogService.create(user.id, dto)
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCatalogDto,
  ) {
    return this.catalogService.update(user.id, id, dto)
  }

  @Delete(':id')
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.catalogService.remove(user.id, id)
  }

  @Post(':id/link-social-accounts')
  async linkSocialAccounts(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: LinkSocialAccountsDto,
  ) {
    return this.catalogService.linkSocialAccounts(user.id, id, dto.socialAccountIds)
  }

  @Get(':id/products')
  async findProducts(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.findProducts(id, {
      search,
      status,
      after,
      limit: limit ? parseInt(limit) : undefined,
    })
  }

  @Post(':id/products')
  async createProduct(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateProductDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.createProduct(id, dto)
  }

  @Patch(':catalogId/products/:productId')
  async updateProduct(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.catalogService.updateProduct(catalogId, productId, dto)
  }

  @Delete(':catalogId/products/:productId')
  async deleteProduct(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('productId') productId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.catalogService.deleteProduct(catalogId, productId)
  }

  @Get(':id/analysis-progress')
  async getAnalysisProgress(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.getAnalysisProgress(id)
  }

  // ─── Collections (Product Sets) ───

  @Get(':id/collections')
  async findCollections(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.findCollections(id)
  }

  @Post(':id/collections')
  async createCollection(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateCollectionDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.createCollection(id, dto)
  }

  @Patch(':catalogId/collections/:collectionId')
  async updateCollection(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('collectionId') collectionId: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.catalogService.updateCollection(catalogId, collectionId, dto)
  }

  @Delete(':catalogId/collections/:collectionId')
  async deleteCollection(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('collectionId') collectionId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.catalogService.deleteCollection(catalogId, collectionId)
  }

  // ─── Catalog-Phone Association ───

  @Post(':id/associate-phone')
  async associatePhone(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AssociatePhoneDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.associatePhone(id, dto.phoneNumberId)
  }

  @Delete(':id/dissociate-phone/:phoneNumberId')
  async dissociatePhone(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('phoneNumberId') phoneNumberId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, id)
    return this.catalogService.dissociatePhone(id, phoneNumberId)
  }
}

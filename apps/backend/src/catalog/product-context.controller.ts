import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CatalogService } from './catalog.service'
import { ProductContextService } from './product-context.service'
import {
  AnalyzeContextDto,
  LinkPostsDto,
  SaveContextDto,
  UpdateProductContextDto,
} from './dto/catalog.dto'

@ApiTags('Catalog')
@Controller('catalog')
@UseGuards(AuthGuard)
export class ProductContextController {
  constructor(
    private readonly contextService: ProductContextService,
    private readonly catalogService: CatalogService,
  ) {}

  // ─── Context ───

  @Get(':catalogId/product-contexts')
  async listProductContexts(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Query('ids') ids?: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    const list = ids ? ids.split(',').filter(Boolean) : undefined
    return this.contextService.listProductContexts(catalogId, list)
  }

  @Get(':catalogId/collection-contexts')
  async listCollectionContexts(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Query('ids') ids?: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    const list = ids ? ids.split(',').filter(Boolean) : undefined
    return this.contextService.listCollectionContexts(catalogId, list)
  }

  @Get(':catalogId/products/:productId/context')
  async getProductContext(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('productId') productId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.getProductContextDetail(catalogId, productId)
  }

  @Post(':catalogId/product-contexts/analyze')
  async analyzeContext(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Body() dto: AnalyzeContextDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.analyzeContext(catalogId, dto)
  }

  @Post(':catalogId/product-contexts/save')
  async saveContext(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Body() dto: SaveContextDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.saveContext(catalogId, dto)
  }

  @Patch(':catalogId/products/:productId/context')
  async updateProductContext(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductContextDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.updateSingleProductContext(catalogId, productId, dto)
  }

  // ─── Post linking ───

  @Post(':catalogId/post-links')
  async linkPosts(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Body() dto: LinkPostsDto,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.linkPosts(catalogId, dto)
  }

  @Get(':catalogId/products/:productId/post-links')
  async listProductLinks(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.listProductPostLinks(catalogId, productId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })
  }

  @Get(':catalogId/collections/:collectionId/post-links')
  async listCollectionLinks(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('collectionId') collectionId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.listCollectionPostLinks(catalogId, collectionId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })
  }

  @Delete(':catalogId/product-post-links/:linkId')
  async deleteProductLink(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('linkId') linkId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.deleteProductPostLink(catalogId, linkId)
  }

  @Delete(':catalogId/collection-post-links/:linkId')
  async deleteCollectionLink(
    @CurrentUser() user: { id: string },
    @Param('catalogId') catalogId: string,
    @Param('linkId') linkId: string,
  ) {
    await this.catalogService.assertCatalogAccess(user.id, catalogId)
    return this.contextService.deleteCollectionPostLink(catalogId, linkId)
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { UploadService } from '../upload/upload.service'
import {
  CallbackMigrationId,
  CatalogMigrationCallbackGuard,
} from './catalog-migration-callback.guard'
import { SaveCatalogDto, UploadImageDto } from './dto/callback.dto'

/** Public storage key of the temporary catalogue JSON for a migration. */
export function catalogJsonKey(migrationId: string): string {
  return `catalog-migration/${migrationId}/catalog.json`
}

/**
 * Receives the page-script callbacks. The script (running in the connected
 * WhatsApp session) downloads images from WhatsApp and streams them here, then
 * posts the assembled catalogue. Authenticated by the per-migration token.
 */
@ApiTags('Catalog Migration Callback')
@Controller('catalog-migration/callback')
@UseGuards(CatalogMigrationCallbackGuard)
export class CatalogMigrationCallbackController {
  constructor(private readonly upload: UploadService) {}

  @Post('upload-image')
  @ApiOperation({ summary: 'Re-host a product image on our storage (called by the page script)' })
  async uploadImage(@CallbackMigrationId() migrationId: string, @Body() dto: UploadImageDto) {
    const { buffer, contentType } = decodeImage(dto.image)
    const name = `${dto.productId ?? 'product'}-${dto.imageIndex ?? 0}`
    const url = await this.upload.uploadBuffer(
      buffer,
      name,
      contentType,
      `catalog-migration/${migrationId}`,
    )
    return { url }
  }

  @Post('save-catalog')
  @ApiOperation({ summary: 'Persist the extracted catalogue as a temporary JSON on Minio' })
  async saveCatalog(@CallbackMigrationId() migrationId: string, @Body() dto: SaveCatalogDto) {
    const products = Array.isArray(dto.products) ? dto.products : []
    await this.upload.uploadJsonAtKey(catalogJsonKey(migrationId), { migrationId, products })
    return { success: true, count: products.length }
  }
}

/** Decode a base64 data URL (or raw base64) into a Buffer + content type. */
function decodeImage(image: string): { buffer: Buffer; contentType: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(image || '')
  if (match) {
    return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] || 'image/jpeg' }
  }
  return { buffer: Buffer.from(image || '', 'base64'), contentType: 'image/jpeg' }
}

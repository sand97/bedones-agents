import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { CatalogMigration } from '../../generated/prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { CatalogService } from '../catalog/catalog.service'
import { UploadService } from '../upload/upload.service'
import { CATALOG_MIGRATION_QUEUE } from '../queue/queue.module'

import { CatalogConnectorClient, ExtractedProduct } from './catalog-connector.client'
import { StartCatalogMigrationDto } from './dto/catalog-migration.dto'

/** Data carried by every job on the `catalog-migration` queue. */
export interface CatalogMigrationJobData {
  migrationId: string
  organisationId: string
  catalogId: string
  sourcePhone: string
}

/** A product shaped for CatalogService.createProduct (pushed to Meta). */
interface PreparedProduct {
  name: string
  description?: string
  imageUrl?: string
  additionalImageUrls?: string[]
  price?: string
  currency?: string
  availability?: string
}

/** Notion spec: an extraction is capped at ~1 minute, one at a time. */
const MINUTES_PER_SYNC = 1

@Injectable()
export class CatalogMigrationService {
  private readonly logger = new Logger(CatalogMigrationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
    private readonly catalogService: CatalogService,
    private readonly connector: CatalogConnectorClient,
    private readonly upload: UploadService,
    @InjectQueue(CATALOG_MIGRATION_QUEUE)
    private readonly queue: Queue<CatalogMigrationJobData>,
  ) {}

  // ─── Public API (controller) ───

  /**
   * Queue a migration of a WhatsApp number's public catalogue into a
   * Commerce Manager catalogue. The destination catalogue must already be
   * connected to Meta (it has a `providerId`).
   */
  async startMigration(userId: string, dto: StartCatalogMigrationDto) {
    const catalog = await this.prisma.catalog.findUnique({ where: { id: dto.catalogId } })
    if (!catalog) throw new NotFoundException('Catalogue not found')
    await this.catalogService.assertCatalogAccess(userId, catalog.id)

    if (!catalog.providerId) {
      throw new BadRequestException(
        'This catalogue is not connected to Commerce Manager yet — connect it before importing products',
      )
    }

    const sourcePhone = dto.sourcePhone.replace(/[^0-9]/g, '')
    if (!sourcePhone) {
      throw new BadRequestException('A valid WhatsApp source number is required')
    }

    const organisationId = catalog.organisationId

    const migration = await this.prisma.catalogMigration.create({
      data: {
        organisationId,
        catalogId: catalog.id,
        sourcePhone,
        sourceSocialAccountId: dto.sourceSocialAccountId ?? null,
        status: 'QUEUED',
      },
    })

    const jobId = `migrate-${migration.id}`
    await this.queue.add(
      'migrate',
      {
        migrationId: migration.id,
        organisationId,
        catalogId: catalog.id,
        sourcePhone,
      },
      { jobId, attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    )

    const updated = await this.prisma.catalogMigration.update({
      where: { id: migration.id },
      data: { jobId },
    })

    // Refresh everybody's position now that a new job joined the queue.
    await this.broadcastQueueState()

    const { position, etaMinutes } = await this.computePositionEta(jobId)
    return this.toResponse(updated, position, etaMinutes)
  }

  /** Status of one migration, including its live queue position when QUEUED. */
  async getMigrationStatus(userId: string, id: string) {
    const migration = await this.prisma.catalogMigration.findUnique({ where: { id } })
    if (!migration) throw new NotFoundException('Migration not found')
    await this.catalogService.assertCatalogAccess(userId, migration.catalogId)

    let position = 0
    let etaMinutes = 0
    if (migration.status === 'QUEUED' && migration.jobId) {
      ;({ position, etaMinutes } = await this.computePositionEta(migration.jobId))
    }
    return this.toResponse(migration, position, etaMinutes)
  }

  /**
   * Latest in-flight migration for an organisation (QUEUED/EXTRACTING/IMPORTING).
   * Used by the frontend to resume the wizard on the progress step after a
   * reload or navigation. Returns null when nothing is running.
   */
  async getActiveForOrg(userId: string, organisationId: string) {
    const migration = await this.prisma.catalogMigration.findFirst({
      where: {
        organisationId,
        status: { in: ['QUEUED', 'EXTRACTING', 'IMPORTING'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!migration) return null
    await this.catalogService.assertCatalogAccess(userId, migration.catalogId)

    let position = 0
    let etaMinutes = 0
    if (migration.status === 'QUEUED' && migration.jobId) {
      ;({ position, etaMinutes } = await this.computePositionEta(migration.jobId))
    }
    return this.toResponse(migration, position, etaMinutes)
  }

  // ─── Worker entry points ───

  /**
   * Run a migration end-to-end. Called by the processor; progress is streamed
   * both to Bull (`onProgress`) and to the browser over websockets.
   */
  async runMigration(
    migrationId: string,
    onProgress?: (percentage: number) => void,
  ): Promise<void> {
    const migration = await this.prisma.catalogMigration.findUnique({ where: { id: migrationId } })
    if (!migration) {
      this.logger.warn(`Migration ${migrationId} vanished before processing`)
      return
    }
    const { organisationId, catalogId, sourcePhone } = migration

    try {
      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: { status: 'EXTRACTING', startedAt: new Date() },
      })
      this.gateway.emitToOrg(organisationId, 'catalog:migration-started', {
        migrationId,
        catalogId,
      })
      onProgress?.(5)

      // 1) Extract the public catalogue from the connected WhatsApp session
      //    (page script injected through the connector, targeting the client wid).
      const clientUserId = `${sourcePhone}@c.us`
      const extracted = await this.connector.extractClientCatalog(clientUserId)

      // 2) Re-host the (in-browser downloaded) images on our storage so Meta can
      //    fetch them, and shape the products for the Meta catalogue.
      const prepared = await this.prepareProducts(migrationId, extracted)

      // 3) Keep a temporary JSON of the catalogue on Minio for the duration of
      //    the sync (no product is persisted in our DB).
      await this.storeCatalogJson(migrationId, prepared)

      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: { status: 'IMPORTING', totalProducts: prepared.length },
      })
      this.emitProgress(organisationId, migrationId, {
        imported: 0,
        failed: 0,
        total: prepared.length,
        percentage: 10,
      })
      onProgress?.(10)

      let imported = 0
      let failed = 0
      for (let i = 0; i < prepared.length; i++) {
        try {
          await this.catalogService.createProduct(catalogId, prepared[i])
          imported++
        } catch (error) {
          failed++
          const message = error instanceof Error ? error.message : String(error)
          this.logger.warn(`Failed to import "${prepared[i]?.name}" into ${catalogId}: ${message}`)
        }

        const percentage =
          prepared.length > 0 ? Math.round(10 + ((i + 1) / prepared.length) * 90) : 100
        onProgress?.(percentage)
        await this.prisma.catalogMigration.update({
          where: { id: migrationId },
          data: { importedProducts: imported, failedProducts: failed },
        })
        this.emitProgress(organisationId, migrationId, {
          imported,
          failed,
          total: prepared.length,
          percentage,
        })
      }

      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          importedProducts: imported,
          failedProducts: failed,
        },
      })
      this.gateway.emitToOrg(organisationId, 'catalog:migration-completed', {
        migrationId,
        catalogId,
        imported,
        failed,
        total: prepared.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      })
      this.gateway.emitToOrg(organisationId, 'catalog:migration-failed', {
        migrationId,
        catalogId,
        error: message,
      })
      // Re-throw so Bull marks the job failed and the queue moves on.
      throw error
    }
  }

  /**
   * Recompute every waiting migration's position/ETA and push it to its org.
   * Called whenever the queue changes (job becomes active / completes / fails)
   * so each connected browser decrements its "minutes before your turn".
   */
  async broadcastQueueState(): Promise<void> {
    try {
      const [active, waiting] = await Promise.all([
        this.queue.getActive(0, -1),
        this.queue.getWaiting(0, -1),
      ])
      const activeCount = active.length

      for (let i = 0; i < waiting.length; i++) {
        const data = waiting[i].data
        if (!data?.migrationId || !data?.organisationId) continue
        const ahead = activeCount + i
        this.gateway.emitToOrg(data.organisationId, 'catalog:migration-queue', {
          migrationId: data.migrationId,
          position: ahead,
          etaMinutes: ahead * MINUTES_PER_SYNC,
        })
      }
    } catch (error) {
      // Never let a websocket/queue read crash the worker lifecycle.
      this.logger.warn(
        `broadcastQueueState failed: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  // ─── Helpers ───

  private emitProgress(
    organisationId: string,
    migrationId: string,
    data: { imported: number; failed: number; total: number; percentage: number },
  ) {
    this.gateway.emitToOrg(organisationId, 'catalog:migration-progress', {
      migrationId,
      status: 'IMPORTING',
      ...data,
    })
  }

  /** Find a job's position in the queue and estimate the minutes before it starts. */
  private async computePositionEta(
    jobId: string,
  ): Promise<{ position: number; etaMinutes: number }> {
    const [active, waiting] = await Promise.all([
      this.queue.getActive(0, -1),
      this.queue.getWaiting(0, -1),
    ])
    if (active.some((job) => job.id === jobId)) {
      return { position: 0, etaMinutes: 0 }
    }
    const index = waiting.findIndex((job) => job.id === jobId)
    if (index === -1) return { position: 0, etaMinutes: 0 }
    const ahead = active.length + index
    return { position: ahead, etaMinutes: ahead * MINUTES_PER_SYNC }
  }

  /**
   * Re-host every product's images on our storage (Meta can't fetch the
   * short-lived, auth-gated WhatsApp CDN URLs) and shape the products for
   * `CatalogService.createProduct` (price is sent as a major-unit string —
   * createProduct converts to Meta's minor units).
   */
  private async prepareProducts(
    migrationId: string,
    extracted: ExtractedProduct[],
  ): Promise<PreparedProduct[]> {
    const prepared: PreparedProduct[] = []
    for (const product of extracted) {
      const urls: string[] = []
      const images = [...(product.images ?? [])].sort((a, b) => a.index - b.index)
      for (const image of images) {
        const url = await this.rehostImage(migrationId, product.id, image.index, image.data)
        if (url) urls.push(url)
      }
      prepared.push({
        name: product.name || 'Sans nom',
        description: product.description ?? undefined,
        imageUrl: urls[0],
        additionalImageUrls: urls.length > 1 ? urls.slice(1) : undefined,
        // WhatsApp price is in major units here (extracted as amount/1000).
        price: product.price != null ? String(product.price) : undefined,
        currency: product.currency ?? undefined,
        availability: product.availability ?? undefined,
      })
    }
    return prepared
  }

  /** Decode a base64 data URL and upload it; returns the public URL or null. */
  private async rehostImage(
    migrationId: string,
    productId: string,
    index: number,
    dataUrl: string,
  ): Promise<string | null> {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '')
    if (!match) return null
    const contentType = match[1] || 'image/jpeg'
    try {
      const buffer = Buffer.from(match[2], 'base64')
      return await this.upload.uploadBuffer(
        buffer,
        `${productId}-${index}`,
        contentType,
        `catalog-migration/${migrationId}`,
      )
    } catch (error) {
      this.logger.warn(
        `Failed to re-host image ${productId}-${index}: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }

  /** Persist the prepared catalogue as a temporary JSON on Minio for the sync. */
  private async storeCatalogJson(migrationId: string, products: PreparedProduct[]): Promise<void> {
    try {
      const buffer = Buffer.from(JSON.stringify({ migrationId, products }, null, 2), 'utf8')
      await this.upload.uploadBuffer(
        buffer,
        `catalog-${migrationId}`,
        'application/json',
        `catalog-migration/${migrationId}`,
      )
    } catch (error) {
      // Non-fatal: the import can still proceed from the in-memory products.
      this.logger.warn(
        `Failed to store temporary catalogue JSON for ${migrationId}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  private toResponse(migration: CatalogMigration, position: number, etaMinutes: number) {
    return {
      id: migration.id,
      catalogId: migration.catalogId,
      sourcePhone: migration.sourcePhone,
      status: migration.status,
      totalProducts: migration.totalProducts,
      importedProducts: migration.importedProducts,
      failedProducts: migration.failedProducts,
      error: migration.error,
      position,
      etaMinutes,
      createdAt: migration.createdAt,
    }
  }
}

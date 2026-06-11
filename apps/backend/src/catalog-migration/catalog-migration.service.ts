import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'
import type { CatalogMigration } from '../../generated/prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { CatalogService } from '../catalog/catalog.service'
import { UploadService } from '../upload/upload.service'
import { CATALOG_MIGRATION_QUEUE } from '../queue/queue.module'

import { CatalogConnectorClient } from './catalog-connector.client'
import { catalogJsonKey } from './catalog-migration-callback.controller'
import { MIGRATION_CALLBACK_SCOPE } from './catalog-migration-callback.guard'
import { StartCatalogMigrationDto } from './dto/catalog-migration.dto'
import {
  MINUTES_PER_SYNC,
  deriveErrorCode,
  isAlreadyExists,
  isWrongCatalogVertical,
  toCreateProduct,
} from './catalog-migration.helpers'
import type { StoredCollection, StoredProduct } from './catalog-migration.helpers'

/** Data carried by every job on the `catalog-migration` queue. */
export interface CatalogMigrationJobData {
  migrationId: string
  organisationId: string
  catalogId: string
  sourcePhone: string
}

@Injectable()
export class CatalogMigrationService {
  private readonly logger = new Logger(CatalogMigrationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
    private readonly catalogService: CatalogService,
    private readonly connector: CatalogConnectorClient,
    private readonly upload: UploadService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  /**
   * Last completed sync for a catalogue (which number fed it, and when) — used
   * by the catalogue page's "Products synced from … at …" banner + re-sync.
   */
  async getLastSync(userId: string, catalogId: string) {
    await this.catalogService.assertCatalogAccess(userId, catalogId)
    const last = await this.prisma.catalogMigration.findFirst({
      where: { catalogId, status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
    })
    if (!last) return null
    return {
      sourcePhone: last.sourcePhone,
      sourceSocialAccountId: last.sourceSocialAccountId,
      finishedAt: last.finishedAt,
      importedProducts: last.importedProducts,
    }
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
      // Live "extraction starting" signal so the UI shows a spinner + 0%
      // before the connector starts streaming per-product progress.
      this.gateway.emitToOrg(organisationId, 'catalog:migration-progress', {
        migrationId,
        status: 'EXTRACTING',
        imported: 0,
        failed: 0,
        total: 0,
        percentage: 0,
      })

      // 1) Inject the extraction script into the connector. It downloads the
      //    images (streaming them to our upload-image callback) and posts the
      //    assembled catalogue to save-catalog, stored as a temporary JSON on
      //    Minio — no product is persisted in our DB.
      const clientUserId = `${sourcePhone}@c.us`
      const token = this.jwt.sign(
        { migrationId, scope: MIGRATION_CALLBACK_SCOPE },
        { expiresIn: '30m' },
      )
      const backendUrl =
        this.config.get<string>('WHATSAPP_MIGRATION_CALLBACK_URL') ||
        this.config.get<string>('APP_URL') ||
        ''
      await this.connector.extractClientCatalog({ clientUserId, backendUrl, token })

      // 2) Load the catalogue the script just stored on Minio and shape it for
      //    the Meta catalogue.
      const stored = await this.upload.getJson<{
        products: StoredProduct[]
        collections?: StoredCollection[]
      }>(catalogJsonKey(migrationId))
      const prepared = (stored?.products ?? []).map((p) => toCreateProduct(p))
      const storedCollections = stored?.collections ?? []

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
          const message = error instanceof Error ? error.message : String(error)
          // Re-sync: a product already present in the catalogue (same
          // retailer_id) is a no-op on Meta's side — count it, don't fail it.
          if (isAlreadyExists(message)) {
            imported++
          } else {
            failed++
            this.logger.warn(
              `Failed to import "${prepared[i]?.name}" into ${catalogId}: ${message}`,
            )
            // A wrong catalog vertical rejects every product identically — abort
            // now with an actionable error instead of hammering Meta for each
            // product (and then each collection).
            if (isWrongCatalogVertical(message)) throw error
          }
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

      // Recreate the collections (product sets) on the Meta catalogue. Their
      // membership is a retailer_id filter, so the products imported above are
      // matched automatically.
      let collectionsCreated = 0
      for (const collection of storedCollections) {
        const retailerIds = (collection.retailerIds ?? []).filter(Boolean)
        if (!collection.name || retailerIds.length === 0) continue
        try {
          await this.createCollectionWithRetry(catalogId, {
            name: collection.name,
            productIds: retailerIds,
          })
          collectionsCreated++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // A collection (product set) that already exists is also counted.
          if (isAlreadyExists(message)) {
            collectionsCreated++
          } else {
            this.logger.warn(`Failed to create collection "${collection.name}": ${message}`)
          }
        }
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

      // Record the number ⇄ catalogue link in our DB (source of truth for our
      // app/AI), regardless of any WhatsApp-native linking the user does. This
      // is why the wizard no longer needs an explicit "I'm done" step.
      if (migration.sourceSocialAccountId) {
        await this.prisma.catalogSocialAccount.upsert({
          where: {
            catalogId_socialAccountId: {
              catalogId,
              socialAccountId: migration.sourceSocialAccountId,
            },
          },
          update: {},
          create: { catalogId, socialAccountId: migration.sourceSocialAccountId },
        })
      }

      this.gateway.emitToOrg(organisationId, 'catalog:migration-completed', {
        migrationId,
        catalogId,
        imported,
        failed,
        total: prepared.length,
        collections: collectionsCreated,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = deriveErrorCode(message)
      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      })
      this.gateway.emitToOrg(organisationId, 'catalog:migration-failed', {
        migrationId,
        catalogId,
        error: message,
        errorCode,
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

  /**
   * Relay extraction progress (page script → callback → browser). During
   * extraction the connector pings us once per product whose images are done,
   * so the user sees a live percentage on the slowest phase.
   */
  async reportExtractionProgress(migrationId: string, processed: number, total: number) {
    const migration = await this.prisma.catalogMigration.findUnique({ where: { id: migrationId } })
    if (!migration) return
    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
    this.gateway.emitToOrg(migration.organisationId, 'catalog:migration-progress', {
      migrationId,
      status: 'EXTRACTING',
      imported: processed,
      failed: 0,
      total,
      percentage,
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
   * Create a product set, retrying the "empty product set" error. Meta indexes
   * freshly-created products asynchronously, so a set whose retailer_id filter
   * matches products created moments earlier can momentarily look empty — we
   * back off and let the index catch up.
   */
  private async createCollectionWithRetry(
    catalogId: string,
    data: { name: string; productIds: string[] },
    attempts = 5,
  ): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.catalogService.createCollection(catalogId, data)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const isEmptySet = /1798130|empty product set/i.test(message)
        if (!isEmptySet || attempt === attempts) throw error
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
      }
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
      errorCode: deriveErrorCode(migration.error),
      position,
      etaMinutes,
      createdAt: migration.createdAt,
    }
  }
}

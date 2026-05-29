import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import type { CatalogMigration } from '../../generated/prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { CatalogService } from '../catalog/catalog.service'
import { CATALOG_MIGRATION_QUEUE } from '../queue/queue.module'

import { CatalogConnectorClient, ConnectorProduct } from './catalog-connector.client'
import { StartCatalogMigrationDto } from './dto/catalog-migration.dto'

/** Data carried by every job on the `catalog-migration` queue. */
export interface CatalogMigrationJobData {
  migrationId: string
  organisationId: string
  catalogId: string
  sourcePhone: string
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
      this.gateway.emitToOrg(organisationId, 'catalog:migration-started', { migrationId, catalogId })
      onProgress?.(5)

      const products = await this.connector.fetchPublicCatalog(sourcePhone)

      await this.prisma.catalogMigration.update({
        where: { id: migrationId },
        data: { status: 'IMPORTING', totalProducts: products.length },
      })
      this.emitProgress(organisationId, migrationId, {
        imported: 0,
        failed: 0,
        total: products.length,
        percentage: 10,
      })
      onProgress?.(10)

      let imported = 0
      let failed = 0
      for (let i = 0; i < products.length; i++) {
        try {
          await this.catalogService.createProduct(catalogId, this.mapProduct(products[i]))
          imported++
        } catch (error) {
          failed++
          const message = error instanceof Error ? error.message : String(error)
          this.logger.warn(`Failed to import "${products[i]?.name}" into ${catalogId}: ${message}`)
        }

        const percentage = Math.round(10 + ((i + 1) / products.length) * 90)
        onProgress?.(percentage)
        await this.prisma.catalogMigration.update({
          where: { id: migrationId },
          data: { importedProducts: imported, failedProducts: failed },
        })
        this.emitProgress(organisationId, migrationId, {
          imported,
          failed,
          total: products.length,
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
        total: products.length,
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
      this.logger.warn(`broadcastQueueState failed: ${error instanceof Error ? error.message : error}`)
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
  private async computePositionEta(jobId: string): Promise<{ position: number; etaMinutes: number }> {
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

  private mapProduct(p: ConnectorProduct) {
    return {
      name: p.name,
      description: p.description ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      additionalImageUrls:
        Array.isArray(p.additionalImageUrls) && p.additionalImageUrls.length > 0
          ? p.additionalImageUrls
          : undefined,
      price: p.price != null && p.price !== '' ? String(p.price) : undefined,
      currency: p.currency ?? undefined,
      availability: p.availability ?? undefined,
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

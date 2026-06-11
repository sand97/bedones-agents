import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class CatalogImageTemplateService {
  constructor(private prisma: PrismaService) {}

  // ─── Image Studio Templates ───

  async findImageTemplates(catalogId: string) {
    return this.prisma.imageTemplate.findMany({
      where: { catalogId },
      orderBy: { updatedAt: 'desc' },
    })
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
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { organisationId: true },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')

    const data = {
      organisationId: catalog.organisationId,
      catalogId,
      name: dto.name,
      format: dto.format,
      accent: dto.accent ?? null,
      definition: dto.definition as Prisma.InputJsonValue,
      sourceKey: dto.sourceKey ?? null,
    }

    // Fork d'un template statique (sourceKey) : un seul override par
    // (catalogue, sourceKey) — on met à jour l'existant le cas échéant.
    if (dto.sourceKey) {
      const existing = await this.prisma.imageTemplate.findFirst({
        where: { catalogId, sourceKey: dto.sourceKey },
        select: { id: true },
      })
      if (existing) {
        return this.prisma.imageTemplate.update({ where: { id: existing.id }, data })
      }
    }
    return this.prisma.imageTemplate.create({ data })
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
    const existing = await this.prisma.imageTemplate.findFirst({
      where: { id: templateId, catalogId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Template introuvable')
    return this.prisma.imageTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.accent !== undefined ? { accent: dto.accent } : {}),
        ...(dto.definition !== undefined
          ? { definition: dto.definition as Prisma.InputJsonValue }
          : {}),
      },
    })
  }

  async deleteImageTemplate(catalogId: string, templateId: string) {
    const existing = await this.prisma.imageTemplate.findFirst({
      where: { id: templateId, catalogId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Template introuvable')
    await this.prisma.imageTemplate.delete({ where: { id: templateId } })
    return { id: templateId }
  }
}

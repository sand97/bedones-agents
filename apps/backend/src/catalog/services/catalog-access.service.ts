import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../auth/encryption.service'
import type { SocialFeature, SocialProvider } from 'generated/prisma/enums'

@Injectable()
export class CatalogAccessService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  // ─── Authorization helpers ───

  async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })
    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }
  }

  /**
   * Verify user is a member of the organisation that owns this catalog.
   * Returns the catalog for convenience.
   */
  async assertCatalogAccess(userId: string, catalogId: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { organisationId: true },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    await this.assertMembership(userId, catalog.organisationId)
    return catalog
  }

  // ─── Resolve access token for a catalog ───

  /**
   * Pick the social account backing a catalog's Graph product calls. A catalog
   * can be linked to both a FACEBOOK_CATALOG account (its Commerce Manager
   * token) and a WHATSAPP account (SMB phone link), so prefer the
   * FACEBOOK_CATALOG one and fall back to the first link otherwise.
   */
  pickCatalogSocialLink<T extends { socialAccount: { provider: SocialProvider } }>(
    links: T[],
  ): T | undefined {
    return links.find((link) => link.socialAccount.provider === 'FACEBOOK_CATALOG') ?? links[0]
  }

  async resolveAccessToken(catalogId: string): Promise<string> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: { socialAccount: { omit: { accessToken: false } } },
        },
      },
    })

    if (!catalog || !catalog.providerId) {
      throw new NotFoundException('Catalogue ou providerId introuvable')
    }

    const socialLink = this.pickCatalogSocialLink(catalog.socialAccounts)
    if (!socialLink) {
      throw new NotFoundException('Aucun compte social lié au catalogue')
    }

    return this.encryptionService.decrypt(socialLink.socialAccount.accessToken)
  }

  async getCatalogProviderId(catalogId: string): Promise<string> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { providerId: true },
    })
    if (!catalog?.providerId) {
      throw new NotFoundException('Catalogue ou providerId introuvable')
    }
    return catalog.providerId
  }

  /** The social account backing a catalog — used to gate/record outbound calls. */
  async resolveCatalogSocialAccount(catalogId: string): Promise<{
    id: string
    provider: SocialProvider
    disabled: boolean
    featureDisabled: SocialFeature[]
  } | null> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              select: { id: true, provider: true, disabled: true, featureDisabled: true },
            },
          },
        },
      },
    })
    return this.pickCatalogSocialLink(catalog?.socialAccounts ?? [])?.socialAccount ?? null
  }
}

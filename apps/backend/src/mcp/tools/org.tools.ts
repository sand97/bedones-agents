import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { PrismaService } from '../../prisma/prisma.service'
import { mcpContext } from '../mcp-context'
import { READ_ONLY, withTitle } from './annotations'
import { emptySchema } from './tool-schemas'

@Injectable()
export class McpOrgTools {
  constructor(private readonly prisma: PrismaService) {}

  @Tool({
    name: 'get_active_organisation',
    description:
      "Renvoie l'organisation Bedones actuellement active pour cette connexion (déterminée lors de l'autorisation) ainsi que le rôle de l'utilisateur.",
    parameters: emptySchema,
    annotations: withTitle('Organisation active', READ_ONLY),
  })
  async getActiveOrganisation(_args: unknown, _ctx: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const org = await this.prisma.organisation.findUnique({
      where: { id: ctx.organisationId },
      select: { id: true, name: true, timezone: true },
    })
    return { ...org, role: ctx.role }
  }

  @Tool({
    name: 'list_organisations',
    description:
      "Liste les organisations Bedones auxquelles l'utilisateur appartient. L'organisation active reste celle choisie à la connexion.",
    parameters: emptySchema,
    annotations: withTitle('Lister les organisations', READ_ONLY),
  })
  async listOrganisations(_args: unknown, _ctx: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const memberships = await this.prisma.organisationMember.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: { organisation: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return memberships.map((m) => ({
      id: m.organisation.id,
      name: m.organisation.name,
      role: m.role,
      active: m.organisation.id === ctx.organisationId,
    }))
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreditMediaType } from '../../generated/prisma/client'

const COST_BY_MEDIA: Record<CreditMediaType, number> = {
  TEXT: 1,
  AUDIO: 1.5,
  IMAGE: 2,
}

interface LogOperationParams {
  organisationId: string
  agentId?: string | null
  conversationId?: string | null
  commentId?: string | null
  mediaType: CreditMediaType
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name)

  constructor(private prisma: PrismaService) {}

  async logOperation(params: LogOperationParams) {
    const cost = COST_BY_MEDIA[params.mediaType]
    try {
      await this.prisma.creditOperation.create({
        data: {
          organisationId: params.organisationId,
          agentId: params.agentId ?? undefined,
          conversationId: params.conversationId ?? undefined,
          commentId: params.commentId ?? undefined,
          mediaType: params.mediaType,
          cost,
        },
      })
    } catch (error: unknown) {
      this.logger.error(
        `Failed to log credit operation: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  static getCostFor(mediaType: CreditMediaType): number {
    return COST_BY_MEDIA[mediaType]
  }
}

import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  CreditUsageDto,
  NetworkBreakdownItemDto,
  StatsResponseDto,
  TimeSeriesPointDto,
} from './dto/stats.dto'

export type StatsBucket = 'day' | 'week' | 'month'

const DEFAULT_MONTHLY_QUOTA = 10_000

interface StatsRangeParams {
  organisationId: string
  from: Date
  to: Date
  bucket: StatsBucket
}

interface BucketRow {
  bucket: Date
  count: bigint | number
}

interface ProviderRow {
  provider: string
  count: bigint | number
}

interface CreditBucketRow {
  bucket: Date
  total: number | string | null
}

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async getStats(params: StatsRangeParams): Promise<StatsResponseDto> {
    const { organisationId, from, to, bucket } = params
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()))
    const previousTo = from

    const [
      currentComments,
      previousComments,
      currentMessages,
      previousMessages,
      currentAi,
      previousAi,
      activity,
      messagesByNetwork,
      commentsByNetwork,
    ] = await Promise.all([
      this.countIncomingComments(organisationId, from, to),
      this.countIncomingComments(organisationId, previousFrom, previousTo),
      this.countIncomingMessages(organisationId, from, to),
      this.countIncomingMessages(organisationId, previousFrom, previousTo),
      this.countAiResponses(organisationId, from, to),
      this.countAiResponses(organisationId, previousFrom, previousTo),
      this.getActivityTimeSeries(organisationId, from, to, bucket),
      this.getMessagesByNetwork(organisationId, from, to),
      this.getCommentsByNetwork(organisationId, from, to),
    ])

    return {
      overview: {
        comments: { value: currentComments, change: pctChange(currentComments, previousComments) },
        messages: { value: currentMessages, change: pctChange(currentMessages, previousMessages) },
        aiResponses: { value: currentAi, change: pctChange(currentAi, previousAi) },
      },
      activity,
      messagesByNetwork,
      commentsByNetwork,
    }
  }

  async getCreditUsage(organisationId: string): Promise<CreditUsageDto> {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const result = await this.prisma.creditOperation.aggregate({
      where: {
        organisationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { cost: true },
    })

    return {
      used: Math.round((result._sum.cost ?? 0) * 100) / 100,
      total: DEFAULT_MONTHLY_QUOTA,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  private async countIncomingComments(organisationId: string, from: Date, to: Date) {
    return this.prisma.comment.count({
      where: {
        isPageReply: false,
        createdTime: { gte: from, lt: to },
        post: { socialAccount: { organisationId } },
      },
    })
  }

  private async countIncomingMessages(organisationId: string, from: Date, to: Date) {
    return this.prisma.directMessage.count({
      where: {
        isFromPage: false,
        createdTime: { gte: from, lt: to },
        conversation: { socialAccount: { organisationId } },
      },
    })
  }

  private async countAiResponses(organisationId: string, from: Date, to: Date) {
    return this.prisma.creditOperation.count({
      where: {
        organisationId,
        agentId: { not: null },
        createdAt: { gte: from, lt: to },
      },
    })
  }

  private async getActivityTimeSeries(
    organisationId: string,
    from: Date,
    to: Date,
    bucket: StatsBucket,
  ): Promise<TimeSeriesPointDto[]> {
    const trunc = bucket // 'day' | 'week' | 'month' — safe enum, used in tagged sql

    const messagesRows = await this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${trunc}, dm."createdTime") AS bucket, COUNT(*)::bigint AS count
      FROM "DirectMessage" dm
      JOIN "Conversation" c ON c.id = dm."conversationId"
      JOIN "SocialAccount" sa ON sa.id = c."socialAccountId"
      WHERE sa."organisationId" = ${organisationId}
        AND dm."isFromPage" = false
        AND dm."createdTime" >= ${from}
        AND dm."createdTime" < ${to}
      GROUP BY bucket
      ORDER BY bucket;
    `

    const commentsRows = await this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${trunc}, cm."createdTime") AS bucket, COUNT(*)::bigint AS count
      FROM "Comment" cm
      JOIN "Post" p ON p.id = cm."postId"
      JOIN "SocialAccount" sa ON sa.id = p."socialAccountId"
      WHERE sa."organisationId" = ${organisationId}
        AND cm."isPageReply" = false
        AND cm."createdTime" >= ${from}
        AND cm."createdTime" < ${to}
      GROUP BY bucket
      ORDER BY bucket;
    `

    const creditsRows = await this.prisma.$queryRaw<CreditBucketRow[]>`
      SELECT date_trunc(${trunc}, "createdAt") AS bucket, SUM(cost)::float AS total
      FROM "CreditOperation"
      WHERE "organisationId" = ${organisationId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY bucket
      ORDER BY bucket;
    `

    const buckets = enumerateBuckets(from, to, bucket)
    const messagesMap = new Map(messagesRows.map((r) => [bucketKey(r.bucket), Number(r.count)]))
    const commentsMap = new Map(commentsRows.map((r) => [bucketKey(r.bucket), Number(r.count)]))
    const creditsMap = new Map(creditsRows.map((r) => [bucketKey(r.bucket), Number(r.total ?? 0)]))

    return buckets.map((b) => {
      const key = bucketKey(b)
      return {
        date: b.toISOString(),
        messages: messagesMap.get(key) ?? 0,
        commentaires: commentsMap.get(key) ?? 0,
        credits: creditsMap.get(key) ?? 0,
      }
    })
  }

  private async getMessagesByNetwork(
    organisationId: string,
    from: Date,
    to: Date,
  ): Promise<NetworkBreakdownItemDto[]> {
    const rows = await this.prisma.$queryRaw<ProviderRow[]>`
      SELECT sa.provider AS provider, COUNT(*)::bigint AS count
      FROM "DirectMessage" dm
      JOIN "Conversation" c ON c.id = dm."conversationId"
      JOIN "SocialAccount" sa ON sa.id = c."socialAccountId"
      WHERE sa."organisationId" = ${organisationId}
        AND dm."isFromPage" = false
        AND dm."createdTime" >= ${from}
        AND dm."createdTime" < ${to}
      GROUP BY sa.provider
      ORDER BY count DESC;
    `
    return rows.map((r) => ({ provider: String(r.provider), count: Number(r.count) }))
  }

  private async getCommentsByNetwork(
    organisationId: string,
    from: Date,
    to: Date,
  ): Promise<NetworkBreakdownItemDto[]> {
    const rows = await this.prisma.$queryRaw<ProviderRow[]>`
      SELECT sa.provider AS provider, COUNT(*)::bigint AS count
      FROM "Comment" cm
      JOIN "Post" p ON p.id = cm."postId"
      JOIN "SocialAccount" sa ON sa.id = p."socialAccountId"
      WHERE sa."organisationId" = ${organisationId}
        AND cm."isPageReply" = false
        AND cm."createdTime" >= ${from}
        AND cm."createdTime" < ${to}
      GROUP BY sa.provider
      ORDER BY count DESC;
    `
    return rows.map((r) => ({ provider: String(r.provider), count: Number(r.count) }))
  }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function bucketKey(d: Date): string {
  return new Date(d).toISOString()
}

function enumerateBuckets(from: Date, to: Date, bucket: StatsBucket): Date[] {
  const buckets: Date[] = []
  const cursor = truncate(from, bucket)
  while (cursor < to) {
    buckets.push(new Date(cursor))
    advance(cursor, bucket)
  }
  return buckets
}

function truncate(d: Date, bucket: StatsBucket): Date {
  const date = new Date(d)
  date.setUTCHours(0, 0, 0, 0)
  if (bucket === 'week') {
    const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
    date.setUTCDate(date.getUTCDate() - (day - 1))
  } else if (bucket === 'month') {
    date.setUTCDate(1)
  }
  return date
}

function advance(d: Date, bucket: StatsBucket) {
  if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1)
  else if (bucket === 'week') d.setUTCDate(d.getUTCDate() + 7)
  else d.setUTCMonth(d.getUTCMonth() + 1)
}

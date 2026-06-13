import { ApiProperty } from '@nestjs/swagger'

export class StatChangeDto {
  @ApiProperty()
  value: number

  @ApiProperty({ description: 'Variation en pourcentage par rapport à la période précédente' })
  change: number
}

export class StatsOverviewDto {
  @ApiProperty({ type: StatChangeDto })
  comments: StatChangeDto

  @ApiProperty({ type: StatChangeDto })
  messages: StatChangeDto

  @ApiProperty({ type: StatChangeDto })
  aiResponses: StatChangeDto
}

export class TimeSeriesPointDto {
  @ApiProperty({ description: 'Date ISO du début du bucket' })
  date: string

  @ApiProperty()
  messages: number

  @ApiProperty()
  commentaires: number

  @ApiProperty()
  credits: number
}

export class NetworkBreakdownItemDto {
  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider: string

  @ApiProperty()
  count: number
}

export class StatsResponseDto {
  @ApiProperty({ type: StatsOverviewDto })
  overview: StatsOverviewDto

  @ApiProperty({ type: [TimeSeriesPointDto] })
  activity: TimeSeriesPointDto[]

  @ApiProperty({ type: [NetworkBreakdownItemDto] })
  messagesByNetwork: NetworkBreakdownItemDto[]

  @ApiProperty({ type: [NetworkBreakdownItemDto] })
  commentsByNetwork: NetworkBreakdownItemDto[]
}

export class CreditUsageDto {
  @ApiProperty()
  used: number

  @ApiProperty({ description: 'Quota mensuel de crédits inclus dans le forfait actif' })
  total: number

  @ApiProperty({
    enum: ['free', 'pro', 'business'],
    description: 'Forfait de facturation actif de l’organisation',
  })
  plan: string

  @ApiProperty({ description: 'Date ISO du début de la période de facturation (mois en cours)' })
  periodStart: string

  @ApiProperty({ description: 'Date ISO de la fin de la période de facturation' })
  periodEnd: string
}

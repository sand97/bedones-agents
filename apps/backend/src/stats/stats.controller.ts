import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { StatsService, type StatsBucket } from './stats.service'
import { CreditUsageDto, StatsResponseDto } from './dto/stats.dto'

const ALLOWED_BUCKETS: StatsBucket[] = ['day', 'week', 'month']

@ApiTags('Stats')
@Controller('stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get('org/:organisationId')
  @ApiOkResponse({ type: StatsResponseDto })
  @ApiQuery({ name: 'from', description: 'Date ISO incluse (gte)' })
  @ApiQuery({ name: 'to', description: 'Date ISO exclue (lt)' })
  @ApiQuery({ name: 'bucket', enum: ALLOWED_BUCKETS })
  async getStats(
    @Param('organisationId') organisationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('bucket') bucket: string,
  ): Promise<StatsResponseDto> {
    const fromDate = parseDate(from, 'from')
    const toDate = parseDate(to, 'to')
    if (toDate <= fromDate) {
      throw new BadRequestException('"to" doit être strictement supérieur à "from"')
    }
    if (!ALLOWED_BUCKETS.includes(bucket as StatsBucket)) {
      throw new BadRequestException(`bucket doit être l'un de ${ALLOWED_BUCKETS.join(', ')}`)
    }
    return this.statsService.getStats({
      organisationId,
      from: fromDate,
      to: toDate,
      bucket: bucket as StatsBucket,
    })
  }

  @Get('org/:organisationId/credits')
  @ApiOkResponse({ type: CreditUsageDto })
  async getCreditUsage(@Param('organisationId') organisationId: string): Promise<CreditUsageDto> {
    return this.statsService.getCreditUsage(organisationId)
  }
}

function parseDate(value: string, name: string): Date {
  if (!value) throw new BadRequestException(`Paramètre "${name}" manquant`)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Paramètre "${name}" invalide`)
  return d
}

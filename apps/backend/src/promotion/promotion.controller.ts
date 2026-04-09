import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { PromotionService } from './promotion.service'
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto'

@ApiTags('Promotion')
@Controller('promotion')
@UseGuards(AuthGuard)
export class PromotionController {
  constructor(private promotionService: PromotionService) {}

  @Get('org/:organisationId')
  async findAll(
    @Param('organisationId') organisationId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.promotionService.findAllByOrg(organisationId, {
      status,
      search,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    })
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.promotionService.findById(id)
  }

  @Post()
  async create(@Body() dto: CreatePromotionDto) {
    return this.promotionService.create(dto)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.promotionService.remove(id)
  }
}

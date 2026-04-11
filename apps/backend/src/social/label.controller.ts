import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { LabelService } from './label.service'

class CreateLabelDto {
  socialAccountId: string
  name: string
  color?: string
}

class UpdateLabelDto {
  name?: string
  color?: string
  order?: number
}

@ApiTags('Labels')
@Controller('labels')
@UseGuards(AuthGuard)
export class LabelController {
  constructor(private labelService: LabelService) {}

  @Get('account/:socialAccountId')
  async findAll(
    @CurrentUser() user: { id: string },
    @Param('socialAccountId') socialAccountId: string,
  ) {
    return this.labelService.findAll(user.id, socialAccountId)
  }

  @Post()
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateLabelDto) {
    return this.labelService.create(user.id, dto)
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelService.update(user.id, id, dto)
  }

  @Delete(':id')
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.labelService.remove(user.id, id)
  }
}

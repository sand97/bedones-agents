import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { TicketService } from './ticket.service'
import { CreateTicketDto, UpdateTicketDto } from './dto/ticket.dto'

@ApiTags('Ticket')
@Controller('ticket')
@UseGuards(AuthGuard)
export class TicketController {
  constructor(private ticketService: TicketService) {}

  // ─── Ticket Statuses ───

  @Get('org/:organisationId/statuses')
  async getStatuses(@Param('organisationId') organisationId: string) {
    return this.ticketService.getStatuses(organisationId)
  }

  @Put('org/:organisationId/statuses')
  async updateStatuses(
    @Param('organisationId') organisationId: string,
    @Body()
    statuses: Array<{
      id?: string
      name: string
      color: string
      order: number
      isDefault: boolean
    }>,
  ) {
    return this.ticketService.updateStatuses(organisationId, statuses)
  }

  @Get('org/:organisationId')
  async findAll(
    @Param('organisationId') organisationId: string,
    @Query('statusId') statusId?: string,
    @Query('agentId') agentId?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ticketService.findAllByOrg(organisationId, {
      statusId,
      agentId,
      priority,
      search,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    })
  }

  @Get('org/:organisationId/stats')
  async getStats(@Param('organisationId') organisationId: string) {
    return this.ticketService.getStats(organisationId)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ticketService.findById(id)
  }

  @Post()
  async create(@Body() dto: CreateTicketDto) {
    return this.ticketService.create(dto)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.ticketService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.ticketService.remove(id)
  }
}

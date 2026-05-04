import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { LoyaltyService } from './loyalty.service'
import {
  CreateLoyaltyBonusDto,
  CreateLoyaltyCampaignDto,
  CreateLoyaltyContactDto,
  CreateLoyaltyTemplateDto,
  UpdateLoyaltyBonusDto,
  UpdateLoyaltyCampaignDto,
  UpdateLoyaltyContactDto,
} from './dto/loyalty.dto'

@ApiTags('Loyalty')
@Controller('loyalty')
@UseGuards(AuthGuard)
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  // ─── Contacts ───

  @Get('contacts/account/:socialAccountId')
  listContacts(
    @Param('socialAccountId') socialAccountId: string,
    @Query('search') search?: string,
  ) {
    return this.loyaltyService.listContacts(socialAccountId, { search })
  }

  @Post('contacts')
  createContact(@Body() dto: CreateLoyaltyContactDto) {
    return this.loyaltyService.createContact(dto)
  }

  @Patch('contacts/:id')
  updateContact(@Param('id') id: string, @Body() dto: UpdateLoyaltyContactDto) {
    return this.loyaltyService.updateContact(id, dto)
  }

  @Delete('contacts/:id')
  removeContact(@Param('id') id: string) {
    return this.loyaltyService.removeContact(id)
  }

  // ─── Bonus ───

  @Get('bonuses/account/:socialAccountId')
  listBonuses(
    @Param('socialAccountId') socialAccountId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.loyaltyService.listBonuses(socialAccountId, { search, status })
  }

  @Get('bonuses/:id')
  getBonus(@Param('id') id: string) {
    return this.loyaltyService.getBonus(id)
  }

  @Post('bonuses')
  createBonus(@Body() dto: CreateLoyaltyBonusDto) {
    return this.loyaltyService.createBonus(dto)
  }

  @Patch('bonuses/:id')
  updateBonus(@Param('id') id: string, @Body() dto: UpdateLoyaltyBonusDto) {
    return this.loyaltyService.updateBonus(id, dto)
  }

  @Delete('bonuses/:id')
  removeBonus(@Param('id') id: string) {
    return this.loyaltyService.removeBonus(id)
  }

  // ─── Templates (live from Meta — never persisted) ───

  @Get('templates/account/:socialAccountId')
  listTemplates(@Param('socialAccountId') socialAccountId: string) {
    return this.loyaltyService.listTemplates(socialAccountId)
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateLoyaltyTemplateDto) {
    return this.loyaltyService.createTemplate(dto)
  }

  @Delete('templates/account/:socialAccountId/by-name/:name')
  removeTemplate(@Param('socialAccountId') socialAccountId: string, @Param('name') name: string) {
    return this.loyaltyService.removeTemplate(socialAccountId, name)
  }

  // ─── Campaigns ───

  @Get('campaigns/account/:socialAccountId')
  listCampaigns(@Param('socialAccountId') socialAccountId: string) {
    return this.loyaltyService.listCampaigns(socialAccountId)
  }

  @Get('campaigns/account/:socialAccountId/preview-count')
  previewCampaignCount(
    @Param('socialAccountId') socialAccountId: string,
    @Query('minSpend') minSpend?: string,
    @Query('minOrders') minOrders?: string,
  ) {
    return this.loyaltyService.previewCampaignCount(socialAccountId, {
      minSpend: minSpend ? Number(minSpend) : undefined,
      minOrders: minOrders ? Number(minOrders) : undefined,
    })
  }

  @Post('campaigns')
  createCampaign(@Body() dto: CreateLoyaltyCampaignDto) {
    return this.loyaltyService.createCampaign(dto)
  }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateLoyaltyCampaignDto) {
    return this.loyaltyService.updateCampaign(id, dto)
  }

  @Delete('campaigns/:id')
  removeCampaign(@Param('id') id: string) {
    return this.loyaltyService.removeCampaign(id)
  }
}

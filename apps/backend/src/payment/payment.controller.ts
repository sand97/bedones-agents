import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { SubscriptionService } from './subscription.service'
import {
  CheckoutSessionResponseDto,
  CreateCreditCheckoutDto,
  CreateSubscriptionCheckoutDto,
  PaymentItemDto,
  PortalSessionResponseDto,
  SubscriptionStatusResponseDto,
} from './dto/payment.dto'

@ApiTags('Payment')
@Controller('payment')
@UseGuards(AuthGuard)
export class PaymentController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Get('org/:organisationId/subscription')
  @ApiOkResponse({ type: SubscriptionStatusResponseDto })
  async getSubscription(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
  ): Promise<SubscriptionStatusResponseDto> {
    return this.subscriptionService.getStatus(user.id, orgId)
  }

  @Get('org/:organisationId/payments')
  @ApiOkResponse({ type: [PaymentItemDto] })
  async listPayments(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
  ): Promise<PaymentItemDto[]> {
    return this.subscriptionService.listPayments(user.id, orgId)
  }

  @Post('org/:organisationId/checkout/subscription')
  @ApiBody({ type: CreateSubscriptionCheckoutDto })
  @ApiOkResponse({ type: CheckoutSessionResponseDto })
  async createSubscriptionCheckout(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
    @Body() body: CreateSubscriptionCheckoutDto,
  ): Promise<CheckoutSessionResponseDto> {
    return this.subscriptionService.createSubscriptionCheckout(user.id, orgId, body)
  }

  @Post('org/:organisationId/checkout/credits')
  @ApiBody({ type: CreateCreditCheckoutDto })
  @ApiOkResponse({ type: CheckoutSessionResponseDto })
  async createCreditCheckout(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
    @Body() body: CreateCreditCheckoutDto,
  ): Promise<CheckoutSessionResponseDto> {
    return this.subscriptionService.createCreditCheckout(user.id, orgId, body)
  }

  @Post('org/:organisationId/portal')
  @ApiOkResponse({ type: PortalSessionResponseDto })
  async createPortalSession(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
  ): Promise<PortalSessionResponseDto> {
    return this.subscriptionService.createPortalSession(user.id, orgId)
  }
}

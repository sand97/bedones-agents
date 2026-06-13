import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PaymentController } from './payment.controller'
import { StripeWebhookController } from './stripe-webhook.controller'
import { StripeService } from './stripe.service'
import { SubscriptionService } from './subscription.service'

@Module({
  imports: [AuthModule],
  controllers: [PaymentController, StripeWebhookController],
  providers: [StripeService, SubscriptionService],
  exports: [SubscriptionService],
})
export class PaymentModule {}

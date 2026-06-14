import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from '../auth/auth.module'
import { QueueModule, PAYMENT_QUEUE } from '../queue/queue.module'
import { PaymentController } from './payment.controller'
import { StripeWebhookController } from './stripe-webhook.controller'
import { StripeService } from './stripe.service'
import { NotchpayService } from './notchpay.service'
import { SubscriptionService } from './subscription.service'
import { SubscriptionNotificationService } from './subscription-notification.service'
import { PaymentProcessor } from './payment.processor'
import { InvoicePdfmakeService } from './invoice/invoice-pdfmake.service'

@Module({
  imports: [AuthModule, QueueModule, BullModule.registerQueue({ name: PAYMENT_QUEUE })],
  controllers: [PaymentController, StripeWebhookController],
  providers: [
    StripeService,
    NotchpayService,
    SubscriptionService,
    SubscriptionNotificationService,
    PaymentProcessor,
    InvoicePdfmakeService,
  ],
  exports: [SubscriptionService],
})
export class PaymentModule {}

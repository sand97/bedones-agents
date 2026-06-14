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
import { InvoiceDemoController } from './invoice/invoice-demo.controller'
import { InvoicePdfmakeService } from './invoice/invoice-pdfmake.service'
import { InvoicePuppeteerService } from './invoice/invoice-puppeteer.service'
import { InvoiceGotenbergService } from './invoice/invoice-gotenberg.service'

@Module({
  imports: [AuthModule, QueueModule, BullModule.registerQueue({ name: PAYMENT_QUEUE })],
  controllers: [PaymentController, StripeWebhookController, InvoiceDemoController],
  providers: [
    StripeService,
    NotchpayService,
    SubscriptionService,
    SubscriptionNotificationService,
    PaymentProcessor,
    InvoicePdfmakeService,
    InvoicePuppeteerService,
    InvoiceGotenbergService,
  ],
  exports: [SubscriptionService],
})
export class PaymentModule {}

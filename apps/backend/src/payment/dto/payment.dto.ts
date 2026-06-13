import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsPositive, Min } from 'class-validator'
import { ALLOWED_BILLING_MONTHS, CREDIT_PURCHASE_STEP } from '../plans.config'

export class CreateSubscriptionCheckoutDto {
  @ApiProperty({ enum: ['pro', 'business'], description: 'Forfait payant à souscrire' })
  @IsIn(['pro', 'business'])
  plan: 'pro' | 'business'

  @ApiProperty({
    enum: ALLOWED_BILLING_MONTHS,
    description: 'Cadence de facturation en mois (1, 6 ou 12). 6 et 12 appliquent une remise.',
  })
  @IsIn(ALLOWED_BILLING_MONTHS as unknown as number[])
  billingMonths: number
}

export class CreateCreditCheckoutDto {
  @ApiProperty({
    description: `Nombre de crédits à acheter. Doit être un multiple de ${CREDIT_PURCHASE_STEP}.`,
    example: 1000,
  })
  @IsInt()
  @IsPositive()
  @Min(CREDIT_PURCHASE_STEP)
  credits: number
}

export class CheckoutSessionResponseDto {
  @ApiProperty({ description: 'URL de la session Stripe Checkout vers laquelle rediriger' })
  url: string
}

export class SubscriptionStatusResponseDto {
  @ApiProperty({ enum: ['free', 'pro', 'business'] })
  plan: 'free' | 'pro' | 'business'

  @ApiProperty({
    enum: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'],
    nullable: true,
    description: "Statut de l'abonnement, ou null si aucun abonnement (forfait gratuit)",
  })
  status: string | null

  @ApiProperty({ nullable: true, description: 'Cadence de facturation en mois' })
  billingMonths: number | null

  @ApiProperty({ description: 'Crédits de base inclus par le forfait chaque mois' })
  monthlyCredits: number

  @ApiProperty({ description: 'Solde de crédits supplémentaires achetés (non encore consommés)' })
  purchasedCredits: number

  @ApiProperty({ description: 'Quota total disponible = crédits du forfait + crédits achetés' })
  totalCredits: number

  @ApiProperty({ nullable: true, description: 'Fin de la période en cours (ISO), si abonnement' })
  currentPeriodEnd: string | null

  @ApiProperty({ description: 'Annulation programmée en fin de période' })
  cancelAtPeriodEnd: boolean
}

export class PaymentItemDto {
  @ApiProperty()
  id: string

  @ApiProperty({ enum: ['SUBSCRIPTION', 'CREDIT_PURCHASE'] })
  kind: string

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] })
  status: string

  @ApiProperty()
  amount: number

  @ApiProperty()
  currency: string

  @ApiProperty({ nullable: true })
  creditsPurchased: number | null

  @ApiProperty({ nullable: true })
  description: string | null

  @ApiProperty()
  createdAt: string
}

export class PortalSessionResponseDto {
  @ApiProperty({ description: 'URL du portail de facturation Stripe' })
  url: string
}

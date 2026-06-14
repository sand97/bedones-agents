import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsPositive, Min } from 'class-validator'
import { ALLOWED_BILLING_MONTHS, CREDIT_PURCHASE_STEP } from '../plans.config'

// Méthode de paiement choisie côté frontend (CheckoutModal). CARD passe par
// Stripe (carte, abonnement récurrent) ; MOBILE_MONEY passe par NotchPay
// (paiement ponctuel, accès à durée fixe sans renouvellement automatique).
export const PAYMENT_METHODS = ['CARD', 'MOBILE_MONEY'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

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

  @ApiProperty({
    enum: PAYMENT_METHODS,
    required: false,
    default: 'CARD',
    description: 'Méthode de paiement. CARD = Stripe (récurrent), MOBILE_MONEY = NotchPay.',
  })
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method?: PaymentMethod
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

  @ApiProperty({
    enum: PAYMENT_METHODS,
    required: false,
    default: 'CARD',
    description: 'Méthode de paiement. CARD = Stripe, MOBILE_MONEY = NotchPay.',
  })
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method?: PaymentMethod
}

export class CheckoutSessionResponseDto {
  @ApiProperty({
    description: 'URL de paiement (Stripe Checkout ou NotchPay) vers laquelle rediriger',
  })
  url: string
}

export class PaymentMethodDto {
  @ApiProperty({
    enum: ['CARD', 'MOBILE_MONEY'],
    nullable: true,
    description: 'Type de moyen de paiement, ou null si aucun',
  })
  type: 'CARD' | 'MOBILE_MONEY' | null

  @ApiProperty({ nullable: true, description: 'Marque de la carte (Stripe)' })
  brand: string | null

  @ApiProperty({ nullable: true, description: '4 derniers chiffres de la carte (Stripe)' })
  last4: string | null

  @ApiProperty({ nullable: true, description: 'Numéro mobile money utilisé (NotchPay)' })
  phone: string | null
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

  @ApiProperty({
    enum: ['STRIPE', 'NOTCHPAY'],
    nullable: true,
    description: 'Prestataire de paiement',
  })
  provider: string | null

  @ApiProperty({ type: PaymentMethodDto, description: 'Résumé du moyen de paiement' })
  paymentMethod: PaymentMethodDto

  @ApiProperty({
    description:
      "True si l'org a au moins un paiement enregistré → la page affiche le récap plutôt que le tutoriel/pricing",
  })
  hasPayments: boolean
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

  @ApiProperty({ enum: ['STRIPE', 'NOTCHPAY'] })
  provider: string

  @ApiProperty({ nullable: true, description: 'Marque de carte (snapshot)' })
  cardBrand: string | null

  @ApiProperty({ nullable: true, description: '4 derniers chiffres de la carte (snapshot)' })
  cardLast4: string | null

  @ApiProperty({ nullable: true, description: 'Numéro mobile money (snapshot)' })
  mobileNumber: string | null

  @ApiProperty()
  createdAt: string
}

export class PortalSessionResponseDto {
  @ApiProperty({ description: 'URL du portail de facturation Stripe' })
  url: string
}

export class ChurnSurveyResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty({ nullable: true })
  phone: string | null

  @ApiProperty({
    description:
      'Réponses du WhatsApp Flow (response_json parsé : flow_token + champs du formulaire)',
    type: 'object',
    additionalProperties: true,
  })
  response: Record<string, unknown>

  @ApiProperty()
  createdAt: string
}

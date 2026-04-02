import AIImageSearchIcon from '@app/assets/pricing/ai-image-search.svg?react'
import AsyncIcon from '@app/assets/pricing/async.svg?react'
import AudioWaveIcon from '@app/assets/pricing/audio-wave.svg?react'
import AudioIllustration from '@app/assets/pricing/AudioIllustration.svg?react'
import BarChartIcon from '@app/assets/pricing/bar-chart.svg?react'
import BarcodeSearchIcon from '@app/assets/pricing/barcode-search.svg?react'
import CatalogLearnIcon from '@app/assets/pricing/catalog-learn.svg?react'
import ContactAddIcon from '@app/assets/pricing/contact-add.svg?react'
import ImageIllustration from '@app/assets/pricing/ImageIllustration.svg?react'
import SimilarityIcon from '@app/assets/pricing/similarity.svg?react'
import StoryScheduleIcon from '@app/assets/pricing/story-schedule.svg?react'
import TextContextIcon from '@app/assets/pricing/text-context.svg?react'
import TextIllustration from '@app/assets/pricing/TextIllustration.svg?react'
import type { ReactNode } from 'react'

export type BillingPlanKey = 'free' | 'pro' | 'business'

export type BillingDuration = 1 | 6 | 12

export type PlanFeature = {
  description: string
  icon: ReactNode
  label: string
}

export type PlanFeatureGroup = {
  items: PlanFeature[]
  title: string
}

export type PlanConfig = {
  accentLabel?: string
  creditAmount: string
  creditSuffix: string
  ctaLabel?: string
  features: PlanFeatureGroup[]
  includedLabel?: string
  monthlyCredits?: number
  monthlyPrice: number
  overagePrice?: string
  overageSuffix?: string
}

export type CreditFact = {
  description: string
  illustration: ReactNode
  title: string
}

export const PLAN_ORDER: BillingPlanKey[] = ['free', 'pro', 'business']

export const BILLING_OPTIONS: Array<{ label: string; value: BillingDuration }> = [
  { label: 'Un mois', value: 1 },
  { label: '6 mois', value: 6 },
  { label: 'Un an', value: 12 },
]

export const DURATION_DISCOUNT: Record<BillingDuration, number> = {
  1: 0,
  6: 0.2,
  12: 0.25,
}

export const PAYMENT_METHODS = [
  { alt: 'Visa', src: '/payments/visa.jpeg' },
  { alt: 'Mastercard', src: '/payments/mastercard.jpg' },
  { alt: 'Orange Money', src: '/payments/orange-money.jpeg' },
  { alt: 'MTN Mobile Money', src: '/payments/mtn-momo.jpeg' },
]

export const PLAN_CONTENT: Record<BillingPlanKey, PlanConfig> = {
  free: {
    creditAmount: '200',
    creditSuffix: 'credits offerts',
    features: [
      {
        items: [
          {
            description: "Discuter avec l'agent pour lui dire comment repondre a vos clients.",
            icon: <TextContextIcon className="h-6 w-6" />,
            label: 'Contextes personnalises',
          },
          {
            description: "L'agent analyse et memorise les images et descriptions de vos produits.",
            icon: <CatalogLearnIcon className="h-6 w-6" />,
            label: 'Apprentissage du catalogue',
          },
        ],
        title: 'Comprehension de votre entreprise',
      },
      {
        items: [
          {
            description: "L'agent comprend les notes vocales comme si c'etait du texte.",
            icon: <AudioWaveIcon className="h-6 w-6" />,
            label: 'Comprehension des audio',
          },
        ],
        title: 'Audio',
      },
      {
        items: [
          {
            description:
              "Quand une image contient le code d'un produit, celui-ci est alors identifie.",
            icon: <BarcodeSearchIcon className="h-6 w-6" />,
            label: 'Recherche par retailer ID',
          },
          {
            description:
              'Quand une image ressemble a une des images de vos produits, celui-ci est alors identifie.',
            icon: <SimilarityIcon className="h-6 w-6" />,
            label: 'Recherche par similarite',
          },
        ],
        title: 'Image',
      },
    ],
    monthlyPrice: 0,
  },
  pro: {
    accentLabel: 'Populaire',
    creditAmount: '1 000',
    creditSuffix: 'credits par mois,',
    ctaLabel: 'Passer a la version Pro',
    features: [
      {
        items: [
          {
            description:
              "L'image est analysee dans le contexte de votre entreprise pour savoir si son contenu cadre fortement avec un de vos produits.",
            icon: <AIImageSearchIcon className="h-6 w-6" />,
            label: 'Recherche par comprehension',
          },
        ],
        title: 'Image',
      },
      {
        items: [
          {
            description: "Programmer l'envoi de vos stories en avances peut-importe la periode.",
            icon: <StoryScheduleIcon className="h-6 w-6" />,
            label: 'Planification de stories',
          },
        ],
        title: 'Stories',
      },
      {
        items: [
          {
            description:
              "L'agent est capable d'agir meme quand aucun message n'est recu, pour ecrire a un client pour un rappel par ex.",
            icon: <AsyncIcon className="h-6 w-6" />,
            label: 'Taches asynchrones',
          },
        ],
        title: 'Taches asynchrones',
      },
    ],
    includedLabel: 'Tout dans Free, plus',
    monthlyCredits: 1000,
    monthlyPrice: 10,
    overagePrice: '$0.01',
    overageSuffix: 'par credit supplementaire',
  },
  business: {
    creditAmount: '3 000',
    creditSuffix: 'credits par mois,',
    ctaLabel: 'Passer a la version Business',
    features: [
      {
        items: [
          {
            description:
              'Une comparaison entre des vues vos stories pour savoir ce qui fonctionne le mieux.',
            icon: <BarChartIcon className="h-6 w-6" />,
            label: 'Statistiques des statuts',
          },
        ],
        title: 'Stories',
      },
      {
        items: [
          {
            description:
              "Creations automatique de contact pour les nouvelle conversations pour qu'il puisse voir vos statuts.",
            icon: <ContactAddIcon className="h-6 w-6" />,
            label: 'Sauvegarde automatique des contacts',
          },
        ],
        title: 'Contacts',
      },
    ],
    includedLabel: 'Tout dans Pro, plus',
    monthlyCredits: 3000,
    monthlyPrice: 25,
    overagePrice: '$0.008',
    overageSuffix: 'par credit supplementaire',
  },
}

export const CREDIT_FACTS: CreditFact[] = [
  {
    description: "Chaque message texte recu ou envoye par l'agent consomme un credit.",
    illustration: <TextIllustration className="h-[132px] w-[132px] text-text-secondary" />,
    title: 'Un credit par texte',
  },
  {
    description:
      "Chaque analyse d'image consomme deux credits, quel que soit le mode de recherche utilise.",
    illustration: <ImageIllustration className="h-[130px] w-[130px] text-text-secondary" />,
    title: 'Deux credits par image',
  },
  {
    description: "La transcription et l'analyse d'un message vocal consomme un credit et demi.",
    illustration: <AudioIllustration className="h-[128px] w-[128px] text-text-secondary" />,
    title: '1.5 credit par audio',
  },
]

export function formatDisplayPrice(amount: number, maximumFractionDigits = 2) {
  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })}`
}

export function formatCreditsAmount(amount: number) {
  return amount.toLocaleString('fr-FR')
}

export function getPlanCreditsSummary(config: PlanConfig, duration: BillingDuration) {
  if (!config.monthlyCredits) {
    return {
      amount: config.creditAmount,
      suffix: config.creditSuffix,
    }
  }

  const totalCredits = config.monthlyCredits * duration

  return {
    amount: formatCreditsAmount(totalCredits),
    suffix: duration === 1 ? 'credits inclus,' : `credits inclus pour ${duration} mois,`,
  }
}

export function getPlanLabel(plan: BillingPlanKey) {
  if (plan === 'free') {
    return 'Free'
  }

  if (plan === 'pro') {
    return 'Pro'
  }

  return 'Business'
}

export function getDurationCtaLabel(duration: BillingDuration) {
  return duration === 1 ? 'un' : `${duration}`
}

export function getTotalPrice(monthlyPrice: number, duration: BillingDuration) {
  const discountMultiplier = 1 - DURATION_DISCOUNT[duration]
  return Math.round(monthlyPrice * duration * discountMultiplier * 100) / 100
}

export function getDisplayedMonthlyPrice(monthlyPrice: number, duration: BillingDuration) {
  return Math.round((getTotalPrice(monthlyPrice, duration) / duration) * 10) / 10
}

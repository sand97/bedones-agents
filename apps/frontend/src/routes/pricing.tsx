import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Segmented } from 'antd'
import { useState } from 'react'

import { MarketingNav } from '@app/components/marketing/marketing-nav'
import { MarketingFooter } from '@app/components/marketing/marketing-footer'
import {
  BILLING_OPTIONS,
  CREDIT_FACTS,
  DURATION_DISCOUNT,
  PLAN_CONTENT,
  PLAN_ORDER,
  type BillingDuration,
} from '@app/components/pricing/constants'
import { CreditFactCard } from '@app/components/pricing/CreditFactCard'
import { PaymentMethodsSection } from '@app/components/pricing/PaymentMethodsSection'
import { PlanCard } from '@app/components/pricing/PlanCard'

const SITE_URL = 'https://bedones.com'
const TITLE = 'Tarifs Bedones — Plans et crédits pour automatiser vos ventes'
const DESCRIPTION =
  'Commencez gratuitement. Plans flexibles à partir de 0 €/mois pour automatiser vos conversations WhatsApp, Instagram, TikTok et Facebook. Paiement par carte ou Mobile Money.'

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Bedones Moderator',
  description: DESCRIPTION,
  url: `${SITE_URL}/pricing`,
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
    { '@type': 'Offer', name: 'Starter', priceCurrency: 'EUR' },
    { '@type': 'Offer', name: 'Pro', priceCurrency: 'EUR' },
    { '@type': 'Offer', name: 'Business', priceCurrency: 'EUR' },
  ],
}

export const Route = createFileRoute('/pricing')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      {
        name: 'keywords',
        content:
          'tarifs Bedones, prix IA WhatsApp, plan gratuit chatbot, Mobile Money paiement, prix automatisation',
      },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE_URL}/pricing` },
      { property: 'og:image', content: `${SITE_URL}/og-pricing.png` },
      { property: 'og:locale', content: 'fr_FR' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'robots', content: 'index, follow' },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/pricing` }],
  }),
  component: PricingPage,
})

function DiscountContent({ duration }: { duration: BillingDuration }) {
  if (duration === 1) {
    return (
      <p className="m-0 flex h-[34px] items-center justify-center text-sm text-text-soft">
        Sans réduction
      </p>
    )
  }
  const pct = Math.round(DURATION_DISCOUNT[duration] * 100)
  return (
    <div className="flex items-center justify-center gap-2">
      <span className="text-sm text-text-secondary">Profiter de</span>
      <span className="inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-full bg-brand-whatsapp px-2 text-sm font-bold text-black">
        {pct}%
      </span>
      <span className="text-sm text-text-secondary">de réduction pour {duration} mois</span>
    </div>
  )
}

function PricingPage() {
  const [duration, setDuration] = useState<BillingDuration>(6)
  const navigate = useNavigate()

  return (
    <div className="mk">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <MarketingNav current="pricing" />

      <section className="mk-pricing-section">
        <div className="mk-container">
          <div className="mk-pricing-head">
            <span className="mk-eyebrow">Tarifs</span>
            <h1>Un plan pour chaque taille de business</h1>
            <p>
              Commencez gratuitement. Passez à un plan supérieur quand vous êtes prêt. Vous payez à
              la durée — pas d&apos;engagement caché.
            </p>
          </div>

          <div className="sticky top-[64px] z-10 -mx-4 mb-8 flex flex-col items-center gap-3 bg-bg-page px-4 py-4 text-center md:relative md:top-0">
            <Segmented<BillingDuration>
              className="pricing-billing-toggle"
              value={duration}
              options={BILLING_OPTIONS}
              onChange={(value) => setDuration(value)}
            />
            <DiscountContent duration={duration} />
          </div>

          <div className="grid min-w-0 gap-4 md:flex md:items-stretch md:gap-0 md:-space-x-px">
            {PLAN_ORDER.map((plan, index) => (
              <PlanCard
                key={plan}
                planKey={plan}
                config={PLAN_CONTENT[plan]}
                isCurrent={false}
                duration={duration}
                onUpgrade={() => navigate({ to: '/auth/login' })}
                isFirst={index === 0}
                isLast={index === PLAN_ORDER.length - 1}
              />
            ))}
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {CREDIT_FACTS.map((fact) => (
              <CreditFactCard key={fact.title} fact={fact} />
            ))}
          </div>

          <div className="mt-12">
            <PaymentMethodsSection />
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

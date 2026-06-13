import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { Button, Segmented } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useState } from 'react'

import { $api } from '@app/lib/api/$api'
import {
  BILLING_OPTIONS,
  CREDIT_FACTS,
  CREDIT_PURCHASE_STEP,
  DURATION_DISCOUNT,
  getPlanLabel,
  PLAN_CONTENT,
  PLAN_ORDER,
  type BillingDuration,
  type BillingPlanKey,
} from '@app/components/pricing/constants'
import { CreditFactCard } from '@app/components/pricing/CreditFactCard'
import { PaymentMethodsSection } from '@app/components/pricing/PaymentMethodsSection'
import { PlanCard } from '@app/components/pricing/PlanCard'
import { CheckoutModal } from '@app/components/pricing/CheckoutModal'
import { BuyCreditsModal } from '@app/components/pricing/BuyCreditsModal'
import {
  PaymentResultModal,
  type PaymentResultState,
} from '@app/components/pricing/PaymentResultModal'

export const Route = createFileRoute('/app/$orgSlug/plan')({
  component: PlanPage,
})

type BillingPaymentMethod = 'CARD' | 'MOBILE_MONEY'

function DiscountContent({ duration }: { duration: BillingDuration }) {
  if (duration === 1) {
    return (
      <p className="m-0 flex h-[34px] items-center justify-center text-sm text-text-soft">
        Sans reduction
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
      <span className="text-sm text-text-secondary">de reduction pour {duration} mois</span>
    </div>
  )
}

function PlanPage() {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const [duration, setDuration] = useState<BillingDuration>(6)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [selectedPlanKey, setSelectedPlanKey] = useState<BillingPlanKey | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>('CARD')
  const [paymentResult, setPaymentResult] = useState<PaymentResultState | null>(null)
  const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false)
  const [creditQuantity, setCreditQuantity] = useState(CREDIT_PURCHASE_STEP)

  // Le forfait actif est dérivé de l'usage des crédits (source de vérité backend)
  // plutôt que codé en dur, afin que la page reflète le vrai plan (cf. issue #102).
  const creditsQuery = $api.useQuery('get', '/stats/org/{organisationId}/credits', {
    params: { path: { organisationId: orgSlug } },
  })
  const currentPlan = (creditsQuery.data?.plan ?? 'free') as BillingPlanKey
  const isPaidPlan = currentPlan !== 'free'
  const mobileMoneyEnabled = true

  function openCheckoutModal(planKey: BillingPlanKey) {
    setSelectedPlanKey(planKey)
    setPaymentMethod('CARD')
    setIsCheckoutModalOpen(true)
  }

  function closeCheckoutModal() {
    setIsCheckoutModalOpen(false)
    setSelectedPlanKey(null)
    setPaymentMethod('CARD')
  }

  function openBuyCreditsModal() {
    setCreditQuantity(CREDIT_PURCHASE_STEP)
    setPaymentMethod('CARD')
    setIsBuyCreditsModalOpen(true)
  }

  function closeBuyCreditsModal() {
    setIsBuyCreditsModalOpen(false)
    setPaymentMethod('CARD')
  }

  function handlePaymentMethodSelection(nextPaymentMethod: BillingPaymentMethod) {
    if (
      nextPaymentMethod === 'MOBILE_MONEY' &&
      (!mobileMoneyEnabled || paymentMethod === 'MOBILE_MONEY')
    )
      return
    if (nextPaymentMethod === 'CARD' && paymentMethod === 'CARD') return
    setPaymentMethod(nextPaymentMethod)
  }

  function handleCheckout() {
    if (!selectedPlanKey) return
    closeCheckoutModal()
    setPaymentResult({
      status: 'pending',
      provider: paymentMethod === 'CARD' ? 'stripe' : 'notch_pay',
    })
  }

  function handleBuyCreditsCheckout() {
    closeBuyCreditsModal()
    setPaymentResult({
      status: 'pending',
      provider: paymentMethod === 'CARD' ? 'stripe' : 'notch_pay',
    })
  }

  return (
    <>
      <DashboardHeader title="Souscriptions" />

      <div className="w-full space-y-8 px-4 py-5 sm:px-6 sm:py-6">
        <div className="sticky top-10 z-10 -mx-4 mb-8 flex flex-col items-center gap-3 bg-bg-surface px-4 py-4 text-center md:relative md:top-0">
          <Segmented<BillingDuration>
            className="pricing-billing-toggle"
            value={duration}
            options={BILLING_OPTIONS}
            onChange={(value) => setDuration(value)}
          />
          <DiscountContent duration={duration} />
        </div>

        {isPaidPlan ? (
          <div className="flex flex-col gap-4 rounded-panel border border-border-field-muted bg-bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="m-0 text-base font-semibold text-text-primary">
                Besoin de plus de crédits&nbsp;?
              </p>
              <p className="m-0 mt-1 text-sm text-text-secondary">
                Vous êtes sur le forfait {getPlanLabel(currentPlan)}. Achetez des crédits
                supplémentaires par palier de {CREDIT_PURCHASE_STEP.toLocaleString('fr-FR')} au
                tarif {PLAN_CONTENT[currentPlan].overagePrice}{' '}
                {PLAN_CONTENT[currentPlan].overageSuffix}.
              </p>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              iconPosition="end"
              onClick={openBuyCreditsModal}
            >
              Acheter des crédits
            </Button>
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 md:flex md:items-stretch md:gap-0 md:-space-x-px">
          {PLAN_ORDER.map((plan, index) => (
            <PlanCard
              key={plan}
              planKey={plan}
              config={PLAN_CONTENT[plan]}
              isCurrent={currentPlan === plan}
              duration={duration}
              onUpgrade={(planKey) => openCheckoutModal(planKey)}
              isFirst={index === 0}
              isLast={index === PLAN_ORDER.length - 1}
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {CREDIT_FACTS.map((fact) => (
            <CreditFactCard key={fact.title} fact={fact} />
          ))}
        </div>

        <PaymentMethodsSection />
      </div>

      <PaymentResultModal paymentResult={paymentResult} onClose={() => setPaymentResult(null)} />

      <CheckoutModal
        open={isCheckoutModalOpen}
        onClose={closeCheckoutModal}
        selectedPlanKey={selectedPlanKey}
        duration={duration}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={handlePaymentMethodSelection}
        mobileMoneyEnabled={mobileMoneyEnabled}
        onCheckout={handleCheckout}
      />

      {isPaidPlan ? (
        <BuyCreditsModal
          open={isBuyCreditsModalOpen}
          onClose={closeBuyCreditsModal}
          planKey={currentPlan}
          quantity={creditQuantity}
          onQuantityChange={setCreditQuantity}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={handlePaymentMethodSelection}
          mobileMoneyEnabled={mobileMoneyEnabled}
          onCheckout={handleBuyCreditsCheckout}
        />
      ) : null}
    </>
  )
}

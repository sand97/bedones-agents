import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { createFileRoute } from '@tanstack/react-router'
import { Segmented } from 'antd'
import { useState } from 'react'

import {
  BILLING_OPTIONS,
  CREDIT_FACTS,
  DURATION_DISCOUNT,
  PLAN_CONTENT,
  PLAN_ORDER,
  type BillingDuration,
  type BillingPlanKey,
} from '@app/components/pricing/constants'
import { CreditFactCard } from '@app/components/pricing/CreditFactCard'
import { PaymentMethodsSection } from '@app/components/pricing/PaymentMethodsSection'
import { PlanCard } from '@app/components/pricing/PlanCard'
import { CheckoutModal } from '@app/components/pricing/CheckoutModal'
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
  const [duration, setDuration] = useState<BillingDuration>(6)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [selectedPlanKey, setSelectedPlanKey] = useState<BillingPlanKey | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>('CARD')
  const [paymentResult, setPaymentResult] = useState<PaymentResultState | null>(null)

  const currentPlan: BillingPlanKey = 'free'
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
    console.log('Checkout:', { duration, paymentMethod, planKey: selectedPlanKey })
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
    </>
  )
}

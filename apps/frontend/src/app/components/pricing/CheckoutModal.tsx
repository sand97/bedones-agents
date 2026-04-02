import { ArrowRightOutlined, CreditCardOutlined, MobileOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { PaymentChoiceCard } from './PaymentChoiceCard'
import {
  formatCreditsAmount,
  formatDisplayPrice,
  getDisplayedMonthlyPrice,
  getPlanLabel,
  getTotalPrice,
  PLAN_CONTENT,
  type BillingDuration,
  type BillingPlanKey,
} from './constants'

type BillingPaymentMethod = 'CARD' | 'MOBILE_MONEY'

interface CheckoutModalProps {
  open: boolean
  onClose: () => void
  selectedPlanKey: BillingPlanKey | null
  duration: BillingDuration
  paymentMethod: BillingPaymentMethod
  onPaymentMethodChange: (method: BillingPaymentMethod) => void
  mobileMoneyEnabled: boolean
  onCheckout: () => void
}

export function CheckoutModal({
  open,
  onClose,
  selectedPlanKey,
  duration,
  paymentMethod,
  onPaymentMethodChange,
  mobileMoneyEnabled,
  onCheckout,
}: CheckoutModalProps) {
  const selectedPlan = selectedPlanKey ? PLAN_CONTENT[selectedPlanKey] : null
  const selectedPlanLabel = selectedPlanKey ? getPlanLabel(selectedPlanKey) : ''
  const selectedPlanTotal = selectedPlan
    ? formatDisplayPrice(getTotalPrice(selectedPlan.monthlyPrice, duration))
    : null
  const selectedPlanMonthly = selectedPlan
    ? formatDisplayPrice(getDisplayedMonthlyPrice(selectedPlan.monthlyPrice, duration), 1)
    : null
  const selectedPlanCredits = selectedPlan?.monthlyCredits
    ? formatCreditsAmount(selectedPlan.monthlyCredits * duration)
    : null

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={560}
      closeIcon={null}
      rootClassName="app-double-modal"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Annuler
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={onCheckout}
          icon={<ArrowRightOutlined />}
          iconPosition="end"
        >
          {paymentMethod === 'CARD' ? 'Payer par carte' : 'Payer par Mobile Money'}
        </Button>,
      ]}
      title={
        <h2 className="m-0 text-[length:var(--font-size-title-sm)] font-semibold text-text-primary">
          Choisir un moyen de paiement
        </h2>
      }
    >
      <div className="space-y-5">
        {selectedPlan ? (
          <div className="flex h-40 flex-col justify-between rounded-2xl bg-surface-accent px-5 pb-5 pt-5">
            <p className="m-0 text-base font-bold leading-4 tracking-[0.02em] text-text-primary">
              {selectedPlanLabel.toUpperCase()}
            </p>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-4xl font-semibold leading-none text-text-primary">
                  {selectedPlanMonthly}
                </span>
                <span className="ml-2 text-lg font-normal text-text-secondary">par mois</span>
                {selectedPlanCredits ? (
                  <p className="mt-3 mb-0 text-sm font-medium leading-6 text-text-secondary">
                    {selectedPlanCredits} credits inclus sur la periode
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-bg-surface px-4 py-2 text-sm font-semibold text-text-primary shadow-card">
                Total {selectedPlanTotal}
              </span>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <PaymentChoiceCard
            active={paymentMethod === 'CARD'}
            title="Carte"
            icon={<CreditCardOutlined />}
            description="Visa / Mastercard"
            onClick={() => onPaymentMethodChange('CARD')}
          />

          <PaymentChoiceCard
            active={paymentMethod === 'MOBILE_MONEY'}
            disabled={!mobileMoneyEnabled}
            title="Mobile Money"
            icon={<MobileOutlined />}
            description={
              mobileMoneyEnabled
                ? 'Orange Money / MTN Mobile Money'
                : 'Disponible uniquement pour les numeros du Cameroun.'
            }
            onClick={() => onPaymentMethodChange('MOBILE_MONEY')}
          />
        </div>
      </div>
    </Modal>
  )
}

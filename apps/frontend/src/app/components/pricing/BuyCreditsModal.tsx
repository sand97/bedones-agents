import {
  ArrowRightOutlined,
  CreditCardOutlined,
  MinusOutlined,
  MobileOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, InputNumber, Modal } from 'antd'
import { PaymentChoiceCard } from './PaymentChoiceCard'
import {
  CREDIT_PURCHASE_STEP,
  formatCreditsAmount,
  formatDisplayPrice,
  getPlanLabel,
  PLAN_CONTENT,
  type BillingPlanKey,
} from './constants'

type BillingPaymentMethod = 'CARD' | 'MOBILE_MONEY'

interface BuyCreditsModalProps {
  open: boolean
  onClose: () => void
  planKey: BillingPlanKey
  quantity: number
  onQuantityChange: (quantity: number) => void
  paymentMethod: BillingPaymentMethod
  onPaymentMethodChange: (method: BillingPaymentMethod) => void
  mobileMoneyEnabled: boolean
  onCheckout: () => void
}

function clampToStep(value: number) {
  const steps = Math.max(1, Math.round(value / CREDIT_PURCHASE_STEP))
  return steps * CREDIT_PURCHASE_STEP
}

export function BuyCreditsModal({
  open,
  onClose,
  planKey,
  quantity,
  onQuantityChange,
  paymentMethod,
  onPaymentMethodChange,
  mobileMoneyEnabled,
  onCheckout,
}: BuyCreditsModalProps) {
  const plan = PLAN_CONTENT[planKey]
  const planLabel = getPlanLabel(planKey)
  const overageRate = plan.overageRate ?? 0
  const totalPrice = formatDisplayPrice(Math.round(quantity * overageRate * 100) / 100)

  const decrement = () =>
    onQuantityChange(Math.max(CREDIT_PURCHASE_STEP, quantity - CREDIT_PURCHASE_STEP))
  const increment = () => onQuantityChange(quantity + CREDIT_PURCHASE_STEP)

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
          Acheter des crédits supplémentaires
        </h2>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl bg-surface-accent px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-base font-bold leading-4 tracking-[0.02em] text-text-primary">
              {planLabel.toUpperCase()}
            </p>
            <span className="rounded-full bg-bg-surface px-4 py-2 text-sm font-semibold text-text-primary shadow-card">
              Total {totalPrice}
            </span>
          </div>

          <p className="m-0 text-sm text-text-secondary">
            Les crédits s'achètent par palier de {formatCreditsAmount(CREDIT_PURCHASE_STEP)} au
            tarif de {plan.overagePrice} {plan.overageSuffix}.
          </p>

          <div className="flex items-center gap-3">
            <Button
              shape="circle"
              icon={<MinusOutlined />}
              onClick={decrement}
              disabled={quantity <= CREDIT_PURCHASE_STEP}
              aria-label="Retirer 1000 crédits"
            />
            <InputNumber<number>
              className="flex-1"
              size="large"
              min={CREDIT_PURCHASE_STEP}
              step={CREDIT_PURCHASE_STEP}
              value={quantity}
              controls={false}
              formatter={(value) => formatCreditsAmount(Number(value ?? 0))}
              parser={(value) => Number((value ?? '').replace(/\s/g, '')) || CREDIT_PURCHASE_STEP}
              onChange={(value) =>
                onQuantityChange(clampToStep(Number(value ?? CREDIT_PURCHASE_STEP)))
              }
            />
            <Button
              shape="circle"
              icon={<PlusOutlined />}
              onClick={increment}
              aria-label="Ajouter 1000 crédits"
            />
          </div>

          <p className="m-0 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{formatCreditsAmount(quantity)}</span>{' '}
            crédits IA seront ajoutés à votre compte.
          </p>
        </div>

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

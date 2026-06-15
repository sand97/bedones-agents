import {
  ArrowRightOutlined,
  CreditCardOutlined,
  MinusOutlined,
  MobileOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { $api } from '@app/lib/api/$api'
import { App, Button, InputNumber, Modal } from 'antd'
import { useState } from 'react'
import { PaymentChoiceCard } from './PaymentChoiceCard'
import { PLAN_CONTENT, formatDisplayPrice, type BillingPlanKey } from './constants'

type PaymentMethod = 'CARD' | 'MOBILE_MONEY'

const STEP = 1000

interface BuyCreditsModalProps {
  open: boolean
  organisationId: string
  plan: BillingPlanKey
  mobileMoneyEnabled?: boolean
  onClose: () => void
}

export function BuyCreditsModal({
  open,
  organisationId,
  plan,
  mobileMoneyEnabled = true,
  onClose,
}: BuyCreditsModalProps) {
  const { message } = App.useApp()
  const [credits, setCredits] = useState<number>(STEP)
  const [method, setMethod] = useState<PaymentMethod>('CARD')

  const checkout = $api.useMutation('post', '/payment/org/{organisationId}/checkout/credits')

  // Tarif d'overage du forfait (ex: "$0.01" → 0.01), pour estimer le total.
  const ratePerCredit = Number(
    (PLAN_CONTENT[plan === 'free' ? 'pro' : plan]?.overagePrice ?? '$0.01').replace('$', ''),
  )
  const totalPrice = formatDisplayPrice(Math.round(credits * ratePerCredit * 100) / 100)

  async function handleConfirm() {
    try {
      const res = await checkout.mutateAsync({
        params: { path: { organisationId } },
        body: { credits, method },
      })
      if (res?.url) window.location.href = res.url
    } catch {
      message.error('Échec de la création du paiement. Réessayez.')
    }
  }

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
          onClick={handleConfirm}
          loading={checkout.isPending}
          icon={<ArrowRightOutlined />}
          iconPosition="end"
        >
          {method === 'CARD' ? 'Payer par carte' : 'Payer par Mobile Money'}
        </Button>,
      ]}
      title={
        <h2 className="m-0 text-[length:var(--font-size-title-sm)] font-semibold text-text-primary">
          Acheter des crédits
        </h2>
      }
    >
      <div className="space-y-5">
        <div className="flex h-52 flex-col justify-between rounded-2xl bg-surface-accent px-5 pb-5 pt-5">
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-base font-bold leading-4 tracking-[0.02em] text-text-primary">
              CRÉDITS SUPPLÉMENTAIRES
            </p>
            <span className="rounded-full bg-bg-surface px-4 py-2 text-sm font-semibold text-text-primary shadow-card">
              Total {totalPrice}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="large"
              shape="circle"
              icon={<MinusOutlined />}
              disabled={credits <= STEP}
              onClick={() => setCredits((c) => Math.max(STEP, c - STEP))}
            />
            <InputNumber
              size="large"
              disabled
              min={STEP}
              step={STEP}
              value={credits}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
              className="flex-1"
            />
            <Button
              size="large"
              shape="circle"
              icon={<PlusOutlined />}
              onClick={() => setCredits((c) => c + STEP)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <PaymentChoiceCard
            active={method === 'CARD'}
            title="Carte"
            icon={<CreditCardOutlined />}
            description="Visa / Mastercard"
            onClick={() => setMethod('CARD')}
          />

          <PaymentChoiceCard
            active={method === 'MOBILE_MONEY'}
            disabled={!mobileMoneyEnabled}
            title="Mobile Money"
            icon={<MobileOutlined />}
            description={
              mobileMoneyEnabled
                ? 'Orange Money / MTN Mobile Money'
                : 'Disponible uniquement pour les numeros du Cameroun.'
            }
            onClick={() => setMethod('MOBILE_MONEY')}
          />
        </div>
      </div>
    </Modal>
  )
}

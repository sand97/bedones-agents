import { $api } from '@app/lib/api/$api'
import { App, InputNumber, Modal, Segmented } from 'antd'
import { useState } from 'react'

type PaymentMethod = 'CARD' | 'MOBILE_MONEY'

const STEP = 1000

interface BuyCreditsModalProps {
  open: boolean
  organisationId: string
  onClose: () => void
}

export function BuyCreditsModal({ open, organisationId, onClose }: BuyCreditsModalProps) {
  const { message } = App.useApp()
  const [credits, setCredits] = useState<number>(STEP)
  const [method, setMethod] = useState<PaymentMethod>('CARD')

  const checkout = $api.useMutation('post', '/payment/org/{organisationId}/checkout/credits')

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
      onOk={handleConfirm}
      okText="Payer"
      confirmLoading={checkout.isPending}
      title="Acheter des crédits supplémentaires"
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">
            Nombre de crédits (par paliers de 1000)
          </span>
          <InputNumber
            min={STEP}
            step={STEP}
            value={credits}
            onChange={(v) => setCredits(v ?? STEP)}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            parser={(v) => Number((v ?? '').replace(/\s/g, ''))}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">Moyen de paiement</span>
          <Segmented<PaymentMethod>
            value={method}
            onChange={(v) => setMethod(v)}
            options={[
              { label: 'Carte', value: 'CARD' },
              { label: 'Mobile Money', value: 'MOBILE_MONEY' },
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}

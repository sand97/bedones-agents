import { CheckCircleFilled } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { useMemo } from 'react'

export type PaymentResultStatus = 'cancelled' | 'failed' | 'pending' | 'success'

export interface PaymentResultState {
  provider?: string | null
  reason?: string | null
  reference?: string | null
  status: PaymentResultStatus
}

function getPaymentMethodLabel(provider?: string | null) {
  if (provider === 'stripe') return 'carte'
  if (provider === 'notch_pay') return 'Mobile Money'
  return 'paiement'
}

interface PaymentResultModalProps {
  paymentResult: PaymentResultState | null
  onClose: () => void
  onRetry?: () => void
}

export function PaymentResultModal({ paymentResult, onClose, onRetry }: PaymentResultModalProps) {
  const content = useMemo(() => {
    if (!paymentResult) return null

    const paymentLabel = getPaymentMethodLabel(paymentResult.provider)

    if (paymentResult.status === 'success') {
      return {
        actionLabel: 'Continuer',
        primaryText: 'Votre souscription est maintenant active.',
        secondaryText:
          "Vos credits viennent d'etre ajoutes a votre compte. Quand ils se terminent, vous pourrez en racheter a tout moment.",
        showSuccessIcon: true,
        title: 'Paiement confirme',
      }
    }

    if (paymentResult.status === 'pending') {
      return {
        actionLabel: 'Compris',
        primaryText: "Nous n'avons pas encore recu la confirmation finale de votre paiement.",
        secondaryText:
          'Si le debit est valide, vos credits seront ajoutes automatiquement des reception de la confirmation.',
        showSuccessIcon: false,
        title: 'Paiement en cours de verification',
      }
    }

    return {
      actionLabel: 'Reessayer',
      primaryText:
        paymentResult.status === 'cancelled'
          ? `Le paiement par ${paymentLabel} a ete interrompu avant confirmation.`
          : "La transaction n'a pas pu etre validee.",
      secondaryText:
        'Vous pouvez relancer le paiement maintenant. Si vous avez ete debite, vos credits seront ajoutes des reception de la confirmation.',
      showSuccessIcon: false,
      title:
        paymentResult.status === 'cancelled'
          ? 'Paiement annule'
          : 'Impossible de verifier le paiement',
    }
  }, [paymentResult])

  const handleAction = () => {
    if ((paymentResult?.status === 'failed' || paymentResult?.status === 'cancelled') && onRetry) {
      onRetry()
    }
    onClose()
  }

  return (
    <Modal
      open={Boolean(paymentResult)}
      onCancel={onClose}
      closeIcon={null}
      width={520}
      rootClassName="app-double-modal"
      footer={[
        <Button key="action" type="primary" onClick={handleAction}>
          {content?.actionLabel || 'Fermer'}
        </Button>,
      ]}
      title={
        <div className="flex items-center gap-3">
          {content?.showSuccessIcon ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#24D3661A] text-[20px] text-brand-whatsapp">
              <CheckCircleFilled />
            </span>
          ) : null}
          <h2 className="m-0 text-[length:var(--font-size-title-sm)] font-semibold text-text-primary">
            {content?.title || 'Resultat du paiement'}
          </h2>
        </div>
      }
    >
      {paymentResult && content ? (
        <div className="space-y-4">
          <p className="m-0 text-sm leading-7 text-text-primary">{content.primaryText}</p>
          <p className="m-0 text-sm leading-7 text-text-primary">{content.secondaryText}</p>
          {paymentResult.reference && paymentResult.status !== 'success' ? (
            <p className="m-0 text-xs font-medium tracking-[0.02em] text-text-soft">
              Reference: {paymentResult.reference}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

import { $api } from '@app/lib/api/$api'
import { Button, Result } from 'antd'
import { getPlanLabel } from './constants'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

type PlanKey = 'free' | 'pro' | 'business'

interface PaymentRow {
  id: string
  kind: string
  status: string
  creditsPurchased: number | null
}

interface PaymentSuccessProps {
  organisationId: string
  onContinue: () => void
}

export function PaymentSuccess({ organisationId, onContinue }: PaymentSuccessProps) {
  const subscriptionQuery = $api.useQuery('get', '/payment/org/{organisationId}/subscription', {
    params: { path: { organisationId } },
  })
  // Le webhook peut arriver après la redirection : on rafraîchit tant que le
  // dernier paiement n'est pas COMPLETED (max via le polling de react-query).
  const paymentsQuery = $api.useQuery(
    'get',
    '/payment/org/{organisationId}/payments',
    { params: { path: { organisationId } } },
    {
      refetchInterval: (query) => {
        const rows = query.state.data as PaymentRow[] | undefined
        return rows && rows[0]?.status === 'COMPLETED' ? false : 3000
      },
    },
  )

  const latest = (paymentsQuery.data as PaymentRow[] | undefined)?.[0]
  const sub = subscriptionQuery.data
  const completed = latest?.status === 'COMPLETED'
  const isCredit = latest?.kind === 'CREDIT_PURCHASE'

  const planLabel = getPlanLabel((sub?.plan ?? 'free') as PlanKey)
  const monthlyCredits = sub?.monthlyCredits ?? 0
  const creditsBought = latest?.creditsPurchased ?? 0

  const title = !completed
    ? 'Paiement reçu'
    : isCredit
      ? 'Crédits ajoutés 🎉'
      : 'Souscription confirmée 🎉'

  const subTitle = !completed
    ? 'Nous validons votre paiement. Cette page se met à jour automatiquement.'
    : isCredit
      ? `${creditsBought.toLocaleString('fr-FR')} crédits ont été ajoutés à votre organisation.`
      : `Votre forfait ${planLabel} est actif. Vous disposez de ${monthlyCredits.toLocaleString('fr-FR')} crédits par mois.`

  return (
    <div className="flex w-full justify-center px-4 py-10">
      <Result
        status={completed ? 'success' : 'info'}
        title={title}
        subTitle={subTitle}
        extra={[
          completed ? (
            <Button
              key="invoice"
              type="primary"
              href={`${API_URL}/payment/org/${organisationId}/payments/${latest?.id}/invoice`}
              target="_blank"
              rel="noreferrer"
            >
              Télécharger la facture
            </Button>
          ) : (
            <Button
              key="refresh"
              loading={paymentsQuery.isFetching}
              onClick={() => paymentsQuery.refetch()}
            >
              Rafraîchir
            </Button>
          ),
          <Button key="continue" onClick={onContinue}>
            Voir mon abonnement
          </Button>,
        ]}
      />
    </div>
  )
}

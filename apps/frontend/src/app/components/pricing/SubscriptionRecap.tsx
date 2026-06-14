import { $api } from '@app/lib/api/$api'
import { Button, Card, Descriptions, Progress, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { getPlanLabel } from './constants'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

type PlanKey = 'free' | 'pro' | 'business'

interface PaymentRow {
  id: string
  kind: string
  status: string
  amount: number
  currency: string
  creditsPurchased: number | null
  description: string | null
  createdAt: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Actif', color: 'green' },
  INCOMPLETE: { label: 'En attente', color: 'gold' },
  PAST_DUE: { label: 'Paiement en retard', color: 'orange' },
  CANCELED: { label: 'Annulé', color: 'red' },
  EXPIRED: { label: 'Expiré', color: 'default' },
}

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'Payé', color: 'green' },
  PENDING: { label: 'En attente', color: 'gold' },
  FAILED: { label: 'Échoué', color: 'red' },
  REFUNDED: { label: 'Remboursé', color: 'blue' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

interface SubscriptionRecapProps {
  organisationId: string
  onUpgrade: () => void
  onBuyCredits: () => void
}

export function SubscriptionRecap({
  organisationId,
  onUpgrade,
  onBuyCredits,
}: SubscriptionRecapProps) {
  const subscriptionQuery = $api.useQuery('get', '/payment/org/{organisationId}/subscription', {
    params: { path: { organisationId } },
  })
  const creditsQuery = $api.useQuery('get', '/stats/org/{organisationId}/credits', {
    params: { path: { organisationId } },
  })
  const paymentsQuery = $api.useQuery('get', '/payment/org/{organisationId}/payments', {
    params: { path: { organisationId } },
  })

  const sub = subscriptionQuery.data
  const plan = (sub?.plan ?? 'free') as PlanKey
  const isFree = plan === 'free'
  const used = creditsQuery.data?.used ?? 0
  const total = creditsQuery.data?.total ?? sub?.totalCredits ?? 0
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  const paymentMethodLabel = (() => {
    const m = sub?.paymentMethod
    if (!m || !m.type) return '—'
    if (m.type === 'CARD') return `Carte ${m.brand ?? ''} •••• ${m.last4 ?? '????'}`.trim()
    return `Mobile money — ${m.phone ?? ''}`.trim()
  })()

  const columns: ColumnsType<PaymentRow> = [
    { title: 'Date', dataIndex: 'createdAt', key: 'date', render: (v: string) => formatDate(v) },
    {
      title: 'Détail',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null, row) =>
        v ?? (row.kind === 'SUBSCRIPTION' ? 'Abonnement' : 'Achat de crédits'),
    },
    {
      title: 'Montant',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number, row) => `${v.toFixed(2)} ${row.currency}`,
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const s = PAYMENT_STATUS[v] ?? { label: v, color: 'default' }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: 'Facture',
      key: 'invoice',
      render: (_, row) =>
        row.status === 'COMPLETED' ? (
          <Button
            type="link"
            size="small"
            href={`${API_URL}/payment/org/${organisationId}/payments/${row.id}/invoice`}
            target="_blank"
            rel="noreferrer"
          >
            Télécharger
          </Button>
        ) : (
          <span className="text-text-soft">—</span>
        ),
    },
  ]

  const statusTag = sub?.status ? STATUS_LABEL[sub.status] : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mon offre" loading={subscriptionQuery.isLoading}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Forfait">
              <span className="font-semibold">{getPlanLabel(plan)}</span>
              {statusTag ? (
                <Tag className="ml-2" color={statusTag.color}>
                  {statusTag.label}
                </Tag>
              ) : null}
            </Descriptions.Item>
            {sub?.billingMonths ? (
              <Descriptions.Item label="Facturation">{sub.billingMonths} mois</Descriptions.Item>
            ) : null}
            {sub?.currentPeriodEnd ? (
              <Descriptions.Item
                label={sub.cancelAtPeriodEnd ? 'Se termine le' : 'Prochain renouvellement'}
              >
                {formatDate(sub.currentPeriodEnd)}
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="Moyen de paiement">{paymentMethodLabel}</Descriptions.Item>
          </Descriptions>
          <div className="mt-4 flex gap-2">
            {isFree ? (
              <Button type="primary" onClick={onUpgrade}>
                Améliorer mon offre
              </Button>
            ) : (
              <>
                <Button type="primary" onClick={onBuyCredits}>
                  Acheter des crédits
                </Button>
                <Button onClick={onUpgrade}>Changer d'offre</Button>
              </>
            )}
          </div>
        </Card>

        <Card title="Crédits" loading={creditsQuery.isLoading}>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold">{used.toLocaleString('fr-FR')}</span>
              <span className="text-text-secondary">/ {total.toLocaleString('fr-FR')} crédits</span>
            </div>
            <Progress percent={usedPct} status={usedPct >= 100 ? 'exception' : 'active'} />
            <div className="flex justify-between text-sm text-text-secondary">
              <span>Forfait : {(sub?.monthlyCredits ?? 0).toLocaleString('fr-FR')} / mois</span>
              <span>Achetés : {(sub?.purchasedCredits ?? 0).toLocaleString('fr-FR')}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Historique des paiements" loading={paymentsQuery.isLoading}>
        <Table<PaymentRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={(paymentsQuery.data as PaymentRow[]) ?? []}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'Aucun paiement' }}
        />
      </Card>
    </div>
  )
}

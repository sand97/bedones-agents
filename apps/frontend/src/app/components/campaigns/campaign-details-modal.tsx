import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Segmented, Spin, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LoyaltyCampaign } from '@app/lib/api/loyalty-api'
import { $api } from '@app/lib/api/$api'
import type { CampaignDetails } from './campaign-shared'

export function CampaignDetailsModal({
  campaign,
  open,
  onClose,
}: {
  campaign: LoyaltyCampaign | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'stats' | 'contacts'>('stats')
  const [bucket, setBucket] = useState<'delivered' | 'read' | 'replied'>('delivered')
  const [page, setPage] = useState(1)
  const contactStatusLabels: Record<string, string> = {
    PENDING: t('loyalty.campaign_contact_status_pending'),
    SENT: t('loyalty.campaign_contact_status_sent'),
    DELIVERED: t('loyalty.campaign_contact_status_delivered'),
    READ: t('loyalty.campaign_contact_status_read'),
    REPLIED: t('loyalty.campaign_contact_status_replied'),
    FAILED: t('loyalty.campaign_contact_status_failed'),
  }

  const detailsQuery = $api.useQuery(
    'get',
    '/loyalty/campaigns/{id}/details',
    {
      params: {
        path: { id: campaign?.id ?? '' },
        query: { bucket, page: String(page), pageSize: '10' },
      },
    },
    { enabled: open && !!campaign },
  )
  const details = detailsQuery.data as unknown as CampaignDetails | undefined

  return (
    <Modal title={campaign?.name} open={open} onCancel={onClose} footer={null} width={860}>
      <Segmented
        value={tab}
        onChange={(value) => setTab(value as 'stats' | 'contacts')}
        options={[
          { label: t('loyalty.campaign_details_stats'), value: 'stats' },
          { label: t('loyalty.campaign_details_contacts'), value: 'contacts' },
        ]}
      />
      {detailsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spin />
        </div>
      ) : tab === 'stats' ? (
        <div className="mt-4 h-72">
          <ResponsiveContainer>
            <LineChart data={details?.stats ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => dayjs(value).format('DD/MM')}
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={(value) => dayjs(value as string).format('DD/MM/YYYY')} />
              <Line type="monotone" dataKey="delivered" stroke="#1677ff" strokeWidth={2} />
              <Line type="monotone" dataKey="read" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="replied" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4">
          <Segmented
            value={bucket}
            onChange={(value) => {
              setBucket(value as 'delivered' | 'read' | 'replied')
              setPage(1)
            }}
            options={[
              { label: t('loyalty.col_delivered'), value: 'delivered' },
              { label: t('loyalty.col_read'), value: 'read' },
              { label: t('loyalty.col_replied'), value: 'replied' },
            ]}
          />
          <Table
            className="mt-3"
            rowKey="id"
            size="small"
            dataSource={details?.contacts.data ?? []}
            columns={[
              { title: t('loyalty.campaign_contact'), dataIndex: 'contactName' },
              { title: t('loyalty.campaign_contact_phone'), dataIndex: 'contactPhone' },
              {
                title: t('loyalty.campaign_contact_language'),
                dataIndex: 'languageCode',
                render: (value) => value ?? '-',
              },
              {
                title: t('promotions.status'),
                dataIndex: 'status',
                render: (value) => <Tag>{contactStatusLabels[String(value)] ?? value}</Tag>,
              },
            ]}
            pagination={{
              current: page,
              pageSize: 10,
              total: details?.contacts.total ?? 0,
              onChange: setPage,
            }}
          />
        </div>
      )}
    </Modal>
  )
}

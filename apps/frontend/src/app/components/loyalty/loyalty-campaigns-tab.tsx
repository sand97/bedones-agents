import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Modal, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import { loyaltyApi, type LoyaltyCampaign } from '@app/lib/api/loyalty-api'
import { LoyaltyCampaignModal, type LoyaltyCampaignSubmitData } from './loyalty-campaign-modal'
import { LoyaltyTemplateModal } from './loyalty-template-modal'

interface Props {
  socialAccountId: string
}

export function LoyaltyCampaignsTab({ socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editing, setEditing] = useState<LoyaltyCampaign | null>(null)

  const queryKey = useMemo(() => ['loyalty-campaigns', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listCampaigns(socialAccountId),
    enabled: !!socialAccountId,
  })

  const createMutation = useMutation({
    mutationFn: (payload: LoyaltyCampaignSubmitData) =>
      loyaltyApi.createCampaign({ socialAccountId, ...payload }),
    onSuccess: (created) => {
      queryClient.setQueryData<LoyaltyCampaign[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      setModalOpen(false)
      setEditing(null)
      message.success(t('loyalty.campaign_created'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LoyaltyCampaignSubmitData }) =>
      loyaltyApi.updateCampaign(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<LoyaltyCampaign[]>(queryKey, (prev) =>
        (prev ?? []).map((c) => (c.id === updated.id ? updated : c)),
      )
      setModalOpen(false)
      setEditing(null)
      message.success(t('loyalty.campaign_updated'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await loyaltyApi.removeCampaign(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LoyaltyCampaign[]>(queryKey, (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      )
      message.success(t('common.delete'))
    },
  })

  const handleSubmit = (payload: LoyaltyCampaignSubmitData) => {
    if (editing) updateMutation.mutate({ id: editing.id, payload })
    else createMutation.mutate(payload)
  }

  const handleDelete = (campaign: LoyaltyCampaign) => {
    Modal.confirm({
      title: t('loyalty.confirm_delete_campaign_title'),
      content: t('loyalty.confirm_delete_campaign_message', { name: campaign.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(campaign.id),
    })
  }

  const STATUS_CONFIG: Record<LoyaltyCampaign['status'], { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    SCHEDULED: { label: t('loyalty.status_scheduled'), color: '#3b82f6' },
    RUNNING: { label: t('loyalty.status_running'), color: '#22c55e' },
    COMPLETED: { label: t('loyalty.status_completed'), color: '#64748b' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
  }

  const FREQ_LABEL: Record<LoyaltyCampaign['frequency'], string> = {
    ONCE: t('loyalty.frequency_once'),
    DAILY: t('loyalty.frequency_daily'),
    WEEKLY: t('loyalty.frequency_weekly'),
    MONTHLY: t('loyalty.frequency_monthly'),
  }

  const columns: ColumnsType<LoyaltyCampaign> = [
    {
      title: t('loyalty.campaign_name'),
      key: 'name',
      ellipsis: true,
      render: (_, record) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{record.name}</div>
          {record.bonus && (
            <div className="truncate text-xs text-text-muted">{record.bonus.name}</div>
          )}
        </div>
      ),
    },
    {
      title: t('loyalty.col_schedule'),
      key: 'schedule',
      width: 280,
      render: (_, record) => (
        <div className="flex flex-col text-sm text-text-secondary">
          <span>
            <span className="text-text-muted">{t('loyalty.col_started')}:</span>{' '}
            {record.startDate ? formatDate(record.startDate) : '—'}
          </span>
          <span>
            <span className="text-text-muted">{t('loyalty.col_ends')}:</span>{' '}
            {record.endDate ? formatDate(record.endDate) : '—'}
          </span>
          <span>
            <span className="text-text-muted">{t('loyalty.col_frequency')}:</span>{' '}
            {FREQ_LABEL[record.frequency]}
          </span>
        </div>
      ),
    },
    {
      title: t('loyalty.col_delivered'),
      dataIndex: 'deliveredCount',
      key: 'deliveredCount',
      width: 120,
      render: (count: number) => (
        <span className="text-sm font-medium text-text-primary">{count ?? 0}</span>
      ),
    },
    {
      title: t('loyalty.col_read'),
      dataIndex: 'readCount',
      key: 'readCount',
      width: 100,
      render: (count: number) => (
        <span className="text-sm font-medium text-text-primary">{count ?? 0}</span>
      ),
    },
    {
      title: t('loyalty.col_replied'),
      dataIndex: 'repliedCount',
      key: 'repliedCount',
      width: 110,
      render: (count: number) => (
        <span className="text-sm font-medium text-text-primary">{count ?? 0}</span>
      ),
    },
    {
      title: t('promotions.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: LoyaltyCampaign['status']) => {
        const cfg = STATUS_CONFIG[status]
        return cfg ? <StatusTag label={cfg.label} color={cfg.color} /> : null
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={() => handleDelete(record)}
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="tickets-filters">
        <Button
          type="primary"
          icon={<Plus size={16} strokeWidth={1.5} />}
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          {t('common.add')}
        </Button>
        <Button
          icon={<FileText size={16} strokeWidth={1.5} />}
          onClick={() => setTemplatesOpen(true)}
        >
          {t('loyalty.templates')}
        </Button>
      </div>

      <Table
        dataSource={data ?? []}
        columns={columns}
        bordered
        rowKey="id"
        pagination={{ pageSize: 10 }}
        className="tickets-table"
        size="middle"
        loading={isLoading}
      />

      <LoyaltyCampaignModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        socialAccountId={socialAccountId}
        editingCampaign={editing}
        onSubmit={handleSubmit}
        submitLoading={createMutation.isPending || updateMutation.isPending}
      />

      <LoyaltyTemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        socialAccountId={socialAccountId}
      />
    </>
  )
}

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Modal, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate, formatPrice } from '@app/lib/format'
import {
  ProductPickerModal,
  type PickerProduct,
} from '@app/components/promotions/product-picker-modal'
import { catalogApi } from '@app/lib/api/agent-api'
import { useLayout } from '@app/contexts/layout-context'
import { loyaltyApi, type LoyaltyBonus } from '@app/lib/api/loyalty-api'
import { LoyaltyBonusModal, type LoyaltyBonusSubmitData } from './loyalty-bonus-modal'
import { LoyaltyBonusDescriptionCard } from './loyalty-bonus-description-card'

interface Props {
  socialAccountId: string
  orgSlug: string
}

export function LoyaltyBonusTab({ socialAccountId, orgSlug }: Props) {
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LoyaltyBonus | null>(null)

  // Pickers (trigger + reward share the same ProductPickerModal but different selections)
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false)
  const [rewardPickerOpen, setRewardPickerOpen] = useState(false)
  const [triggerProducts, setTriggerProducts] = useState<PickerProduct[]>([])
  const [rewardProducts, setRewardProducts] = useState<PickerProduct[]>([])

  const queryKey = useMemo(() => ['loyalty-bonuses', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listBonuses(socialAccountId),
    enabled: !!socialAccountId,
  })

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: Infinity,
  })

  const filtered = useMemo(() => {
    const list = data ?? []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const createMutation = useMutation({
    mutationFn: (payload: LoyaltyBonusSubmitData) =>
      loyaltyApi.createBonus({
        socialAccountId,
        ...payload,
      }),
    onSuccess: (created) => {
      queryClient.setQueryData<LoyaltyBonus[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      handleClose()
      message.success(t('loyalty.bonus_created'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LoyaltyBonusSubmitData }) =>
      loyaltyApi.updateBonus(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<LoyaltyBonus[]>(queryKey, (prev) =>
        (prev ?? []).map((b) => (b.id === updated.id ? updated : b)),
      )
      handleClose()
      message.success(t('loyalty.bonus_updated'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await loyaltyApi.removeBonus(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LoyaltyBonus[]>(queryKey, (prev) =>
        (prev ?? []).filter((b) => b.id !== id),
      )
      message.success(t('common.delete'))
    },
  })

  const handleSubmit = (payload: LoyaltyBonusSubmitData) => {
    if (editing) updateMutation.mutate({ id: editing.id, payload })
    else createMutation.mutate(payload)
  }

  const handleClose = () => {
    setModalOpen(false)
    setEditing(null)
    setTriggerProducts([])
    setRewardProducts([])
  }

  const handleDelete = (bonus: LoyaltyBonus) => {
    Modal.confirm({
      title: t('loyalty.confirm_delete_bonus_title'),
      content: t('loyalty.confirm_delete_bonus_message', { name: bonus.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(bonus.id),
    })
  }

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    ACTIVE: { label: t('promotions.status_active'), color: '#22c55e' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
    EXPIRED: { label: t('promotions.status_expired'), color: '#ef4444' },
  }

  const renderReward = (b: LoyaltyBonus) => {
    if (b.rewardType === 'CREDIT') return formatPrice(b.rewardCredit ?? 0, 'FCFA')
    if (b.rewardType === 'PERCENT') return `-${b.rewardPercent ?? 0}%`
    const names = b.rewardProducts.map((p) => p.product.name).filter(Boolean)
    return (
      <Tooltip title={names.join(', ')}>
        <span>{t('loyalty.products_count', { count: b.rewardProducts.length })}</span>
      </Tooltip>
    )
  }

  const renderTargets = (b: LoyaltyBonus) => {
    const parts: string[] = []
    if (b.targetSpend !== null && b.targetSpend !== undefined)
      parts.push(`${t('loyalty.target_spend_short')}: ${formatPrice(b.targetSpend, 'FCFA')}`)
    if (b.targetOrderCount !== null && b.targetOrderCount !== undefined)
      parts.push(`${t('loyalty.target_orders_short')}: ${b.targetOrderCount}`)
    if (
      (b.targetProductsCount !== null && b.targetProductsCount !== undefined) ||
      b.triggerProducts.length > 0
    ) {
      parts.push(
        `${t('loyalty.target_products_short')}: ${b.targetProductsCount ?? b.triggerProducts.length}`,
      )
    }
    return parts.length ? parts.join(' · ') : '—'
  }

  const columns: ColumnsType<LoyaltyBonus> = [
    {
      title: t('loyalty.bonus_name'),
      key: 'name',
      ellipsis: true,
      render: (_, record) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{record.name}</div>
          {record.description && (
            <div className="truncate text-xs text-text-muted">{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: t('loyalty.bonus_targets'),
      key: 'targets',
      width: 320,
      render: (_, record) => (
        <span className="text-sm text-text-secondary">{renderTargets(record)}</span>
      ),
    },
    {
      title: t('loyalty.reward'),
      key: 'reward',
      width: 200,
      render: (_, record) => (
        <span className="text-sm font-medium text-text-primary">{renderReward(record)}</span>
      ),
    },
    {
      title: t('promotions.stackable'),
      key: 'stackable',
      width: 110,
      render: (_, record) => (
        <Tag bordered={false} color={record.stackable ? 'green' : 'default'}>
          {record.stackable ? t('promotions.yes') : t('promotions.no')}
        </Tag>
      ),
    },
    {
      title: t('promotions.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: LoyaltyBonus['status']) => {
        const cfg = STATUS_CONFIG[status]
        return cfg ? <StatusTag label={cfg.label} color={cfg.color} /> : null
      },
    },
    {
      title: t('promotions.period'),
      key: 'period',
      width: 240,
      render: (_, record) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {record.startDate ? formatDate(record.startDate) : '—'} —{' '}
          {record.endDate ? formatDate(record.endDate) : '—'}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 230,
      render: (_, record) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="small"
            icon={<Pencil size={14} />}
            onClick={() => {
              setEditing(record)
              setModalOpen(true)
            }}
          >
            {t('common.edit')}
          </Button>
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
        <Input
          placeholder={t('loyalty.bonus_search_placeholder')}
          prefix={<Search size={16} className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="tickets-filter-input"
        />
      </div>

      {isDesktop ? (
        <Table
          dataSource={filtered}
          columns={columns}
          bordered
          rowKey="id"
          pagination={{ pageSize: 10 }}
          className="tickets-table"
          size="middle"
          loading={isLoading}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-text-muted">
              {isLoading ? t('common.loading') : t('loyalty.no_bonuses')}
            </div>
          ) : (
            filtered.map((bonus) => (
              <LoyaltyBonusDescriptionCard
                key={bonus.id}
                bonus={bonus}
                onEdit={() => {
                  setEditing(bonus)
                  setModalOpen(true)
                }}
                onDelete={() => handleDelete(bonus)}
              />
            ))
          )}
        </div>
      )}

      <LoyaltyBonusModal
        open={modalOpen}
        onClose={handleClose}
        editingBonus={editing}
        onOpenTriggerPicker={() => setTriggerPickerOpen(true)}
        onOpenRewardPicker={() => setRewardPickerOpen(true)}
        triggerProducts={triggerProducts}
        setTriggerProducts={setTriggerProducts}
        rewardProducts={rewardProducts}
        setRewardProducts={setRewardProducts}
        onSubmit={handleSubmit}
        submitLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ProductPickerModal
        open={triggerPickerOpen}
        onClose={() => setTriggerPickerOpen(false)}
        onSave={() => {}}
        onSaveProducts={setTriggerProducts}
        initialSelection={triggerProducts.map((p) => p.id)}
        catalogs={catalogsQuery.data}
      />
      <ProductPickerModal
        open={rewardPickerOpen}
        onClose={() => setRewardPickerOpen(false)}
        onSave={() => {}}
        onSaveProducts={setRewardProducts}
        initialSelection={rewardProducts.map((p) => p.id)}
        catalogs={catalogsQuery.data}
      />
    </>
  )
}

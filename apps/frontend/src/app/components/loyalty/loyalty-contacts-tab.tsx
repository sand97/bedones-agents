import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Modal, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { formatPrice } from '@app/lib/format'
import { loyaltyApi, type LoyaltyContact } from '@app/lib/api/loyalty-api'
import { LoyaltyContactModal, type LoyaltyContactSubmitData } from './loyalty-contact-modal'

interface Props {
  socialAccountId: string
  /** Reserved for org-scoped extensions (currently unused but matches sibling tabs) */
  orgSlug: string
}

export function LoyaltyContactsTab({ socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LoyaltyContact | null>(null)

  const queryKey = useMemo(() => ['loyalty-contacts', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listContacts(socialAccountId),
    enabled: !!socialAccountId,
  })

  const filtered = useMemo(() => {
    const list = data ?? []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
  }, [data, search])

  const createMutation = useMutation({
    mutationFn: (payload: LoyaltyContactSubmitData) =>
      loyaltyApi.createContact({ socialAccountId, ...payload }),
    onSuccess: (created) => {
      queryClient.setQueryData<LoyaltyContact[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      setModalOpen(false)
      setEditing(null)
      message.success(t('loyalty.contact_created'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LoyaltyContactSubmitData }) =>
      loyaltyApi.updateContact(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<LoyaltyContact[]>(queryKey, (prev) =>
        (prev ?? []).map((c) => (c.id === updated.id ? updated : c)),
      )
      setModalOpen(false)
      setEditing(null)
      message.success(t('loyalty.contact_updated'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await loyaltyApi.removeContact(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LoyaltyContact[]>(queryKey, (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      )
      message.success(t('common.delete'))
    },
  })

  const handleSubmit = (payload: LoyaltyContactSubmitData) => {
    if (editing) updateMutation.mutate({ id: editing.id, payload })
    else createMutation.mutate(payload)
  }

  const handleDelete = (contact: LoyaltyContact) => {
    Modal.confirm({
      title: t('loyalty.confirm_delete_contact_title'),
      content: t('loyalty.confirm_delete_contact_message', { name: contact.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(contact.id),
    })
  }

  const columns: ColumnsType<LoyaltyContact> = [
    {
      title: t('loyalty.contact_name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <span className="text-sm font-medium text-text-primary">{name}</span>
      ),
    },
    {
      title: t('loyalty.contact_phone'),
      dataIndex: 'phone',
      key: 'phone',
      width: 200,
      render: (phone: string) => (
        <span className="font-mono text-sm text-text-secondary">{phone}</span>
      ),
    },
    {
      title: t('loyalty.contact_total_spent'),
      dataIndex: 'totalSpent',
      key: 'totalSpent',
      width: 180,
      render: (value: number) => (
        <span className="text-sm font-medium text-text-primary">
          {formatPrice(value || 0, 'FCFA')}
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
          placeholder={t('loyalty.contact_search_placeholder')}
          prefix={<Search size={16} className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="tickets-filter-input"
        />
      </div>

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

      <LoyaltyContactModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        editingContact={editing}
        onSubmit={handleSubmit}
        submitLoading={createMutation.isPending || updateMutation.isPending}
      />
    </>
  )
}

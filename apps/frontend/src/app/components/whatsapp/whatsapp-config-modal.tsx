import { useState } from 'react'
import { Button, ColorPicker, Divider, Input, Modal, Tag, Typography } from 'antd'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Catalog } from '@app/lib/api/agent-api'
import { catalogApi } from '@app/lib/api/agent-api'

const { Text } = Typography

interface LabelItem {
  id: string
  name: string
  color: string
}

const DEFAULT_LABELS: LabelItem[] = [
  { id: '1', name: 'VIP', color: '#FFD700' },
  { id: '2', name: 'New Customer', color: '#52c41a' },
  { id: '3', name: 'Pending', color: '#faad14' },
  { id: '4', name: 'Urgent', color: '#ff4d4f' },
]

interface WhatsappConfigModalProps {
  open: boolean
  onClose: () => void
  phoneNumberId: string
  accountName: string
  catalogs: Catalog[]
  commerceData?: { data: Array<{ is_catalog_visible: boolean; id?: string }> }
}

export function WhatsappConfigModal({
  open,
  onClose,
  phoneNumberId,
  accountName,
  catalogs,
  commerceData,
}: WhatsappConfigModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // ─── Labels state ───
  const [labels, setLabels] = useState<LabelItem[]>(DEFAULT_LABELS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleAddLabel = () => {
    const newLabel: LabelItem = {
      id: crypto.randomUUID(),
      name: t('whatsapp_config.label_name'),
      color: '#1677ff',
    }
    setLabels((prev) => [...prev, newLabel])
    setEditingId(newLabel.id)
    setEditingName(newLabel.name)
  }

  const handleDeleteLabel = (id: string) => {
    setLabels((prev) => prev.filter((l) => l.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const handleStartEdit = (label: LabelItem) => {
    setEditingId(label.id)
    setEditingName(label.name)
  }

  const handleFinishEdit = () => {
    if (editingId && editingName.trim()) {
      setLabels((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, name: editingName.trim() } : l)),
      )
    }
    setEditingId(null)
    setEditingName('')
  }

  const handleColorChange = (id: string, color: string) => {
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, color } : l)))
  }

  // ─── Catalog association ───
  const associatedCatalogId = commerceData?.data?.[0]?.id
  const associatedCatalog = catalogs.find((c) => c.providerId === associatedCatalogId)

  const dissociateMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.dissociatePhone(catalogId, phoneNumberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commerce', phoneNumberId] })
    },
  })

  const associateMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.associatePhone(catalogId, phoneNumberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commerce', phoneNumberId] })
    },
  })

  const handleDissociate = () => {
    if (!associatedCatalog) return
    Modal.confirm({
      title: t('whatsapp_config.dissociate'),
      content: t('whatsapp_config.dissociate_confirm'),
      okButtonProps: { danger: true },
      onOk: () => dissociateMutation.mutateAsync(associatedCatalog.id),
    })
  }

  const handleAssociate = (catalogId: string) => {
    associateMutation.mutate(catalogId)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('whatsapp_config.title')}
      footer={null}
      width={520}
    >
      {/* ── Section 1: Phone Info ── */}
      <div className="mb-4">
        <Text strong>{t('whatsapp_config.phone_info')}</Text>
        <div className="mt-2 flex flex-col gap-1">
          <Text className="text-text-secondary">{accountName}</Text>
          <Text className="text-text-muted" copyable>
            {phoneNumberId}
          </Text>
        </div>
      </div>

      <Divider className="my-3" />

      {/* ── Section 2: Labels ── */}
      <div className="mb-4">
        <Text strong>{t('whatsapp_config.labels')}</Text>
        <div className="mt-2 flex flex-col gap-2">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center gap-2">
              <ColorPicker
                value={label.color}
                size="small"
                onChange={(_, hex) => handleColorChange(label.id, hex)}
              />
              {editingId === label.id ? (
                <Input
                  size="small"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onPressEnter={handleFinishEdit}
                  onBlur={handleFinishEdit}
                  autoFocus
                  className="flex-1"
                />
              ) : (
                <Tag
                  className="flex-1 cursor-default"
                  style={{ borderColor: label.color, color: label.color }}
                >
                  {label.name}
                </Tag>
              )}
              <Button
                type="text"
                size="small"
                icon={<Pencil size={14} />}
                onClick={() => handleStartEdit(label)}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => handleDeleteLabel(label.id)}
              />
            </div>
          ))}
          <Button type="dashed" size="small" icon={<Plus size={14} />} onClick={handleAddLabel}>
            {t('whatsapp_config.add_label')}
          </Button>
        </div>
      </div>

      <Divider className="my-3" />

      {/* ── Section 3: Catalog ── */}
      <div>
        <Text strong>{t('whatsapp_config.catalog_section')}</Text>
        <div className="mt-2">
          {associatedCatalog ? (
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Text>{t('whatsapp_config.current_catalog')}</Text>
                <Text strong>{associatedCatalog.name}</Text>
              </div>
              <Button
                danger
                size="small"
                loading={dissociateMutation.isPending}
                onClick={handleDissociate}
              >
                {t('whatsapp_config.dissociate')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Text className="text-text-muted">{t('whatsapp_config.no_catalog')}</Text>
              {catalogs.length > 0 ? (
                catalogs.map((catalog) => (
                  <Button
                    key={catalog.id}
                    size="small"
                    loading={
                      associateMutation.isPending && associateMutation.variables === catalog.id
                    }
                    onClick={() => handleAssociate(catalog.id)}
                  >
                    {catalog.name}
                  </Button>
                ))
              ) : (
                <Text className="text-text-muted">{t('whatsapp_config.associate_catalog')}</Text>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

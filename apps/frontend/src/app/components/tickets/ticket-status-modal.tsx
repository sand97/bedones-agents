import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Divider, Input, Modal, Select, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import type { TicketStatusItem } from '@app/lib/api/agent-api'

const { Text } = Typography

const STATUS_COLORS = [
  { value: '#f5222d', label: 'Red' },
  { value: '#fa541c', label: 'Orange' },
  { value: '#fa8c16', label: 'Gold' },
  { value: '#fadb14', label: 'Yellow' },
  { value: '#a0d911', label: 'Lime' },
  { value: '#52c41a', label: 'Green' },
  { value: '#13c2c2', label: 'Cyan' },
  { value: '#1677ff', label: 'Blue' },
  { value: '#2f54eb', label: 'Indigo' },
  { value: '#722ed1', label: 'Purple' },
  { value: '#eb2f96', label: 'Pink' },
  { value: '#8c8c8c', label: 'Grey' },
  { value: '#434343', label: 'Dark' },
  { value: '#d4b106', label: 'Amber' },
  { value: '#08979c', label: 'Teal' },
]

interface TicketStatusModalProps {
  open: boolean
  onClose: () => void
  statuses: TicketStatusItem[]
  onSave: (statuses: TicketStatusItem[]) => void
  saving?: boolean
}

export function TicketStatusModal({
  open,
  onClose,
  statuses: initialStatuses,
  onSave,
  saving,
}: TicketStatusModalProps) {
  const { t } = useTranslation()
  const [statuses, setStatuses] = useState<TicketStatusItem[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#1677ff')

  useEffect(() => {
    if (open) {
      setStatuses(initialStatuses.length > 0 ? [...initialStatuses] : [])
      setNewName('')
      setNewColor('#1677ff')
    }
  }, [open, initialStatuses])

  const colorSelectOptions = STATUS_COLORS.map((c) => ({
    value: c.value,
    label: (
      <div className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full" style={{ background: c.value }} />
        <span>{c.label}</span>
      </div>
    ),
  }))

  // Default status select options
  const defaultStatusOptions = useMemo(
    () =>
      statuses.map((s, i) => ({
        value: i,
        label: (
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ),
      })),
    [statuses],
  )

  const currentDefaultIndex = statuses.findIndex((s) => s.isDefault)

  const handleColorChange = (index: number, color: string) => {
    setStatuses((prev) => prev.map((s, i) => (i === index ? { ...s, color } : s)))
  }

  const handleNameChange = (index: number, name: string) => {
    setStatuses((prev) => prev.map((s, i) => (i === index ? { ...s, name } : s)))
  }

  const handleDelete = (index: number) => {
    setStatuses((prev) => {
      const next = prev.filter((_, i) => i !== index)
      // If we deleted the default, make the first one default
      if (next.length > 0 && !next.some((s) => s.isDefault)) {
        next[0] = { ...next[0], isDefault: true }
      }
      return next
    })
  }

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setStatuses((prev) => [
      ...prev,
      {
        name: trimmed,
        color: newColor,
        order: prev.length,
        isDefault: prev.length === 0,
      },
    ])
    setNewName('')
  }

  const handleDefaultChange = (index: number) => {
    setStatuses((prev) => prev.map((s, i) => ({ ...s, isDefault: i === index })))
  }

  const handleSave = () => {
    // Re-index orders
    const reordered = statuses.map((s, i) => ({ ...s, order: i }))
    onSave(reordered)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('tickets.statuses_title')}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          onClick={handleSave}
          disabled={statuses.length === 0}
        >
          {t('common.save')}
        </Button>,
      ]}
      width={480}
      destroyOnHidden
    >
      <Text type="secondary" className="text-xs">
        {t('tickets.statuses_desc')}
      </Text>

      {/* Existing statuses */}
      <div className="mt-4 flex flex-col gap-2">
        {statuses.map((status, index) => (
          <div key={`${status.id ?? index}`} className="wa-label-row">
            <Select
              value={status.color}
              className="wa-label-color"
              onChange={(color) => handleColorChange(index, color)}
              options={colorSelectOptions}
              optionLabelProp="label"
            />
            <Input
              value={status.name}
              className="wa-label-name"
              onChange={(e) => handleNameChange(index, e.target.value)}
            />
            <button
              type="button"
              className="wa-label-delete-btn"
              onClick={() => handleDelete(index)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add new status */}
      <Divider className="my-3" />
      <div className="flex flex-col gap-2">
        <div className="wa-label-row">
          <Select
            value={newColor}
            className="wa-label-color"
            onChange={setNewColor}
            options={colorSelectOptions}
            optionLabelProp="label"
          />
          <Input
            placeholder={t('tickets.status_name_placeholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleAdd}
            className="wa-label-name wa-label-name--last"
          />
        </div>
        <Button
          type="dashed"
          icon={<Plus size={14} />}
          disabled={!newName.trim()}
          onClick={handleAdd}
        >
          {t('tickets.add_status')}
        </Button>
      </div>

      {/* Default status select */}
      {statuses.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <Text className="flex-shrink-0 text-sm">{t('tickets.default_status')} :</Text>
          <Select
            value={currentDefaultIndex >= 0 ? currentDefaultIndex : 0}
            onChange={handleDefaultChange}
            options={defaultStatusOptions}
            className="flex-1"
            optionLabelProp="label"
          />
        </div>
      )}
    </Modal>
  )
}

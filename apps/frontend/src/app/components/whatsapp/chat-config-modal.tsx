import { useEffect, useState } from 'react'
import { Button, Divider, Input, Modal, Select, Typography } from 'antd'
import { Plus, ShoppingBag, Trash2, Unlink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Catalog } from '@app/lib/api/agent-api'
import { catalogApi, labelApi } from '@app/lib/api/agent-api'
import type { LabelItem } from '@app/lib/api/agent-api'

const { Text } = Typography

const LABEL_COLORS = [
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

type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'

interface ChatConfigModalProps {
  open: boolean
  onClose: () => void
  provider: ChatProvider
  socialAccountId: string
  organisationId: string
  catalogs: Catalog[]
  /** WhatsApp-only: phone number id used for Meta Commerce (dis)association. */
  phoneNumberId?: string
  /** WhatsApp-only: Meta Commerce Manager linked catalog(s). */
  commerceData?: { data: Array<{ id: string; name: string }> }
  /** WhatsApp-only: open the Meta catalog link wizard. */
  onOpenCatalogLink?: () => void
}

/**
 * Shared catalog + labels configuration modal for every chat channel.
 *
 * - WhatsApp: catalog association goes through Meta Commerce Manager (phone
 *   number). We also surface a catalog that is only linked in our DB
 *   (CatalogSocialAccount) — e.g. SMB numbers that cannot be linked via Meta.
 * - Instagram DM / Messenger / TikTok: there is no Meta Commerce link, so the
 *   catalog is associated through our DB link (linkSocialAccounts).
 */
export function ChatConfigModal({
  open,
  onClose,
  provider,
  socialAccountId,
  organisationId,
  catalogs,
  phoneNumberId,
  commerceData,
  onOpenCatalogLink,
}: ChatConfigModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isWhatsApp = provider === 'whatsapp'

  // ─── Labels from API ───
  const labelsQuery = useQuery({
    queryKey: ['labels', socialAccountId],
    queryFn: () => labelApi.list(socialAccountId),
    enabled: open && !!socialAccountId,
  })

  const labels = labelsQuery.data || []

  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#1677ff')

  const labelsKey = ['labels', socialAccountId]
  const catalogsKey = ['catalogs', organisationId]

  const createLabelMutation = useMutation({
    mutationFn: (data: { socialAccountId: string; name: string; color?: string }) =>
      labelApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData<LabelItem[]>(labelsKey, (old) => [...(old || []), created])
      setNewLabelName('')
      setNewLabelColor('#1677ff')
    },
  })

  const updateLabelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      labelApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<LabelItem[]>(labelsKey, (old) =>
        (old || []).map((l) => (l.id === updated.id ? updated : l)),
      )
    },
  })

  const deleteLabelMutation = useMutation({
    mutationFn: (id: string) => labelApi.remove(id),
    onSuccess: (_data, deletedId) => {
      queryClient.setQueryData<LabelItem[]>(labelsKey, (old) =>
        (old || []).filter((l) => l.id !== deletedId),
      )
    },
  })

  const handleAddLabel = () => {
    if (!newLabelName.trim()) return
    createLabelMutation.mutate({
      socialAccountId,
      name: newLabelName.trim(),
      color: newLabelColor,
    })
  }

  const handleDeleteLabel = (id: string) => {
    deleteLabelMutation.mutate(id)
  }

  const handleNameChange = (label: LabelItem, name: string) => {
    updateLabelMutation.mutate({ id: label.id, data: { name } })
  }

  const handleColorChange = (label: LabelItem, color: string) => {
    updateLabelMutation.mutate({ id: label.id, data: { color } })
  }

  const [catalogToLink, setCatalogToLink] = useState<string | undefined>(undefined)

  // Reset transient state when modal closes
  useEffect(() => {
    if (!open) {
      setNewLabelName('')
      setNewLabelColor('#1677ff')
      setCatalogToLink(undefined)
    }
  }, [open])

  // ─── Catalog association ───
  const linkedMeta = commerceData?.data?.[0]
  // Catalog linked in our DB (CatalogSocialAccount) — the source of truth for
  // SMB WhatsApp numbers and for non-WhatsApp channels.
  const dbLinkedCatalog = catalogs.find((c) =>
    c.socialAccounts?.some((sa) => sa.socialAccount.id === socialAccountId),
  )
  const localCatalog =
    (linkedMeta ? catalogs.find((c) => c.providerId === linkedMeta.id) : undefined) ??
    dbLinkedCatalog

  // What to display in the catalog row: prefer the Meta link, fall back to the
  // DB link so a catalog linked only in our DB still shows up.
  const displayCatalog = linkedMeta
    ? { name: linkedMeta.name, subtitle: linkedMeta.id }
    : localCatalog
      ? { name: localCatalog.name, subtitle: localCatalog.providerId ?? '' }
      : undefined

  // WhatsApp dissociation (Meta + DB link via phone number)
  const dissociateMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.dissociatePhone(catalogId, phoneNumberId || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commerce', phoneNumberId] })
      queryClient.invalidateQueries({ queryKey: catalogsKey })
    },
  })

  const handleDissociate = () => {
    if (!localCatalog) return
    Modal.confirm({
      title: t('whatsapp_config.dissociate'),
      content: t('whatsapp_config.dissociate_confirm'),
      okButtonProps: { danger: true },
      onOk: () => dissociateMutation.mutateAsync(localCatalog.id),
    })
  }

  // Non-WhatsApp DB-link (dis)association
  const linkDbMutation = useMutation({
    mutationFn: async (vars: { catalogId: string; attach: boolean }) => {
      const cat = catalogs.find((c) => c.id === vars.catalogId)
      const currentIds = (cat?.socialAccounts || []).map((sa) => sa.socialAccount.id)
      const next = vars.attach
        ? Array.from(new Set([...currentIds, socialAccountId]))
        : currentIds.filter((id) => id !== socialAccountId)
      return catalogApi.linkSocialAccounts(vars.catalogId, next)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: catalogsKey })
      setCatalogToLink(undefined)
    },
  })

  const colorSelectOptions = LABEL_COLORS.map((c) => ({
    value: c.value,
    label: (
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c.value }} />
        {c.label}
      </div>
    ),
  }))

  const renderCatalogSection = () => {
    // WhatsApp → Meta Commerce flow (with DB-link fallback display)
    if (isWhatsApp) {
      return displayCatalog ? (
        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3">
            <ShoppingBag size={18} className="text-text-muted" />
            <div className="flex flex-col">
              <Text strong>{displayCatalog.name}</Text>
              {displayCatalog.subtitle && (
                <Text className="text-text-muted">{displayCatalog.subtitle}</Text>
              )}
            </div>
          </div>
          {localCatalog && (
            <Button
              danger
              size="small"
              icon={<Unlink size={14} />}
              loading={dissociateMutation.isPending}
              onClick={handleDissociate}
            >
              {t('whatsapp_config.dissociate')}
            </Button>
          )}
        </div>
      ) : (
        <div className="create-ticket-empty-section">
          <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
          <div className="text-sm font-medium text-text-primary">
            {t('whatsapp_config.no_catalog')}
          </div>
          <div className="text-xs text-text-muted">{t('whatsapp_config.no_catalog_desc')}</div>
          <Button onClick={onOpenCatalogLink} className="mt-2">
            {t('whatsapp_config.connect_catalog')}
          </Button>
        </div>
      )
    }

    // Instagram DM / Messenger / TikTok → DB-link association
    if (dbLinkedCatalog) {
      return (
        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3">
            <ShoppingBag size={18} className="text-text-muted" />
            <Text strong>{dbLinkedCatalog.name}</Text>
          </div>
          <Button
            danger
            size="small"
            icon={<Unlink size={14} />}
            loading={linkDbMutation.isPending}
            onClick={() => linkDbMutation.mutate({ catalogId: dbLinkedCatalog.id, attach: false })}
          >
            {t('whatsapp_config.dissociate')}
          </Button>
        </div>
      )
    }

    return catalogs.length > 0 ? (
      <div className="flex flex-col gap-2">
        <Select
          className="w-full"
          placeholder={t('chat_config.select_catalog')}
          value={catalogToLink}
          onChange={setCatalogToLink}
          options={catalogs.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Button
          type="primary"
          disabled={!catalogToLink}
          loading={linkDbMutation.isPending}
          onClick={() =>
            catalogToLink && linkDbMutation.mutate({ catalogId: catalogToLink, attach: true })
          }
        >
          {t('chat_config.associate')}
        </Button>
      </div>
    ) : (
      <div className="create-ticket-empty-section">
        <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
        <div className="text-sm font-medium text-text-primary">
          {t('whatsapp_config.no_catalog')}
        </div>
        <div className="text-xs text-text-muted">{t('chat_config.no_catalog_org')}</div>
      </div>
    )
  }

  return (
    <Modal open={open} onCancel={onClose} title={t('chat_config.title')} footer={null} width={520}>
      {/* ── Section 1: Catalog ── */}
      <div className="mb-4">
        <Text strong>{t('whatsapp_config.catalog_section')}</Text>
        <div className="mt-2">{renderCatalogSection()}</div>
      </div>

      <Divider className="my-3" />

      {/* ── Section 2: Labels ── */}
      <div className="mb-2">
        <Text strong>{t('whatsapp_config.labels')}</Text>

        {/* Existing labels */}
        <div className="mt-3 flex flex-col gap-2">
          {labels.map((label) => (
            <div key={label.id} className="wa-label-row">
              <Select
                value={label.color}
                className="wa-label-color"
                onChange={(color) => handleColorChange(label, color)}
                options={colorSelectOptions}
                optionLabelProp="label"
              />
              <Input
                defaultValue={label.name}
                className="wa-label-name"
                onBlur={(e) => {
                  const val = e.target.value.trim()
                  if (val && val !== label.name) handleNameChange(label, val)
                }}
                onPressEnter={(e) => {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val && val !== label.name) handleNameChange(label, val)
                }}
              />
              <button
                type="button"
                className="wa-label-delete-btn"
                onClick={() => handleDeleteLabel(label.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add new label */}
        <Divider className="my-3" />
        <div className="flex flex-col gap-2">
          <div className="wa-label-row">
            <Select
              value={newLabelColor}
              className="wa-label-color"
              onChange={setNewLabelColor}
              options={colorSelectOptions}
              optionLabelProp="label"
            />
            <Input
              placeholder={t('whatsapp_config.label_placeholder')}
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onPressEnter={handleAddLabel}
              className="wa-label-name wa-label-name--last"
            />
          </div>
          <Button
            type="dashed"
            icon={<Plus size={14} />}
            loading={createLabelMutation.isPending}
            disabled={!newLabelName.trim()}
            onClick={handleAddLabel}
          >
            {t('whatsapp_config.add_label')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

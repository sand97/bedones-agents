import { useState, useEffect, useMemo } from 'react'
import { Modal, Select, Button, Tag, Alert, Input } from 'antd'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CountryPhoneInput } from '@app/components/shared/country-phone-input'
import type { Agent, LabelItem } from '@app/lib/api/agent-api'

type ActivationMode = 'CONTACTS' | 'LABELS' | 'EXCLUDE_LABELS'

interface AgentActivateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    mode: ActivationMode
    labelIds?: string[]
    contacts?: Record<string, string[]>
  }) => void
  agent: Agent
  labels: LabelItem[]
  loading?: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
}

export function AgentActivateModal({
  open,
  onClose,
  onSubmit,
  agent,
  labels,
  loading,
}: AgentActivateModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ActivationMode | null>(null)
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [contacts, setContacts] = useState<Record<string, string[]>>({})

  const modeOptions = [
    { value: 'CONTACTS', label: t('agent.activate_mode_contacts') },
    { value: 'LABELS', label: t('agent.activate_mode_labels') },
    { value: 'EXCLUDE_LABELS', label: t('agent.activate_mode_exclude_labels') },
  ]

  // Group social accounts by provider type
  const providerGroups = useMemo(() => {
    const groups: Record<string, typeof agent.socialAccounts> = {}
    for (const sa of agent.socialAccounts) {
      const provider = sa.socialAccount.provider
      if (!groups[provider]) groups[provider] = []
      groups[provider].push(sa)
    }
    return groups
  }, [agent.socialAccounts])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode(null)
      setSelectedLabels([])
      setContacts({})
    }
  }, [open])

  const handleAddContact = (socialAccountId: string) => {
    setContacts((prev) => ({
      ...prev,
      [socialAccountId]: [...(prev[socialAccountId] || []), ''],
    }))
  }

  const handleUpdateContact = (socialAccountId: string, index: number, value: string) => {
    setContacts((prev) => ({
      ...prev,
      [socialAccountId]: (prev[socialAccountId] || []).map((c, i) => (i === index ? value : c)),
    }))
  }

  const handleRemoveContact = (socialAccountId: string, index: number) => {
    setContacts((prev) => ({
      ...prev,
      [socialAccountId]: (prev[socialAccountId] || []).filter((_, i) => i !== index),
    }))
  }

  const canSubmit = () => {
    if (!mode) return false
    if (mode === 'CONTACTS') {
      const hasAnyContact = Object.values(contacts).some((arr) =>
        arr.some((c) => c.trim().length > 0),
      )
      return hasAnyContact
    }
    if (mode === 'LABELS' || mode === 'EXCLUDE_LABELS') {
      return selectedLabels.length > 0
    }
    return false
  }

  const handleSubmit = () => {
    if (!mode) return
    onSubmit({
      mode,
      labelIds: mode === 'LABELS' || mode === 'EXCLUDE_LABELS' ? selectedLabels : undefined,
      contacts: mode === 'CONTACTS' ? contacts : undefined,
    })
  }

  const getProviderLabel = (provider: string) => PROVIDER_LABELS[provider] || provider

  const labelOptions = labels.map((l) => ({
    value: l.id,
    label: l.name,
  }))

  return (
    <Modal
      title={t('agent.activate_modal_title')}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={handleSubmit}
          disabled={!canSubmit()}
          loading={loading}
        >
          {t('agent.activate_modal_submit')}
        </Button>,
      ]}
      width={520}
    >
      <div className="flex flex-col gap-4 py-2">
        {/* Mode selection */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('agent.activate_how_question')}
          </span>
          <Select
            placeholder={t('agent.activate_mode_placeholder')}
            options={modeOptions}
            value={mode}
            onChange={(v) => {
              setMode(v)
              setSelectedLabels([])
              setContacts({})
            }}
          />
        </div>

        {/* CONTACTS mode: per-provider contact inputs */}
        {mode === 'CONTACTS' && (
          <div className="flex flex-col gap-4">
            {Object.entries(providerGroups).map(([provider, accounts]) => (
              <div key={provider} className="flex flex-col gap-2">
                {accounts.map((sa) => (
                  <div key={sa.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {sa.socialAccount.pageName ||
                            sa.socialAccount.username ||
                            getProviderLabel(provider)}
                        </span>
                        <Tag>{getProviderLabel(provider)}</Tag>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<Plus size={14} />}
                        onClick={() => handleAddContact(sa.socialAccount.id)}
                      >
                        {provider === 'WHATSAPP'
                          ? t('agent.add_phone_number')
                          : t('agent.add_contact')}
                      </Button>
                    </div>

                    {(contacts[sa.socialAccount.id] || []).map((contact, idx) => (
                      <div key={idx}>
                        {provider === 'WHATSAPP' ? (
                          <CountryPhoneInput
                            value={contact}
                            onChange={(v) => handleUpdateContact(sa.socialAccount.id, idx, v)}
                            addonAfter={
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<X size={14} />}
                                onClick={() => handleRemoveContact(sa.socialAccount.id, idx)}
                              />
                            }
                          />
                        ) : (
                          <Input
                            placeholder={t('agent.profile_name_placeholder')}
                            value={contact}
                            onChange={(e) =>
                              handleUpdateContact(sa.socialAccount.id, idx, e.target.value)
                            }
                            addonAfter={
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<X size={14} />}
                                onClick={() => handleRemoveContact(sa.socialAccount.id, idx)}
                              />
                            }
                          />
                        )}
                      </div>
                    ))}

                    {(contacts[sa.socialAccount.id] || []).length === 0 && (
                      <span className="text-xs text-text-muted">{t('agent.no_contacts_hint')}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* LABELS mode */}
        {mode === 'LABELS' && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-primary">
              {t('agent.labels_trigger_title')}
            </span>
            <span className="text-xs text-text-muted">{t('agent.labels_trigger_desc')}</span>
            <Select
              mode="multiple"
              placeholder={t('agent.select_labels_placeholder')}
              options={labelOptions}
              value={selectedLabels}
              onChange={setSelectedLabels}
            />
            {labels.length === 0 && (
              <Alert type="info" showIcon message={t('agent.no_labels_found')} />
            )}
          </div>
        )}

        {/* EXCLUDE_LABELS mode */}
        {mode === 'EXCLUDE_LABELS' && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-primary">
              {t('agent.exclude_labels_title')}
            </span>
            <span className="text-xs text-text-muted">{t('agent.exclude_labels_desc')}</span>
            <Select
              mode="multiple"
              placeholder={t('agent.select_exclude_labels_placeholder')}
              options={labelOptions}
              value={selectedLabels}
              onChange={setSelectedLabels}
            />
            {labels.length === 0 && (
              <Alert type="info" showIcon message={t('agent.no_labels_found')} />
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

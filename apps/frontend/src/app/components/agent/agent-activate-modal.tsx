import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Modal, Button, Tag, Input, Checkbox } from 'antd'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CountryPhoneInput } from '@app/components/shared/country-phone-input'
import type { Agent } from '@app/lib/api/agent-api'

interface AgentActivateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    activateAll?: boolean
    activateAds?: boolean
    activateNewConversations?: boolean
    contacts?: Record<string, string[]>
  }) => void
  agent: Agent
  loading?: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
}

function OptionRow({
  checked,
  onChange,
  title,
  subtitle,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  subtitle: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <span className="text-xs text-text-muted">{subtitle}</span>
        </div>
      </Checkbox>
      {/* Children align with the checkbox column (full card width) rather than
          indenting under the label, to gain horizontal space. */}
      {checked && children ? <div className="pt-1">{children}</div> : null}
    </div>
  )
}

export function AgentActivateModal({
  open,
  onClose,
  onSubmit,
  agent,
  loading,
}: AgentActivateModalProps) {
  const { t } = useTranslation()
  const [activateAll, setActivateAll] = useState(false)
  const [activateAds, setActivateAds] = useState(false)
  const [activateNew, setActivateNew] = useState(false)
  const [contactsEnabled, setContactsEnabled] = useState(false)
  const [contacts, setContacts] = useState<Record<string, string[]>>({})

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
      setActivateAll(false)
      setActivateAds(false)
      setActivateNew(false)
      setContactsEnabled(false)
      setContacts({})
    }
  }, [open])

  // "All conversations" is exclusive — selecting it clears the more specific scopes.
  const handleToggleAll = (checked: boolean) => {
    setActivateAll(checked)
    if (checked) {
      setActivateAds(false)
      setActivateNew(false)
      setContactsEnabled(false)
    }
  }

  const handleToggleAds = (checked: boolean) => {
    setActivateAds(checked)
    if (checked) setActivateAll(false)
  }

  const handleToggleNew = (checked: boolean) => {
    setActivateNew(checked)
    if (checked) setActivateAll(false)
  }

  const handleToggleContacts = (checked: boolean) => {
    setContactsEnabled(checked)
    if (checked) setActivateAll(false)
  }

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

  const hasAnyContact = Object.values(contacts).some((arr) => arr.some((c) => c.trim().length > 0))

  const canSubmit = () => {
    if (activateAll) return true
    if (activateAds || activateNew) return true
    if (contactsEnabled && hasAnyContact) return true
    return false
  }

  const handleSubmit = () => {
    onSubmit({
      activateAll,
      activateAds: activateAll ? false : activateAds,
      activateNewConversations: activateAll ? false : activateNew,
      contacts: !activateAll && contactsEnabled ? contacts : undefined,
    })
  }

  const getProviderLabel = (provider: string) => PROVIDER_LABELS[provider] || provider

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
      <div className="flex flex-col gap-3 py-2">
        <span className="text-sm text-text-secondary">{t('agent.activate_how_question')}</span>

        <OptionRow
          checked={activateAll}
          onChange={handleToggleAll}
          title={t('agent.activate_opt_all_title')}
          subtitle={t('agent.activate_opt_all_desc')}
        />

        <OptionRow
          checked={activateAds}
          onChange={handleToggleAds}
          title={t('agent.activate_opt_ads_title')}
          subtitle={t('agent.activate_opt_ads_desc')}
        />

        <OptionRow
          checked={activateNew}
          onChange={handleToggleNew}
          title={t('agent.activate_opt_new_title')}
          subtitle={t('agent.activate_opt_new_desc')}
        />

        <OptionRow
          checked={contactsEnabled}
          onChange={handleToggleContacts}
          title={t('agent.activate_opt_contacts_title')}
          subtitle={t('agent.activate_opt_contacts_desc')}
        >
          <div className="flex flex-col gap-4">
            {Object.entries(providerGroups).map(([provider, accounts]) => (
              <div key={provider} className="flex flex-col gap-2">
                {accounts.map((sa) => (
                  <div key={sa.id} className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      {/* Tag sits BELOW the page name so a long name keeps its
                          own line instead of wrapping awkwardly. */}
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <span className="text-sm font-medium text-text-primary">
                          {sa.socialAccount.pageName ||
                            sa.socialAccount.username ||
                            getProviderLabel(provider)}
                        </span>
                        <Tag className="m-0">{getProviderLabel(provider)}</Tag>
                      </div>
                      <Button
                        size="small"
                        icon={<Plus size={14} />}
                        onClick={() => handleAddContact(sa.socialAccount.id)}
                        className="flex-shrink-0"
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
                            dialCodeOnly
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
        </OptionRow>
      </div>
    </Modal>
  )
}

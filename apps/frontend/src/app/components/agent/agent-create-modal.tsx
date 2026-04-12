import { useState, useEffect, useMemo } from 'react'
import { Modal, Avatar, Checkbox, Alert, Tag, Tooltip, Input } from 'antd'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SocialBadge } from '@app/components/shared/social-badge'
import type { SocialNetwork } from '@app/components/whatsapp/mock-data'
import type { SocialAccount, Agent } from '@app/lib/api/agent-api'

interface AgentCreateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, socialAccountIds: string[]) => void
  socialAccounts: SocialAccount[]
  existingAgents: Agent[]
  catalogs: Array<{ socialAccounts: Array<{ socialAccount: { id: string } }> }>
  loading?: boolean
  orgSlug: string
}

const SUPPORTED_PROVIDERS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK']

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
}

export function AgentCreateModal({
  open,
  onClose,
  onSubmit,
  socialAccounts,
  existingAgents,
  catalogs,
  loading,
  orgSlug,
}: AgentCreateModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setSelected([])
      setName('')
    }
  }, [open])

  // Show all messaging-capable accounts (WhatsApp, Instagram DM, Messenger)
  const availableAccounts = socialAccounts.filter((a) => SUPPORTED_PROVIDERS.includes(a.provider))

  // Build a map of socialAccountId -> agentId
  const accountToAgent = useMemo(() => {
    const map = new Map<string, Agent>()
    for (const agent of existingAgents) {
      for (const sa of agent.socialAccounts) {
        map.set(sa.socialAccount.id, agent)
      }
    }
    return map
  }, [existingAgents])

  // Build a set of WhatsApp social accounts linked to at least one catalog
  const whatsappAccountsWithCatalog = useMemo(() => {
    const set = new Set<string>()
    for (const catalog of catalogs) {
      for (const link of catalog.socialAccounts) {
        set.add(link.socialAccount.id)
      }
    }
    return set
  }, [catalogs])

  // Catalog warning only for WhatsApp accounts without catalog
  const hasNoCatalogWarning = selected.some((id) => {
    const account = socialAccounts.find((a) => a.id === id)
    return account?.provider === 'WHATSAPP' && !whatsappAccountsWithCatalog.has(id)
  })

  const handleToggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  return (
    <Modal
      title={t('agent.create_modal_title')}
      open={open}
      onCancel={onClose}
      onOk={() => onSubmit(name.trim(), selected)}
      okText={t('agent.create_modal_ok')}
      cancelText={t('agent.create_modal_cancel')}
      okButtonProps={{ disabled: selected.length === 0, loading }}
    >
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t('agent.name_label')}
        </label>
        <Input
          placeholder={t('agent.name_placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Alert type="info" showIcon className="mt-2!" message={t('agent.name_info')} />
      </div>

      <label className="mb-1.5 block text-sm font-medium text-text-primary">
        {t('agent.accounts_label')}
      </label>

      <div className="flex flex-col gap-2">
        {availableAccounts.map((account) => {
          const linkedAgent = accountToAgent.get(account.id)
          const isDisabled = !!linkedAgent
          const network = (
            account.provider === 'FACEBOOK' ? 'messenger' : account.provider.toLowerCase()
          ) as SocialNetwork
          const isWhatsappWithoutCatalog =
            account.provider === 'WHATSAPP' && !whatsappAccountsWithCatalog.has(account.id)

          return (
            <div
              key={account.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                isDisabled
                  ? 'cursor-not-allowed border-border-subtle bg-bg-subtle opacity-60'
                  : selected.includes(account.id)
                    ? 'border-text-primary bg-bg-surface'
                    : 'cursor-pointer border-border-default bg-bg-surface hover:bg-bg-subtle'
              }`}
              onClick={() => !isDisabled && handleToggle(account.id)}
            >
              <Checkbox
                checked={selected.includes(account.id)}
                disabled={isDisabled}
                style={{ pointerEvents: 'none' }}
              />
              <div className="relative flex-shrink-0">
                <Avatar src={account.profilePictureUrl} size={36}>
                  {(account.pageName || account.username || '?')[0]}
                </Avatar>
                <span className="absolute -right-1 -bottom-1">
                  <SocialBadge network={network} size={18} bg="white" />
                </span>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text-primary">
                  {account.pageName || account.username || account.providerAccountId}
                </span>
                <span className="text-xs text-text-muted">
                  {PROVIDER_LABELS[account.provider] || account.provider}
                  {account.provider === 'WHATSAPP' && account.username && (
                    <span> • {account.username}</span>
                  )}
                  {account.provider !== 'WHATSAPP' && account.username && account.pageName && (
                    <span> • @{account.username}</span>
                  )}
                </span>
              </div>
              {isDisabled && linkedAgent && (
                <Tooltip
                  title={t('agent.linked_to_agent', { name: linkedAgent.name || linkedAgent.id })}
                >
                  <Link
                    to="/app/$orgSlug/agents"
                    params={{ orgSlug }}
                    className="text-xs text-text-muted underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('agent.already_linked')}
                  </Link>
                </Tooltip>
              )}
              {!isDisabled && isWhatsappWithoutCatalog && (
                <Tag
                  icon={<AlertTriangle size={12} />}
                  style={{
                    color: 'var(--color-text-primary)',
                    background: 'var(--color-bg-surface)',
                    borderColor: 'var(--color-border-default)',
                  }}
                >
                  {t('agent.no_catalog')}
                </Tag>
              )}
            </div>
          )
        })}
      </div>

      {hasNoCatalogWarning && selected.length > 0 && (
        <Alert type="warning" showIcon className="mt-3" message={t('agent.no_catalog_warning')} />
      )}

      {availableAccounts.length === 0 && (
        <Alert type="info" showIcon message={t('agent.no_social_accounts')} />
      )}
    </Modal>
  )
}

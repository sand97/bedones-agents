import { useState, useEffect } from 'react'
import { Modal, Checkbox, Alert, Tag, Tooltip } from 'antd'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SocialAccount, Agent } from '@app/lib/api/agent-api'

interface AgentCreateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (socialAccountIds: string[]) => void
  socialAccounts: SocialAccount[]
  existingAgents: Agent[]
  catalogs: Array<{ socialAccounts: Array<{ socialAccount: { id: string } }> }>
  loading?: boolean
  orgSlug: string
}

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
}

const PROVIDER_COLORS: Record<string, string> = {
  WHATSAPP: 'var(--color-brand-whatsapp)',
  FACEBOOK: 'var(--color-brand-facebook)',
  INSTAGRAM: 'var(--color-brand-instagram)',
  TIKTOK: 'var(--color-brand-tiktok)',
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
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) setSelected([])
  }, [open])

  // Filter to only show WhatsApp accounts
  const whatsappAccounts = socialAccounts.filter((a) => a.provider === 'WHATSAPP')

  // Build a map of socialAccountId -> agentId
  const accountToAgent = new Map<string, Agent>()
  for (const agent of existingAgents) {
    for (const sa of agent.socialAccounts) {
      accountToAgent.set(sa.socialAccount.id, agent)
    }
  }

  // Build a set of social accounts linked to at least one catalog
  const accountsWithCatalog = new Set<string>()
  for (const catalog of catalogs) {
    for (const link of catalog.socialAccounts) {
      accountsWithCatalog.add(link.socialAccount.id)
    }
  }

  const hasNoCatalogWarning = selected.some((id) => !accountsWithCatalog.has(id))

  const handleToggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  return (
    <Modal
      title={t('agent.create_modal_title')}
      open={open}
      onCancel={onClose}
      onOk={() => onSubmit(selected)}
      okText={t('agent.create_modal_ok')}
      cancelText={t('agent.create_modal_cancel')}
      okButtonProps={{ disabled: selected.length === 0, loading }}
    >
      <p className="mb-3 text-sm text-text-muted">
        {t('agent.create_modal_desc')}
      </p>

      <div className="flex flex-col gap-2">
        {whatsappAccounts.map((account) => {
          const linkedAgent = accountToAgent.get(account.id)
          const isDisabled = !!linkedAgent

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
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: PROVIDER_COLORS[account.provider] || '#999' }}
              />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text-primary">
                  {account.pageName || account.username || account.providerAccountId}
                </span>
                <span className="text-xs text-text-muted">
                  {PROVIDER_LABELS[account.provider] || account.provider}
                </span>
              </div>
              {isDisabled && linkedAgent && (
                <Tooltip title={t('agent.linked_to_agent', { name: linkedAgent.name || linkedAgent.id })}>
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
              {!isDisabled && !accountsWithCatalog.has(account.id) && (
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
        <Alert
          type="warning"
          showIcon
          className="mt-3"
          message={t('agent.no_catalog_warning')}
        />
      )}

      {whatsappAccounts.length === 0 && (
        <Alert
          type="info"
          showIcon
          message={t('agent.no_social_accounts')}
        />
      )}
    </Modal>
  )
}

import { useState, useEffect } from 'react'
import { Modal, Checkbox } from 'antd'
import type { SocialAccount } from '@app/lib/api/agent-api'

interface CatalogConfigModalProps {
  open: boolean
  onClose: () => void
  onSave: (socialAccountIds: string[]) => void
  socialAccounts: SocialAccount[]
  linkedAccountIds: string[]
  loading?: boolean
}

const PROVIDER_COLORS: Record<string, string> = {
  WHATSAPP: 'var(--color-brand-whatsapp)',
  FACEBOOK: 'var(--color-brand-facebook)',
  INSTAGRAM: 'var(--color-brand-instagram)',
  TIKTOK: 'var(--color-brand-tiktok)',
}

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
}

export function CatalogConfigModal({
  open,
  onClose,
  onSave,
  socialAccounts,
  linkedAccountIds,
  loading,
}: CatalogConfigModalProps) {
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) setSelected([...linkedAccountIds])
  }, [open, linkedAccountIds])

  const handleToggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  return (
    <Modal
      title="Configuration du catalogue"
      open={open}
      onCancel={onClose}
      onOk={() => onSave(selected)}
      okText="Enregistrer"
      cancelText="Annuler"
      okButtonProps={{ loading }}
    >
      <p className="mb-3 text-sm text-text-muted">
        Associez ce catalogue à vos réseaux sociaux pour que les agents puissent l'utiliser.
      </p>

      <div className="flex flex-col gap-2">
        {socialAccounts.map((account) => (
          <div
            key={account.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
              selected.includes(account.id)
                ? 'border-text-primary bg-bg-surface'
                : 'border-border-default bg-bg-surface hover:bg-bg-subtle'
            }`}
            onClick={() => handleToggle(account.id)}
          >
            <Checkbox checked={selected.includes(account.id)} style={{ pointerEvents: 'none' }} />
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: PROVIDER_COLORS[account.provider] || '#999' }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">
                {account.pageName || account.username || account.providerAccountId}
              </span>
              <span className="text-xs text-text-muted">
                {PROVIDER_LABELS[account.provider] || account.provider}
              </span>
            </div>
          </div>
        ))}
      </div>

      {socialAccounts.length === 0 && (
        <div className="py-4 text-center text-sm text-text-muted">
          Aucun réseau social connecté.
        </div>
      )}
    </Modal>
  )
}

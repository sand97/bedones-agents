import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button, Card, Modal, Typography } from 'antd'
import { Sparkles, Link2, Wand2, Unlink, BadgePercent } from 'lucide-react'
import { ConfirmDisconnectModal } from '@app/components/shared/confirm-disconnect-modal'

const { Text } = Typography

interface ToolAction {
  key: string
  icon: ReactNode
  title: string
  subtitle: string
  actionLabel: string
  onClick: () => void
}

interface CatalogToolsModalProps {
  open: boolean
  onClose: () => void
  onOpenContextFlow: () => void
  onOpenLinkPostsFlow: () => void
  onOpenStudio: () => void
  /** Navigate to the promotion creation wizard, preset to this catalog. */
  onCreatePromotion: () => void
  /** Catalog name — typed back by the user to confirm the disconnect. */
  catalogName: string
  /** Performs the actual catalog deletion. */
  onDisconnect: () => Promise<void> | void
}

export function CatalogToolsModal({
  open,
  onClose,
  onOpenContextFlow,
  onOpenLinkPostsFlow,
  onOpenStudio,
  onCreatePromotion,
  catalogName,
  onDisconnect,
}: CatalogToolsModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Each action closes the tools modal first, then runs its flow.
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const actions: ToolAction[] = [
    {
      key: 'create-promotion',
      icon: <BadgePercent size={20} strokeWidth={1.75} />,
      title: 'Créer une promotion pour ce catalogue',
      subtitle:
        'Lancez une réduction, un crédit ou des produits offerts sur les produits de ce catalogue.',
      actionLabel: 'Créer une promotion',
      onClick: run(onCreatePromotion),
    },
    {
      key: 'design-studio',
      icon: <Wand2 size={20} strokeWidth={1.75} />,
      title: 'Personnaliser les images de vos produits',
      subtitle:
        'Créez des habillages (prix, promo, logo) et exportez vos visuels aux formats réseaux sociaux dans le Studio images.',
      actionLabel: 'Ouvrir le Studio',
      onClick: run(onOpenStudio),
    },
    {
      key: 'context',
      icon: <Sparkles size={20} strokeWidth={1.75} />,
      title: 'Ajouter du contexte à vos produits',
      subtitle:
        'Ajouter des informations de livraison, garanties, etc. sur des produits ou des collections.',
      actionLabel: 'Ajouter du contexte',
      onClick: run(onOpenContextFlow),
    },
    {
      key: 'link-posts',
      icon: <Link2 size={20} strokeWidth={1.75} />,
      title: 'Lier vos produits à des posts',
      subtitle: "Associez des posts Facebook ou Instagram aux produits qu'ils mettent en avant.",
      actionLabel: 'Lier des posts',
      onClick: run(onOpenLinkPostsFlow),
    },
  ]

  return (
    <>
      <Modal open={open} onCancel={onClose} title="Outils du catalogue" footer={null} width={560}>
        <div className="flex flex-col gap-3 pt-1">
          {actions.map((a) => (
            <Card key={a.key} size="small">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 text-text-muted" aria-hidden="true">
                  {a.icon}
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-text-primary">{a.title}</span>
                  <span className="mt-0.5 text-xs text-text-muted">{a.subtitle}</span>
                  <div className="mt-3">
                    <Button onClick={a.onClick}>{a.actionLabel}</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Danger zone — disconnect (delete) the catalog */}
          <Card size="small" className="danger-card">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex-shrink-0 text-[color:var(--color-danger)]"
                aria-hidden="true"
              >
                <Unlink size={20} strokeWidth={1.75} />
              </span>
              <div className="flex flex-1 flex-col">
                <Text type="danger" strong className="text-sm">
                  Déconnecter le catalogue
                </Text>
                <span className="mt-0.5 text-xs text-text-muted">
                  Le catalogue, ses produits et ses associations seront définitivement supprimés de
                  Bedones.
                </span>
                <div className="mt-3">
                  <Button danger onClick={() => setConfirmOpen(true)}>
                    Déconnecter
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Modal>

      <ConfirmDisconnectModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await onDisconnect()
          onClose()
        }}
        resourceLabel={catalogName}
        title="Déconnecter le catalogue"
        description={
          <>
            Le catalogue <strong>{catalogName}</strong>, tous ses produits et ses associations
            seront définitivement supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  )
}

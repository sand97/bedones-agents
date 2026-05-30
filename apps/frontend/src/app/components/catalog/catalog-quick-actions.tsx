import type { ReactNode } from 'react'
import { Sparkles, Link2 } from 'lucide-react'

interface QuickAction {
  key: string
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
}

interface CatalogQuickActionsProps {
  onOpenContextFlow: () => void
  onOpenLinkPostsFlow: () => void
}

export function CatalogQuickActions({
  onOpenContextFlow,
  onOpenLinkPostsFlow,
}: CatalogQuickActionsProps) {
  const actions: QuickAction[] = [
    {
      key: 'context',
      icon: <Sparkles size={20} strokeWidth={1.75} />,
      title: 'Ajouter du contexte à vos produits',
      subtitle:
        'Ajouter des informations de livraison, garanties, etc. sur des produits ou des collections.',
      onClick: onOpenContextFlow,
    },
    {
      key: 'link-posts',
      icon: <Link2 size={20} strokeWidth={1.75} />,
      title: 'Lier vos produits à des posts',
      subtitle: "Associez des posts Facebook ou Instagram aux produits qu'ils mettent en avant.",
      onClick: onOpenLinkPostsFlow,
    },
  ]

  return (
    <div className="catalog-quick-actions">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          className="catalog-quick-actions__card"
          onClick={a.onClick}
        >
          <span className="catalog-quick-actions__icon" aria-hidden="true">
            {a.icon}
          </span>
          <span className="catalog-quick-actions__body">
            <span className="catalog-quick-actions__title">{a.title}</span>
            <span className="catalog-quick-actions__subtitle">{a.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

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
    <div className="flex flex-row gap-[12px] overflow-x-auto overflow-y-hidden pb-[4px] mb-[16px] [scroll-snap-type:x_proximity] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          className="flex-[0_0_280px] min-w-[280px] flex flex-row items-start gap-[12px] px-[16px] py-[14px] rounded-card border border-border-default bg-bg-surface text-left cursor-pointer transition duration-150 [scroll-snap-align:start] hover:border-border-strong hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
          onClick={a.onClick}
        >
          <span className="inline-flex items-center justify-center w-[36px] h-[36px] rounded-[8px] bg-bg-subtle text-text-primary flex-shrink-0" aria-hidden="true">
            {a.icon}
          </span>
          <span className="flex flex-col gap-[4px] min-w-0">
            <span className="text-[14px] font-semibold text-text-primary leading-[1.3]">{a.title}</span>
            <span className="text-[12px] text-text-muted leading-[1.4] [-webkit-line-clamp:2] [display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden">{a.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

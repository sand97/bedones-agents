import { createFileRoute } from '@tanstack/react-router'
import { buildShareMeta } from '@app/lib/share-meta'
import { DashboardHeader } from '@app/components/layout/dashboard-header'

export const Route = createFileRoute('/app/$orgSlug/website')({
  head: () =>
    buildShareMeta({
      title: 'Voir le site web',
      description: 'Cliquez pour découvrir le site web de ce compte',
      image: '/og/website.png',
    }),
  component: WebsitePage,
})

function WebsitePage() {
  return (
    <div>
      <DashboardHeader title="Site Web" />
      <div className="flex items-center justify-center p-12 text-text-muted">
        Configurez votre site web marchand
      </div>
    </div>
  )
}

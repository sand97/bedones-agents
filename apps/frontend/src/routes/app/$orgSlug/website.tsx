import { createFileRoute } from '@tanstack/react-router'
import { DashboardHeader } from '@app/components/layout/dashboard-header'

export const Route = createFileRoute('/app/$orgSlug/website')({
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

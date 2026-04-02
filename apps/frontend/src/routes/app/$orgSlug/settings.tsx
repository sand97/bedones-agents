import { createFileRoute } from '@tanstack/react-router'
import { DashboardHeader } from '@app/components/layout/dashboard-header'

export const Route = createFileRoute('/app/$orgSlug/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div>
      <DashboardHeader title="Parametres" />
      <div className="flex items-center justify-center p-12 text-text-muted">
        Parametres de l&apos;organisation
      </div>
    </div>
  )
}

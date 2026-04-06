import { createFileRoute, redirect } from '@tanstack/react-router'
import { getStoredLocale } from '@app/i18n'

export const Route = createFileRoute('/legal/conditions')({
  beforeLoad: () => {
    const locale = typeof window !== 'undefined' ? getStoredLocale() : 'fr'
    throw redirect({ to: `/legal/${locale}/conditions` })
  },
})

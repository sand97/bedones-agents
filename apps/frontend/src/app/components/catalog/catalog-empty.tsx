import { useTranslation } from 'react-i18next'
import { SocialSetup } from '@app/components/social/social-setup'
import { ShoppingBag, Smartphone } from 'lucide-react'

interface CatalogEmptyProps {
  onConnect: () => void
  /** Opens the Commerce Manager migration wizard (import a WhatsApp catalogue). */
  onMigrate?: () => void
  loading?: boolean
}

export function CatalogEmpty({ onConnect, onMigrate, loading }: CatalogEmptyProps) {
  const { t } = useTranslation()

  return (
    <SocialSetup
      icon={<ShoppingBag size={36} strokeWidth={1.5} />}
      color="#111b21"
      title={t('catalog.connect_title')}
      description={t('catalog.connect_desc')}
      buttonLabel={t('catalog.connect_button')}
      onAction={onConnect}
      loading={loading}
      secondaryButtonLabel={onMigrate ? t('catalog_migration.empty_cta') : undefined}
      secondaryButtonIcon={onMigrate ? <Smartphone size={18} /> : undefined}
      onSecondaryAction={onMigrate}
      actionsLayout="stack"
    />
  )
}

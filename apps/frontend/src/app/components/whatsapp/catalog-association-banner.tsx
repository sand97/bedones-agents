import { useState } from 'react'
import { Button } from 'antd'
import { ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CatalogAssociationBannerProps {
  phoneNumberId: string
  onConfigure: () => void
}

function getIgnoreKey(phoneNumberId: string) {
  return `whatsapp-catalog-ignore-${phoneNumberId}`
}

export function useCatalogIgnored(phoneNumberId: string) {
  const [ignored, setIgnored] = useState(() => {
    if (!phoneNumberId) return false
    return localStorage.getItem(getIgnoreKey(phoneNumberId)) === 'true'
  })

  const ignore = () => {
    localStorage.setItem(getIgnoreKey(phoneNumberId), 'true')
    setIgnored(true)
  }

  return { ignored, ignore }
}

export function CatalogAssociationBanner({
  phoneNumberId,
  onConfigure,
}: CatalogAssociationBannerProps) {
  const { t } = useTranslation()
  const { ignored, ignore } = useCatalogIgnored(phoneNumberId)

  if (ignored) return null

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
      <ShoppingBag size={18} strokeWidth={1.5} className="flex-shrink-0 text-text-muted" />
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-text-primary">
          {t('chat.no_catalog_associated')}
        </span>
        <span className="text-xs text-text-muted">{t('chat.catalog_association_desc')}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="small" type="text" onClick={ignore}>
          {t('chat.ignore')}
        </Button>
        <Button size="small" onClick={onConfigure}>
          {t('chat.associate')}
        </Button>
      </div>
    </div>
  )
}

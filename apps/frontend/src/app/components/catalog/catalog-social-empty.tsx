import { Collapse, Typography } from 'antd'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SocialSetup } from '@app/components/social/social-setup'

interface ParsedCatalogError {
  messages?: Record<string, string> | null
  technical?: string
  code?: string
}

/**
 * The catalog API surfaces backend errors as `Error("API error 400: <json>")`.
 * Pull the structured payload (friendly multilingual message + raw provider
 * error) back out so we can render a helpful state instead of a blank list.
 */
function parseCatalogError(error: unknown): ParsedCatalogError {
  if (!(error instanceof Error)) return {}
  const start = error.message.indexOf('{')
  if (start === -1) return {}
  try {
    return JSON.parse(error.message.slice(start)) as ParsedCatalogError
  } catch {
    return {}
  }
}

/**
 * "Social empty" state shown when we can't load a catalog's products (expired
 * token, lost permissions, etc.). Explains the issue in the user's language and
 * offers to reconnect, with the raw provider error tucked behind "show details".
 */
export function CatalogSocialEmpty({
  error,
  onReconnect,
}: {
  error: unknown
  onReconnect: () => void
}) {
  const { t, i18n } = useTranslation()
  const parsed = parseCatalogError(error)
  const lang = i18n.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const friendly =
    parsed.messages?.[lang] ??
    parsed.messages?.en ??
    parsed.messages?.fr ??
    t('catalog.error_description')

  return (
    <SocialSetup
      icon={<AlertCircle size={48} />}
      color="#ff4d4f"
      title={t('catalog.error_title')}
      description={friendly}
      buttonLabel={t('dashboard.action_reconnect')}
      buttonIcon={<RefreshCw size={18} />}
      buttonType="primary"
      onAction={onReconnect}
    >
      {parsed.technical && (
        <Collapse
          size="small"
          className="mb-6! w-full max-w-md text-left"
          items={[
            {
              key: 'technical',
              label: t('social.error_show_details'),
              children: (
                <Typography.Text code className="text-xs break-all whitespace-pre-wrap">
                  {parsed.technical}
                </Typography.Text>
              ),
            },
          ]}
        />
      )}
    </SocialSetup>
  )
}

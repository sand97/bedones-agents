import { Modal, Typography, Collapse, Spin, Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { $api } from '@app/lib/api/$api'

const { Paragraph, Text } = Typography

/**
 * Modal that explains, in the user's language, why a social account stopped
 * working and invites them to reconnect it. Lazily fetches the account health
 * (last error + LLM-generated friendly message) only while open.
 */
export function SocialAccountErrorDetails({
  accountId,
  open,
  onClose,
}: {
  accountId: string
  open: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()

  const healthQuery = $api.useQuery(
    'get',
    '/social/accounts/{accountId}/health',
    { params: { path: { accountId } } },
    { enabled: open },
  )

  const lang = i18n.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const message = healthQuery.data?.message
  const friendly = message?.[lang] ?? message?.en ?? message?.fr
  const technical = healthQuery.data?.lastError?.technical

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('social.error_details_title')}>
      {healthQuery.isLoading ? (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert type="warning" showIcon message={friendly ?? t('social.error_generic')} />
          {technical && (
            <Collapse
              size="small"
              items={[
                {
                  key: 'technical',
                  label: t('social.error_show_details'),
                  children: (
                    <Text code className="text-xs break-all whitespace-pre-wrap">
                      {technical}
                    </Text>
                  ),
                },
              ]}
            />
          )}
          <Paragraph type="secondary" className="text-xs!" style={{ marginBottom: 0 }}>
            {t('social.error_reconnect_hint')}
          </Paragraph>
        </div>
      )}
    </Modal>
  )
}

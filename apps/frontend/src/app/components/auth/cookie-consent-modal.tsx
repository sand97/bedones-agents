import { Button, Modal, Typography } from 'antd'
import { Cookie } from 'lucide-react'
import { $api } from '@app/lib/api/$api'

const { Title, Text } = Typography

interface CookieConsentModalProps {
  open: boolean
  onClose: () => void
}

export function CookieConsentModal({ open, onClose }: CookieConsentModalProps) {
  const consentMutation = $api.useMutation('post', '/auth/cookie-consent')

  const handleConsent = async (consent: 'all' | 'essential') => {
    // Poser le cookie côté frontend (même domaine = toujours lisible via document.cookie)
    const maxAge = 365 * 24 * 60 * 60
    document.cookie = `cookie_consent=${consent}; path=/; max-age=${maxAge}; SameSite=Lax`
    // Notifier le backend du choix de consentement
    await consentMutation.mutateAsync({ body: { consent } })
    onClose()
  }

  return (
    <Modal open={open} closable={false} maskClosable={false} footer={null} width={440} centered>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
          <Cookie size={28} />
        </div>

        <div className="text-center">
          <Title level={4} style={{ marginBottom: 4 }}>
            Gestion des cookies
          </Title>
          <Text type="secondary" className="text-sm leading-relaxed">
            Nous utilisons des cookies pour assurer le bon fonctionnement de la plateforme et
            am&eacute;liorer votre exp&eacute;rience. Consultez nos{' '}
            <a href="/legal/mentions" className="link-underline-hover text-text-primary">
              mentions l&eacute;gales
            </a>{' '}
            et notre{' '}
            <a href="/legal/privacy" className="link-underline-hover text-text-primary">
              politique de confidentialit&eacute;
            </a>{' '}
            pour en savoir plus.
          </Text>
        </div>

        <div className="flex w-full flex-col gap-2 pt-2">
          <Button
            type="primary"
            size="large"
            block
            loading={consentMutation.isPending}
            onClick={() => handleConsent('all')}
          >
            Accepter tous les cookies
          </Button>
          <Button
            size="large"
            block
            loading={consentMutation.isPending}
            onClick={() => handleConsent('essential')}
          >
            Cookies essentiels uniquement
          </Button>
        </div>
      </div>
    </Modal>
  )
}

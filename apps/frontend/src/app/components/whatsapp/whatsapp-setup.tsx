import { useState, useCallback } from 'react'
import { Button, Alert } from 'antd'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import { exchangeWhatsAppCode } from '@app/server/whatsapp'

const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID
const WHATSAPP_CONFIG_ID = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID

export function WhatsAppSetup() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    wabaId?: string
    phoneId?: string
    error?: string
  } | null>(null)

  const handleConnect = useCallback(async () => {
    setLoading(true)
    setResult(null)

    try {
      const { loginResponse, sessionInfo } = await launchWhatsAppSignup(
        FACEBOOK_APP_ID,
        WHATSAPP_CONFIG_ID,
      )

      if (loginResponse.authResponse?.code) {
        const exchangeResult = await exchangeWhatsAppCode({
          data: {
            code: loginResponse.authResponse.code,
            wabaId: sessionInfo.waba_id,
            phoneNumberId: sessionInfo.phone_number_id,
          },
        })

        if (exchangeResult.success) {
          setResult({
            success: true,
            wabaId: exchangeResult.wabaId,
            phoneId: exchangeResult.phoneId,
          })
        } else {
          setResult({
            success: false,
            error: exchangeResult.error || 'Erreur lors de la connexion',
          })
        }
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Erreur inattendue',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-whatsapp/10">
          <WhatsAppIcon className="h-8 w-8 text-brand-whatsapp" />
        </div>

        <h2 className="m-0 mb-2 text-2xl font-bold text-text-primary">
          Connecter WhatsApp Business
        </h2>

        <p className="m-0 mb-8 text-base leading-relaxed text-text-secondary">
          Associez votre compte WhatsApp Business via Facebook Cloud API pour centraliser vos
          conversations et répondre à vos clients directement depuis Bedones.
        </p>

        {result?.success && (
          <Alert
            className="mb-4! w-full"
            type="success"
            showIcon
            message="WhatsApp connecté"
            description={
              <>
                {result.wabaId && <div>WABA ID : {result.wabaId}</div>}
                {result.phoneId && <div>Phone Number ID : {result.phoneId}</div>}
              </>
            }
          />
        )}

        {result && !result.success && (
          <Alert
            className="mb-4! w-full"
            type="error"
            showIcon
            message="Échec de la connexion"
            description={result.error}
          />
        )}

        <Button
          type="primary"
          size="large"
          loading={loading}
          disabled={false}
          onClick={handleConnect}
          className="h-12 px-8 text-base font-semibold"
        >
          {loading ? 'Connexion en cours…' : 'Connecter WhatsApp'}
        </Button>
      </div>
    </div>
  )
}

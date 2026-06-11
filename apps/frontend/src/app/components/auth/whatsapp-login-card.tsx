import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Checkbox, Input, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { ArrowLeft, RotateCw, Send } from 'lucide-react'
import { fetchMe } from '@app/lib/api'
import { $api } from '@app/lib/api/$api'
import { navigateAfterAuth } from '@app/components/auth/post-auth-navigation'
import { CountryPhoneInput } from '@app/components/shared/country-phone-input'

const { Title, Text } = Typography

const LAST_LOGIN_PHONE_KEY = 'bedones:last_login_phone'

// Délai minimum (secondes) avant de pouvoir renvoyer un code OTP.
const RESEND_INTERVAL_SECONDS = 60

type WhatsAppStep = 'phone' | 'otp' | 'name'

function readStoredPhone(): string | null {
  try {
    return localStorage.getItem(LAST_LOGIN_PHONE_KEY)
  } catch {
    return null
  }
}

function writeStoredPhone(phone: string | null) {
  try {
    if (phone) localStorage.setItem(LAST_LOGIN_PHONE_KEY, phone)
    else localStorage.removeItem(LAST_LOGIN_PHONE_KEY)
  } catch {
    /* localStorage unavailable — ignore */
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* WhatsApp (default) login                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export function WhatsAppLoginCard({
  initialCountry,
  initialPhone,
  navigate,
  returnTo,
  t,
}: {
  initialCountry?: string
  initialPhone?: string
  navigate: ReturnType<typeof useNavigate>
  returnTo?: string
  t: (k: string, opts?: Record<string, unknown>) => string
}) {
  const [step, setStep] = useState<WhatsAppStep>('phone')
  // Combined value the CountryPhoneInput reads/writes, e.g. "+237657888690".
  const [phoneValue, setPhoneValue] = useState<string>(() => {
    if (initialCountry && initialPhone) {
      return normalizeCountry(initialCountry) + initialPhone.replace(/[^0-9]/g, '')
    }
    return readStoredPhone() ?? ''
  })
  const [parts, setParts] = useState<{ countryCode: string; phoneLocal: string }>(() => {
    if (initialCountry && initialPhone) {
      return {
        countryCode: normalizeCountry(initialCountry),
        phoneLocal: initialPhone.replace(/[^0-9]/g, ''),
      }
    }
    const stored = readStoredPhone()
    if (stored) {
      const cc = stored.match(/^\+\d{1,4}/)?.[0]
      return cc
        ? { countryCode: cc, phoneLocal: stored.slice(cc.length) }
        : { countryCode: '+237', phoneLocal: '' }
    }
    return { countryCode: '+237', phoneLocal: '' }
  })
  const [rememberPhone, setRememberPhone] = useState<boolean>(() => readStoredPhone() != null)
  const [otpCode, setOtpCode] = useState('')
  const [name, setName] = useState('')
  // Secondes restantes avant de pouvoir renvoyer le code (0 = renvoi autorisé).
  const [resendSeconds, setResendSeconds] = useState(0)

  const prefilled = Boolean(initialCountry && initialPhone)

  // Décrémente le compte à rebours du renvoi de code chaque seconde.
  useEffect(() => {
    if (resendSeconds <= 0) return
    const id = setTimeout(() => setResendSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendSeconds])

  const sendOtp = $api.useMutation('post', '/auth/whatsapp/send-otp')
  const verifyOtp = $api.useMutation('post', '/auth/whatsapp/verify-otp')
  const updateName = $api.useMutation('patch', '/auth/me/name')

  const phoneIsValid = parts.phoneLocal.length >= 6

  const handleSendOtp = async () => {
    if (!phoneIsValid) {
      message.error(t('auth.invalid_phone'))
      return
    }
    try {
      await sendOtp.mutateAsync({
        params: { header: { 'accept-language': navigator.language || 'fr' } },
        body: { countryCode: parts.countryCode, phone: parts.phoneLocal },
      })
      message.success(t('invitation.otp_sent'))
      setOtpCode('')
      setResendSeconds(RESEND_INTERVAL_SECONDS)
      setStep('otp')
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('invitation.otp_send_error'))
    }
  }

  const handleVerifyOtp = async () => {
    try {
      const result = await verifyOtp.mutateAsync({
        body: { countryCode: parts.countryCode, phone: parts.phoneLocal, code: otpCode },
      })

      // Persist the phone on success if the user opted in.
      writeStoredPhone(rememberPhone ? parts.countryCode + parts.phoneLocal : null)

      const verifyData = result as unknown as {
        user: { id: string; name: string; phone: string | null }
        isNewUser: boolean
      }

      if (verifyData.isNewUser || verifyData.user.name === verifyData.user.phone) {
        // New user (or migrated user with placeholder name) → collect a name.
        setStep('name')
        return
      }

      await goToNextScreen()
    } catch (err) {
      const apiMessage = (err as { message?: string })?.message
      message.error(apiMessage || t('invitation.invalid_code'))
    }
  }

  const handleSubmitName = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      message.error(t('auth.name_required'))
      return
    }
    try {
      await updateName.mutateAsync({ body: { name: trimmed } })
      await goToNextScreen()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const goToNextScreen = async () => {
    const data = await fetchMe()
    navigateAfterAuth(navigate, data, returnTo)
  }

  if (step === 'name') {
    return (
      <Card className="w-full" classNames={{ body: 'p-4! md:p-8!' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <Title level={4} style={{ marginBottom: 4 }}>
              {t('auth.welcome')}
            </Title>
            <Text type="secondary">{t('auth.your_name')}</Text>
          </div>

          <div className="flex w-full flex-col gap-3">
            <Input
              size="large"
              placeholder={t('auth.full_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onPressEnter={handleSubmitName}
              style={{ height: 48 }}
              autoFocus
            />
            <Button
              type="primary"
              size="large"
              block
              onClick={handleSubmitName}
              loading={verifyOtp.isPending}
              disabled={!name.trim()}
              style={{ height: 48 }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (step === 'otp') {
    return (
      <Card className="w-full" classNames={{ body: 'p-4! md:p-8!' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <Title level={4} style={{ marginBottom: 4 }}>
              {t('auth.verify_code')}
            </Title>
            <Text type="secondary">
              {t('invitation.enter_otp', { phone: parts.countryCode + parts.phoneLocal })}
            </Text>
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            {/* onInput (et non onChange) se déclenche à chaque frappe ET suppression,
                pour garder otpCode — donc le disabled du bouton Verify — synchronisé. */}
            <Input.OTP length={6} value={otpCode} onInput={(cells) => setOtpCode(cells.join(''))} />
            <Button
              type="primary"
              size="large"
              block
              onClick={handleVerifyOtp}
              loading={verifyOtp.isPending}
              disabled={otpCode.length < 6}
              style={{ height: 48 }}
            >
              {t('invitation.verify')}
            </Button>
            <Button
              type="default"
              icon={<RotateCw size={16} />}
              size="large"
              block
              style={{ height: 44 }}
              onClick={handleSendOtp}
              loading={sendOtp.isPending}
              disabled={resendSeconds > 0}
            >
              {resendSeconds > 0
                ? `${t('invitation.resend_code')} (${resendSeconds}s)`
                : t('invitation.resend_code')}
            </Button>
            <Button
              type="default"
              icon={<ArrowLeft size={16} />}
              size="large"
              block
              style={{ height: 44 }}
              onClick={() => setStep('phone')}
            >
              Modifier le numéro
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full" classNames={{ body: 'p-4! md:p-8!' }}>
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <Title level={4} style={{ marginBottom: 4 }}>
            {t('auth.title')}
          </Title>
          <Text type="secondary">{t('auth.whatsapp_subtitle')}</Text>
        </div>

        <div className="flex w-full flex-col gap-3">
          <CountryPhoneInput
            value={phoneValue}
            onChange={setPhoneValue}
            onPartsChange={(p) =>
              setParts({ countryCode: p.countryCode, phoneLocal: p.phoneLocal })
            }
            disableGeoDetect={prefilled}
            size="large"
          />
          <Checkbox checked={rememberPhone} onChange={(e) => setRememberPhone(e.target.checked)}>
            {t('auth.remember_phone')}
          </Checkbox>
          <Button
            type="primary"
            size="large"
            block
            icon={<Send size={16} />}
            onClick={handleSendOtp}
            loading={sendOtp.isPending}
            disabled={!phoneIsValid}
            style={{ height: 48 }}
          >
            {t('auth.send_verification_code')}
          </Button>
        </div>

        <Text type="secondary" className="text-center text-xs">
          En continuant, vous acceptez nos{' '}
          <a href="/legal/conditions" className="link-underline-hover text-text-primary">
            conditions d&apos;utilisation
          </a>{' '}
          et notre{' '}
          <a href="/legal/privacy" className="link-underline-hover text-text-primary">
            politique de confidentialité
          </a>
          .
        </Text>

        <Button
          type="link"
          size="small"
          onClick={() =>
            navigate({ to: '/auth/login', search: { method: 'email', return_to: returnTo } })
          }
        >
          Se connecter avec un email
        </Button>
      </div>
    </Card>
  )
}

function normalizeCountry(input: string): string {
  const trimmed = input.trim()
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

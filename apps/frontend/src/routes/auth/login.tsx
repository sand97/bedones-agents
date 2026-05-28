import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Card, Checkbox, Form, Input, Modal, Select, Typography, message } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Mail, BookOpen, HelpCircle, Send } from 'lucide-react'
import { featuresConfig, type Feature } from '@app/data/features'
import { login, fetchMe } from '@app/lib/api'
import { $api } from '@app/lib/api/$api'
import { CookieConsentModal } from '@app/components/auth/cookie-consent-modal'
import { CountryPhoneInput } from '@app/components/shared/country-phone-input'

const { Title, Text } = Typography

const LAST_LOGIN_PHONE_KEY = 'bedones:last_login_phone'

type LoginMethod = 'whatsapp' | 'email'
type WhatsAppStep = 'phone' | 'otp' | 'name'

interface LoginSearch {
  method?: LoginMethod
  country?: string
  phone?: string
}

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const method = search.method === 'email' ? 'email' : undefined
    return {
      method,
      country: typeof search.country === 'string' ? search.country : undefined,
      phone: typeof search.phone === 'string' ? search.phone : undefined,
    }
  },
})

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

function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = Route.useSearch()

  const method: LoginMethod = search.method === 'email' ? 'email' : 'whatsapp'

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [cookieConsentOpen, setCookieConsentOpen] = useState(() => {
    return !document.cookie.split('; ').some((c) => c.startsWith('cookie_consent='))
  })

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 mt-[12vh]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <span className="text-lg font-semibold">Bedones</span>
        </div>

        {method === 'email' ? (
          <EmailLoginCard navigate={navigate} t={t} />
        ) : (
          <WhatsAppLoginCard
            initialCountry={search.country}
            initialPhone={search.phone}
            navigate={navigate}
            t={t}
          />
        )}

        <div className="flex items-center gap-3">
          <Button
            type="default"
            icon={<HelpCircle size={16} />}
            size="large"
            style={{ height: 44 }}
            onClick={() => setSupportOpen(true)}
          >
            Aide
          </Button>
          <Button
            type="default"
            icon={<BookOpen size={16} />}
            href="/blog"
            size="large"
            style={{ height: 44 }}
          >
            Conseils pour votre business
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="mt-16 flex flex-wrap items-start justify-center gap-14">
        {Object.entries(featuresConfig).map(([key, category]) => (
          <div key={key} className="flex flex-col items-center gap-2 rounded-panel p-4">
            <p className="mb-1 text-lg text-text-secondary">{category.title}</p>
            <div className="flex flex-col items-center gap-2">
              {category.features.map((feature) => {
                const FeatureIcon = feature.icon

                return (
                  <button
                    key={feature.title}
                    type="button"
                    onClick={() => setSelectedFeature(feature)}
                    className="flex h-11 cursor-pointer items-center gap-2.5 rounded-pill border border-transparent bg-white px-6 shadow-pill transition-colors hover:border-black"
                  >
                    <FeatureIcon />
                    <span className="whitespace-nowrap text-base text-black">{feature.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Feature detail modal */}
      <Modal
        open={selectedFeature !== null}
        onCancel={() => setSelectedFeature(null)}
        closeIcon={null}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedFeature(null)}>
            Fermer
          </Button>,
        ]}
        title={
          selectedFeature && (
            <div className="flex items-center gap-2">
              <selectedFeature.icon />
              <span>{selectedFeature.title}</span>
            </div>
          )
        }
      >
        {selectedFeature && (
          <p className="text-base text-text-secondary">{selectedFeature.description}</p>
        )}
      </Modal>

      {/* Contact support modal */}
      <Modal
        open={supportOpen}
        onCancel={() => setSupportOpen(false)}
        title="Contacter le support"
        footer={null}
        destroyOnHidden
      >
        <Form
          form={supportForm}
          layout="vertical"
          onFinish={async () => {
            setSubmitting(true)
            await new Promise((r) => setTimeout(r, 800))
            setSubmitting(false)
            supportForm.resetFields()
            setSupportOpen(false)
            message.success(
              'Votre message a bien été envoyé. Nous reviendrons vers vous rapidement.',
            )
          }}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label="Votre adresse email"
            rules={[{ required: true, message: 'Veuillez entrer votre email' }]}
          >
            <Input placeholder="email@exemple.com" />
          </Form.Item>

          <Form.Item
            name="motif"
            label="Motif"
            rules={[{ required: true, message: 'Veuillez sélectionner un motif' }]}
          >
            <Select
              placeholder="Sélectionnez un motif"
              options={[
                { value: 'bug', label: 'Signaler un bug' },
                { value: 'account', label: 'Problème de compte' },
                { value: 'billing', label: 'Facturation' },
                { value: 'other', label: 'Autre' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Veuillez décrire votre problème' }]}
          >
            <Input.TextArea rows={4} placeholder="Décrivez votre problème ou votre question..." />
          </Form.Item>

          <div className="flex justify-end">
            <Button type="primary" htmlType="submit" loading={submitting} icon={<Send size={14} />}>
              Envoyer
            </Button>
          </div>
        </Form>
      </Modal>

      <CookieConsentModal open={cookieConsentOpen} onClose={() => setCookieConsentOpen(false)} />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* WhatsApp (default) login                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function WhatsAppLoginCard({
  initialCountry,
  initialPhone,
  navigate,
  t,
}: {
  initialCountry?: string
  initialPhone?: string
  navigate: ReturnType<typeof useNavigate>
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

  const prefilled = Boolean(initialCountry && initialPhone)

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
        body: { countryCode: parts.countryCode, phone: parts.phoneLocal },
      })
      message.success(t('invitation.otp_sent'))
      setOtpCode('')
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
    const hasPendingInvitations =
      (data as { pendingInvitations?: unknown[] }).pendingInvitations?.length ?? 0 > 0
    if (hasPendingInvitations) {
      navigate({ to: '/organisations' })
    } else if (data.organisations.length > 0) {
      navigate({
        to: '/app/$orgSlug/dashboard',
        params: { orgSlug: data.organisations[0].id },
      })
    } else {
      navigate({ to: '/create-organisation', search: { step: undefined } })
    }
  }

  if (step === 'name') {
    return (
      <Card className="w-full" styles={{ body: { padding: 32 } }}>
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
      <Card className="w-full" styles={{ body: { padding: 32 } }}>
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
            <Input.OTP length={6} value={otpCode} onChange={setOtpCode} />
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
            <Button type="link" onClick={handleSendOtp} loading={sendOtp.isPending}>
              {t('invitation.resend_code')}
            </Button>
            <Button type="text" onClick={() => setStep('phone')} size="small">
              {t('common.back')}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full" styles={{ body: { padding: 32 } }}>
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <Title level={4} style={{ marginBottom: 4 }}>
            Centralisez vos interactions sociales
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
      </div>
    </Card>
  )
}

function normalizeCountry(input: string): string {
  const trimmed = input.trim()
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Email/password login (legacy — kept via /auth/login?method=email)          */
/* ────────────────────────────────────────────────────────────────────────── */

function EmailLoginCard({
  navigate,
  t,
}: {
  navigate: ReturnType<typeof useNavigate>
  t: (k: string, opts?: Record<string, unknown>) => string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    try {
      await login(email, password)
      const data = await fetchMe()

      const hasPendingInvitations =
        (data as { pendingInvitations?: unknown[] }).pendingInvitations?.length ?? 0 > 0
      if (hasPendingInvitations) {
        navigate({ to: '/organisations' })
      } else if (data.organisations.length > 0) {
        navigate({
          to: '/app/$orgSlug/dashboard',
          params: { orgSlug: data.organisations[0].id },
        })
      } else {
        navigate({ to: '/create-organisation', search: { step: undefined } })
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('auth.login_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full" styles={{ body: { padding: 32 } }}>
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <Title level={4} style={{ marginBottom: 4 }}>
            Centralisez vos interactions sociales
          </Title>
          <Text type="secondary">Connectez-vous pour commencer</Text>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Input
            size="large"
            placeholder="Adresse email"
            prefix={<Mail size={16} className="text-text-soft" />}
            style={{ height: 48 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={handleLogin}
          />
          <Input.Password
            size="large"
            placeholder="Mot de passe"
            prefix={<Lock size={16} className="text-text-soft" />}
            style={{ height: 48 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={handleLogin}
          />
          <Button
            type="primary"
            size="large"
            block
            onClick={handleLogin}
            loading={loading}
            disabled={!email || !password}
            style={{ height: 48 }}
          >
            Se connecter
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
      </div>
    </Card>
  )
}

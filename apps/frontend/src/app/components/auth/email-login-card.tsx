import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Input, Typography, message } from 'antd'
import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { login, fetchMe } from '@app/lib/api'
import { navigateAfterAuth } from '@app/components/auth/post-auth-navigation'

const { Title, Text } = Typography

/* ────────────────────────────────────────────────────────────────────────── */
/* Email/password login (legacy — kept via /auth/login?method=email)          */
/* ────────────────────────────────────────────────────────────────────────── */

export function EmailLoginCard({
  navigate,
  returnTo,
  t,
}: {
  navigate: ReturnType<typeof useNavigate>
  returnTo?: string
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
      navigateAfterAuth(navigate, data, returnTo)
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('auth.login_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full" classNames={{ body: 'p-4! md:p-8!' }}>
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <Title level={4} style={{ marginBottom: 4 }}>
            {t('auth.title')}
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

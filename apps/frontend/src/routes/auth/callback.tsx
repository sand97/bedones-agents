import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Spin, Typography, Button, Result } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchMe, connectFacebook, connectInstagram, connectTikTok } from '@app/lib/api'
import { getAuthRedirect, clearAuthRedirect } from '@app/lib/auth-redirect'
import i18n from '@app/i18n'

const { Text } = Typography

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: (search.status as string) || 'error',
    error: (search.error as string) || undefined,
    code: (search.code as string) || undefined,
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { t } = useTranslation()
  const { status, error, code } = Route.useSearch()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState(i18n.t('auth.connecting'))
  const handledRef = useRef(false)

  useEffect(() => {
    // Prevent double-execution (React StrictMode runs effects twice in dev)
    if (handledRef.current) return
    handledRef.current = true

    if (status !== 'success') {
      setErrorMessage(getErrorText(error))
      return
    }

    const redirect = getAuthRedirect()

    // ─── OAuth code received — connect pages flow ───
    if (code && redirect?.intent === 'connect_pages' && redirect.orgId) {
      setLoadingMessage(i18n.t('auth.finalizing_connection'))

      const provider = redirect.provider || 'facebook'
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
      const redirectUri = `${apiUrl}/auth/callback/${provider}`

      const featureScopes = redirect.scopes
      const connectPromise =
        provider === 'tiktok'
          ? connectTikTok(redirect.orgId, code, redirectUri, featureScopes)
          : provider === 'instagram'
            ? connectInstagram(redirect.orgId, code, redirectUri, featureScopes)
            : connectFacebook(redirect.orgId, code, redirectUri, featureScopes)

      // Determine redirect destination after connect
      const pageId = redirect.pageId || provider
      const isChat = pageId === 'messenger' || pageId === 'instagram-dm'
      const redirectPath = isChat ? '/app/$orgSlug/chats/$id' : '/app/$orgSlug/comments/$id'

      connectPromise
        .then(() => {
          clearAuthRedirect()
          navigate({
            to: redirectPath,
            params: { orgSlug: redirect.orgId!, id: pageId },
          })
        })
        .catch((err) => {
          clearAuthRedirect()
          setErrorMessage(err instanceof Error ? err.message : i18n.t('auth.page_connect_error'))
        })
      return
    }

    // ─── OAuth code received — onboarding flow ───
    if (code && redirect?.intent === 'onboarding') {
      clearAuthRedirect()
      navigate({
        to: '/create-organisation',
        search: redirect.step ? { step: redirect.step } : undefined,
      })
      return
    }

    // ─── Standard login callback (no code, just session cookie) ───
    if (!code) {
      fetchMe()
        .then((data) => {
          clearAuthRedirect()

          if (redirect?.intent === 'onboarding') {
            navigate({
              to: '/create-organisation',
              search: redirect.step ? { step: redirect.step } : undefined,
            })
            return
          }

          const orgWithSocial = data.organisations.find((o) => o.socialAccounts.length > 0)
          if (orgWithSocial) {
            navigate({
              to: '/app/$orgSlug/dashboard',
              params: { orgSlug: orgWithSocial.id },
            })
          } else if (data.organisations.length > 0) {
            navigate({ to: '/create-organisation' })
          } else {
            navigate({ to: '/create-organisation' })
          }
        })
        .catch(() => {
          setErrorMessage(i18n.t('auth.fetch_user_error'))
        })
      return
    }

    // Fallback — code present but no matching intent
    clearAuthRedirect()
    setErrorMessage(i18n.t('auth.oauth_no_action'))
  }, [status, error, code, navigate])

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="error"
          title={t('auth.connection_error')}
          subTitle={errorMessage}
          extra={
            <Button type="primary" onClick={() => navigate({ to: '/auth/login' })}>
              {t('auth.back_to_login')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spin size="large" />
      <Text type="secondary">{loadingMessage}</Text>
    </div>
  )
}

function getErrorText(error?: string): string {
  switch (error) {
    case 'missing_code':
      return i18n.t('auth.missing_auth_code')
    case 'token_exchange_failed':
      return i18n.t('auth.token_exchange_error')
    case 'user_info_failed':
      return i18n.t('auth.user_info_error')
    case 'no_email':
      return i18n.t('auth.no_email')
    default:
      return error || i18n.t('auth.unexpected_error')
  }
}

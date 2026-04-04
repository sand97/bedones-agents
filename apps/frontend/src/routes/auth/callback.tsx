import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Spin, Typography, Button, Result } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { fetchMe, connectFacebook, connectInstagram, connectTikTok } from '@app/lib/api'
import { getAuthRedirect, clearAuthRedirect } from '@app/lib/auth-redirect'

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
  const { status, error, code } = Route.useSearch()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Connexion en cours...')
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
      setLoadingMessage('Nous finalisons la connexion...')

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
          setErrorMessage(err instanceof Error ? err.message : 'Erreur de connexion de la page')
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
          setErrorMessage('Impossible de récupérer vos informations. Veuillez réessayer.')
        })
      return
    }

    // Fallback — code present but no matching intent
    clearAuthRedirect()
    setErrorMessage("Code OAuth reçu mais aucune action n'est configurée. Veuillez réessayer.")
  }, [status, error, code, navigate])

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="error"
          title="Erreur de connexion"
          subTitle={errorMessage}
          extra={
            <Button type="primary" onClick={() => navigate({ to: '/auth/login' })}>
              Retour à la connexion
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
      return "Le code d'autorisation est manquant. Veuillez réessayer."
    case 'token_exchange_failed':
      return "Erreur lors de l'échange du token. Veuillez réessayer."
    case 'user_info_failed':
      return 'Impossible de récupérer vos informations depuis le réseau social.'
    case 'no_email':
      return "Votre compte ne fournit pas d'adresse email. Veuillez en ajouter une et réessayer."
    default:
      return error || 'Une erreur inattendue est survenue. Veuillez réessayer.'
  }
}

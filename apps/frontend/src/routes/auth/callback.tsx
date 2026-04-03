import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Spin, Typography, Button, Result } from 'antd'
import { useEffect, useState } from 'react'
import { fetchMe } from '@app/lib/api'
import { getAuthRedirect, clearAuthRedirect } from '@app/lib/auth-redirect'

const { Text } = Typography

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: (search.status as string) || 'error',
    error: (search.error as string) || undefined,
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { status, error } = Route.useSearch()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'success') {
      setErrorMessage(getErrorMessage(error))
      return
    }

    // Auth succeeded — fetch user info and redirect
    fetchMe()
      .then((data) => {
        const redirect = getAuthRedirect()
        clearAuthRedirect()

        if (redirect?.intent === 'onboarding') {
          navigate({
            to: '/create-organisation',
            search: redirect.step ? { step: redirect.step } : undefined,
          })
          return
        }

        // Login intent — find the best org to redirect to
        const orgWithSocial = data.organisations.find((o) => o.socialAccounts.length > 0)
        if (orgWithSocial) {
          navigate({
            to: '/app/$orgSlug/dashboard',
            params: { orgSlug: orgWithSocial.id },
          })
        } else if (data.organisations.length > 0) {
          // Has org but no social accounts → onboarding
          navigate({ to: '/create-organisation' })
        } else {
          // No org at all → onboarding
          navigate({ to: '/create-organisation' })
        }
      })
      .catch(() => {
        setErrorMessage('Impossible de récupérer vos informations. Veuillez réessayer.')
      })
  }, [status, error, navigate])

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
      <Text type="secondary">Connexion en cours...</Text>
    </div>
  )
}

function getErrorMessage(error?: string): string {
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

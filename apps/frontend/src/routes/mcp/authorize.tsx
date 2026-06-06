import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Card, Radio, Result, Space, Spin, Typography, message } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { $api } from '@app/lib/api/$api'
import {
  buildMcpAuthorizeUrl,
  submitMcpAuthorizeDecision,
  type McpAuthorizeParams,
} from '@app/lib/mcp-oauth'

const { Title, Text } = Typography

type McpAuthorizeSearch = Partial<McpAuthorizeParams>

/**
 * In-app consent screen for the MCP OAuth flow. The backend authorize endpoint
 * redirects here with the OAuth params; we list the user's organisations and
 * post the decision, then show a success screen before handing the
 * authorization code back to the AI client (ChatGPT / Claude).
 */
export const Route = createFileRoute('/mcp/authorize')({
  component: McpAuthorizePage,
  validateSearch: (search: Record<string, unknown>): McpAuthorizeSearch => {
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
    return {
      client_id: str(search.client_id),
      redirect_uri: str(search.redirect_uri),
      state: str(search.state),
      scope: str(search.scope),
      code_challenge: str(search.code_challenge),
      code_challenge_method: str(search.code_challenge_method),
    }
  },
})

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function McpAuthorizePage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const meQuery = $api.useQuery('get', '/auth/me', {}, { retry: false })

  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const hasParams = Boolean(search.client_id && search.redirect_uri)

  // Not authenticated → bounce through login and come back into the flow.
  useEffect(() => {
    if (meQuery.error && hasParams) {
      navigate({
        to: '/auth/login',
        search: { return_to: buildMcpAuthorizeUrl(search as McpAuthorizeParams) },
      })
    }
  }, [meQuery.error, hasParams, navigate, search])

  // Preselect the first organisation once /auth/me resolves.
  useEffect(() => {
    if (meQuery.data && !selectedOrg) {
      const first = meQuery.data.organisations?.[0]
      if (first) setSelectedOrg(first.id)
    }
  }, [meQuery.data, selectedOrg])

  if (!hasParams) {
    return (
      <Centered>
        <Result status="error" title="Lien d'autorisation invalide ou incomplet." />
      </Centered>
    )
  }

  if (meQuery.isLoading || meQuery.error) {
    return (
      <Centered>
        <div className="flex justify-center">
          <Spin size="large" />
        </div>
      </Centered>
    )
  }

  if (done) {
    return (
      <Centered>
        <Result
          status="success"
          title="Accès autorisé"
          subTitle="Bedones est connecté. Vous pouvez retourner sur ChatGPT — la fenêtre va se fermer automatiquement."
        />
      </Centered>
    )
  }

  const orgs = meQuery.data?.organisations ?? []

  const handleAuthorize = async () => {
    if (!selectedOrg) return
    setSubmitting(true)
    try {
      const redirectUrl = await submitMcpAuthorizeDecision({
        ...(search as McpAuthorizeParams),
        organisationId: selectedOrg,
      })
      setDone(true)
      // Hand the authorization code back to the AI client.
      setTimeout(() => {
        window.location.href = redirectUrl
      }, 1200)
    } catch (err) {
      message.error(
        err instanceof Error && err.message === 'organisation_not_authorised'
          ? "Vous n'avez pas accès à cette organisation."
          : "L'autorisation a échoué, réessayez.",
      )
      setSubmitting(false)
    }
  }

  return (
    <Centered>
      <Card classNames={{ body: 'p-6! md:p-8!' }}>
        <div className="flex flex-col gap-5">
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              Autoriser l&apos;accès IA
            </Title>
            <Text type="secondary">
              Bonjour {meQuery.data?.user.name}. Une application IA souhaite gérer vos messages et
              commentaires via Bedones. Choisissez l&apos;organisation à connecter.
            </Text>
          </div>

          {orgs.length === 0 ? (
            <Text type="danger">Aucune organisation active sur ce compte.</Text>
          ) : (
            <Radio.Group
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {orgs.map((org) => (
                  <Radio key={org.id} value={org.id}>
                    {org.name}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          )}

          <Button
            type="primary"
            size="large"
            block
            disabled={!selectedOrg || orgs.length === 0}
            loading={submitting}
            onClick={handleAuthorize}
          >
            Autoriser
          </Button>
        </div>
      </Card>
    </Centered>
  )
}

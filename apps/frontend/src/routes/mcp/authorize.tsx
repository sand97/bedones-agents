import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Card, Radio, Result, Space, Spin, Typography } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { $api } from '@app/lib/api/$api'
import {
  buildMcpAuthorizeUrl,
  submitMcpAuthorizeDecision,
  type McpAuthorizeParams,
} from '@app/lib/mcp-oauth'

const { Title, Text } = Typography

type McpAuthorizeSearch = Partial<McpAuthorizeParams> & { error?: string }

/**
 * In-app consent screen for the MCP OAuth flow. The backend authorize endpoint
 * redirects here with the OAuth params; we list the user's organisations and
 * submit the decision as a full-page POST. The backend then 302s to the AI
 * client's redirect_uri (the hop ChatGPT / Claude track to finish connecting).
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
      error: str(search.error),
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

  const orgs = meQuery.data?.organisations ?? []

  const handleAuthorize = () => {
    if (!selectedOrg) return
    setSubmitting(true)
    // Full-page navigation: the backend will 302 back to the AI client.
    submitMcpAuthorizeDecision({
      ...(search as McpAuthorizeParams),
      organisationId: selectedOrg,
    })
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

          {search.error === 'org' && (
            <Text type="danger">
              Vous n&apos;avez pas accès à cette organisation, choisissez-en une autre.
            </Text>
          )}

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

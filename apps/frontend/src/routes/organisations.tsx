import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Card, Typography, message } from 'antd'
import { Building2, Plus } from 'lucide-react'
import { $api } from '@app/lib/api/$api'
import { formatDate } from '@app/lib/format'

const { Title, Text } = Typography

export const Route = createFileRoute('/organisations')({
  component: OrganisationsPage,
})

function OrganisationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [processingOrg, setProcessingOrg] = useState<string | null>(null)

  const meQuery = $api.useQuery('get', '/auth/me')

  const acceptMutation = $api.useMutation('post', '/invitations/accept')
  const rejectMutation = $api.useMutation('post', '/invitations/reject')

  const organisations = meQuery.data?.organisations ?? []
  const invitations = meQuery.data?.pendingInvitations ?? []

  const invalidateMe = () => {
    queryClient.invalidateQueries({ queryKey: ['get', '/auth/me'] })
  }

  if (meQuery.isError) {
    navigate({ to: '/auth/login' })
    return null
  }

  const handleAccept = async (orgId: string) => {
    setProcessingOrg(orgId)
    try {
      await acceptMutation.mutateAsync({
        params: { query: { orgId } },
        body: {},
      })
      message.success('Invitation acceptée')
      invalidateMe()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setProcessingOrg(null)
    }
  }

  const handleReject = async (orgId: string) => {
    setProcessingOrg(orgId)
    try {
      await rejectMutation.mutateAsync({
        params: { query: { orgId } },
      })
      message.info('Invitation refusée')
      invalidateMe()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setProcessingOrg(null)
    }
  }

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-text-muted">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="mt-[8vh] flex w-full max-w-lg flex-col gap-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <span className="text-lg font-semibold">Bedones</span>
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <section className="flex flex-col gap-3">
            <Title level={5} className="!mb-0">
              Invitations
            </Title>
            {invitations.map((inv) => (
              <Card key={inv.organisationId} size="small">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Avatar
                    size={40}
                    src={(inv.organisationLogo as string) || undefined}
                    icon={<Building2 size={20} />}
                    style={{ background: '#f0f0f0', color: '#666', flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {inv.organisationName}
                    </div>
                    <Text type="secondary" className="text-xs">
                      Envoyé le {formatDate(inv.invitedAt)}
                    </Text>
                  </div>
                  <div className="flex gap-2 max-sm:*:flex-1 sm:flex-shrink-0">
                    <Button
                      size="small"
                      onClick={() => handleReject(inv.organisationId)}
                      loading={processingOrg === inv.organisationId}
                    >
                      Refuser
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => handleAccept(inv.organisationId)}
                      loading={processingOrg === inv.organisationId}
                    >
                      Accepter
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        )}

        {/* Organisations */}
        <section className="flex flex-col gap-3">
          <Title level={5} className="!mb-0">
            Vos organisations
          </Title>
          {organisations.length > 0 ? (
            organisations.map((org) => (
              <Card key={org.id} size="small">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Avatar
                    size={40}
                    src={(org.logoUrl as string) || undefined}
                    icon={<Building2 size={20} />}
                    style={{ background: '#f0f0f0', color: '#666', flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{org.name}</div>
                  </div>
                  <div className="max-sm:*:flex-1">
                    <Button
                      size="small"
                      type="primary"
                      onClick={() =>
                        navigate({ to: '/app/$orgSlug/dashboard', params: { orgSlug: org.id } })
                      }
                    >
                      Ouvrir
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card size="small">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <Text type="secondary">
                  Votre compte n&apos;est lié à aucune organisation pour le moment, vous pouvez en
                  créer une.
                </Text>
                <Button
                  type="primary"
                  icon={<Plus size={16} />}
                  onClick={() =>
                    navigate({ to: '/create-organisation', search: { step: undefined } })
                  }
                >
                  Créer une organisation
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

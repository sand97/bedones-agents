import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { Skeleton, Typography } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { $api } from '@app/lib/api/$api'
import { SetupCarousel } from '@app/components/dashboard/setup-carousel'
import { AccountOverview } from '@app/components/dashboard/account-overview'
import { SetupSuccessModal } from '@app/components/dashboard/setup-success-modal'
import { CommentsConfigModal } from '@app/components/comments/comments-config'
import type { components } from '@app/lib/api/v1'

const { Title, Text } = Typography

type SetupStatus = components['schemas']['SetupStatusResponseDto']
type PendingComment = components['schemas']['PendingCommentsStepDto']
type PendingAgent = components['schemas']['PendingAgentStepDto']

export const Route = createFileRoute('/app/$orgSlug/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const queryClient = useQueryClient()

  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })

  const setupStatusQuery = $api.useQuery('get', '/organisations/{id}/setup-status', {
    params: { path: { id: orgSlug } },
  })

  // ─── State for the active "Configure comments" modal ───
  const [commentsModal, setCommentsModal] = useState<{
    accountId: string
    pageName: string
  } | null>(null)

  // ─── State for the success modal opened after a configuration step ───
  const [successModal, setSuccessModal] = useState<{
    subject: string
    remaining: number
  } | null>(null)

  const status = setupStatusQuery.data
  const accounts = accountsQuery.data ?? []

  const handleConfigureCatalog = () => {
    navigate({
      to: '/app/$orgSlug/catalog',
      params: { orgSlug },
      search: {
        catalogId: undefined,
        status: undefined,
        collection: undefined,
        page: undefined,
      },
    })
  }

  const handleConfigureComments = (step: PendingComment) => {
    setCommentsModal({
      accountId: step.socialAccountId,
      pageName: step.pageName ?? step.provider,
    })
  }

  const handleConfigureAgent = (step: PendingAgent) => {
    navigate({ to: '/app/$orgSlug/agents', params: { orgSlug } })
    // Best-effort: pass the agent id via search params so the page can pre-select it.
    // (Agents page currently doesn't read query state — kept as a future hook.)
    void step
  }

  const handleCommentsSaved = async () => {
    const previousPageName = commentsModal?.pageName ?? ''
    setCommentsModal(null)

    // Refetch setup status — the API now knows we just configured a page.
    const refreshed = await queryClient
      .fetchQuery<SetupStatus>({
        queryKey: [
          'get',
          '/organisations/{id}/setup-status',
          { params: { path: { id: orgSlug } } },
        ],
        queryFn: () => fetchSetupStatus(orgSlug),
      })
      .catch(() => undefined)

    const remaining = refreshed?.pendingCount ?? 0
    // Always refresh the live query too so the carousel re-renders.
    setupStatusQuery.refetch()
    accountsQuery.refetch()

    if (remaining > 0) {
      setSuccessModal({ subject: previousPageName, remaining })
    }
  }

  const handleSuccessContinue = () => {
    setSuccessModal(null)
    // We already are on /dashboard — nothing else to do; the carousel now shows the next step.
  }

  const handleOpenComments = (provider: string, _accountId: string) => {
    void _accountId
    const pathByProvider: Record<string, string> = {
      FACEBOOK: 'comments/facebook',
      INSTAGRAM: 'comments/instagram',
      TIKTOK: 'comments/tiktok',
    }
    const path = pathByProvider[provider]
    if (path) {
      navigate({ to: `/app/$orgSlug/${path}` as string, params: { orgSlug } })
    }
  }

  const handleOpenMessaging = (provider: string, _accountId: string) => {
    void _accountId
    const pathByProvider: Record<string, string> = {
      WHATSAPP: 'chats/whatsapp',
      FACEBOOK: 'chats/messenger',
      INSTAGRAM: 'chats/instagram-dm',
      TIKTOK: 'chats/tiktok',
    }
    const path = pathByProvider[provider]
    if (path) {
      navigate({ to: `/app/$orgSlug/${path}` as string, params: { orgSlug } })
    }
  }

  return (
    <div>
      <DashboardHeader title={t('dashboard.title')} />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Title level={4} style={{ margin: 0 }}>
            {t('dashboard.welcome_title')}
          </Title>
          <Text type="secondary" className="max-w-xl">
            {status && !status.allConfigured
              ? t('dashboard.welcome_setup_subtitle')
              : t('dashboard.welcome_description')}
          </Text>
        </div>

        {setupStatusQuery.isLoading || accountsQuery.isLoading ? (
          <Skeleton active />
        ) : status && !status.allConfigured ? (
          <SetupCarousel
            status={status}
            onConfigureCatalog={handleConfigureCatalog}
            onConfigureComments={handleConfigureComments}
            onConfigureAgent={handleConfigureAgent}
          />
        ) : (
          <AccountOverview
            accounts={accounts}
            orgSlug={orgSlug}
            onOpenComments={handleOpenComments}
            onOpenMessaging={handleOpenMessaging}
          />
        )}
      </div>

      {/* Comments config modal — driven from the carousel */}
      {commentsModal && (
        <CommentsConfigModal
          open={Boolean(commentsModal)}
          accountId={commentsModal.accountId}
          pageName={commentsModal.pageName}
          organisationId={orgSlug}
          onClose={() => setCommentsModal(null)}
          onSaved={handleCommentsSaved}
        />
      )}

      {/* Success modal — opens after a configuration step when steps remain */}
      <SetupSuccessModal
        open={Boolean(successModal)}
        subjectName={successModal?.subject ?? ''}
        remainingCount={successModal?.remaining ?? 0}
        onContinue={handleSuccessContinue}
        onLater={() => setSuccessModal(null)}
      />
    </div>
  )
}

async function fetchSetupStatus(orgId: string): Promise<SetupStatus> {
  const baseUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const res = await fetch(`${baseUrl}/organisations/${orgId}/setup-status`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to fetch setup status: ${res.status}`)
  return res.json()
}

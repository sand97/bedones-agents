import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { Skeleton, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { $api } from '@app/lib/api/$api'
import { SetupCarousel } from '@app/components/dashboard/setup-carousel'
import { AccountOverview } from '@app/components/dashboard/account-overview'
import { CommentsConfigModal } from '@app/components/comments/comments-config'
import type { components } from '@app/lib/api/v1'

const { Title, Text } = Typography

type PendingComment = components['schemas']['PendingCommentsStepDto']
type PendingAgent = components['schemas']['PendingAgentStepDto']

export const Route = createFileRoute('/app/$orgSlug/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }

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

  // Step keys the user just finished in this session. We keep them in the
  // carousel (with a check + "Modifier" label) instead of letting the slide
  // disappear under the user — both for clarity and to avoid Slick snapping
  // back to slide 0 every time the children count changes.
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(() => new Set())

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
    // Future hook: pass the agent id via search params so the page can preselect it.
    void step
  }

  const handleCommentsSaved = () => {
    // The CommentsConfigModal already shows its own success toast. We mark the
    // step as completed for this session — it stays in the carousel with a
    // checkmark and a "Modifier la configuration" label. We deliberately do
    // NOT refetch /setup-status here: refetching would drop the slide out of
    // the carousel mid-session, which is what the user wanted to avoid. The
    // status will refresh naturally the next time the dashboard mounts.
    const accountId = commentsModal?.accountId
    setCommentsModal(null)
    if (accountId) {
      setCompletedKeys((prev) => {
        const next = new Set(prev)
        next.add(`comments-${accountId}`)
        return next
      })
    }
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
            completedKeys={completedKeys}
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
    </div>
  )
}

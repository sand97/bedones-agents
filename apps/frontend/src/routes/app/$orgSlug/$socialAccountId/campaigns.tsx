import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { App, Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  FileText,
  Megaphone,
  Pencil,
  Trash2,
} from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { LoyaltyTemplateModal } from '@app/components/loyalty/loyalty-template-modal'
import { CampaignDetailsModal } from '@app/components/campaigns/campaign-details-modal'
import { CampaignModal } from '@app/components/campaigns/campaign-modal'
import type {
  CampaignFormPayload,
  CampaignUpdatePayload,
} from '@app/components/campaigns/campaign-shared'
import type { LoyaltyCampaign } from '@app/lib/api/loyalty-api'
import { $api } from '@app/lib/api/$api'
import { formatDate } from '@app/lib/format'

export const Route = createFileRoute('/app/$orgSlug/$socialAccountId/campaigns')({
  component: GeneralCampaignsPage,
})

function GeneralCampaignsPage() {
  const { t } = useTranslation()
  const { orgSlug, socialAccountId } = useParams({
    from: '/app/$orgSlug/$socialAccountId/campaigns',
  })
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [detailsCampaign, setDetailsCampaign] = useState<LoyaltyCampaign | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<LoyaltyCampaign | null>(null)
  const campaignsQueryParams = useMemo(
    () => ({
      params: {
        path: { socialAccountId },
        query: { origin: 'GENERAL' },
      },
    }),
    [socialAccountId],
  )
  const campaignsQuery = $api.useQuery(
    'get',
    '/loyalty/campaigns/account/{socialAccountId}',
    campaignsQueryParams,
  )
  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })
  const currentAccount = useMemo(
    () => accountsQuery.data?.find((account) => account.id === socialAccountId),
    [accountsQuery.data, socialAccountId],
  )
  const defaultTemplateFooter =
    currentAccount?.pageName || currentAccount?.username || currentAccount?.providerAccountId
  const createMutation = $api.useMutation('post', '/loyalty/campaigns')
  const updateMutation = $api.useMutation('patch', '/loyalty/campaigns/{id}')
  const deleteMutation = $api.useMutation('delete', '/loyalty/campaigns/{id}')
  const campaigns = (campaignsQuery.data ?? []) as LoyaltyCampaign[]
  const campaignStatusLabels: Record<string, string> = {
    DRAFT: t('promotions.status_draft'),
    SCHEDULED: t('loyalty.status_scheduled'),
    RUNNING: t('loyalty.status_running'),
    COMPLETED: t('loyalty.status_completed'),
    PAUSED: t('promotions.status_paused'),
    FAILED: t('loyalty.status_failed'),
    CANCELLED: t('loyalty.status_cancelled'),
  }

  const invalidateCampaigns = () =>
    queryClient.invalidateQueries({
      queryKey: ['get', '/loyalty/campaigns/account/{socialAccountId}', campaignsQueryParams],
    })

  const handleCreateCampaign = async (payload: CampaignFormPayload) => {
    if (editingCampaign) {
      const body: CampaignUpdatePayload = {
        name: payload.name,
        metaTemplateId: payload.metaTemplateId,
        metaTemplateName: payload.metaTemplateName,
        metaTemplateLanguage: payload.metaTemplateLanguage,
        frequency: payload.frequency,
        marketingTopic: payload.marketingTopic,
        segmentCriteria: payload.segmentCriteria,
        audienceType: payload.audienceType,
        audienceCriteria: payload.audienceCriteria,
        audienceLimit: payload.audienceLimit,
        templateAssignments: payload.templateAssignments,
        variableValues: payload.variableValues,
        startDate: payload.startDate,
        endDate: payload.endDate,
      }
      await updateMutation.mutateAsync({
        params: { path: { id: editingCampaign.id } },
        body,
      })
    } else {
      await createMutation.mutateAsync({ body: payload })
    }
    await invalidateCampaigns()
    setEditingCampaign(null)
    setModalOpen(false)
    message.success(editingCampaign ? t('loyalty.campaign_updated') : t('loyalty.campaign_created'))
  }

  const handleDeleteCampaign = async (id: string) => {
    await deleteMutation.mutateAsync({ params: { path: { id } } })
    await invalidateCampaigns()
  }

  const columns: ColumnsType<LoyaltyCampaign> = [
    {
      title: t('loyalty.campaign_singular'),
      key: 'name',
      render: (_, record) => (
        <div>
          <div className="text-sm font-medium text-text-primary">{record.name}</div>
          <div className="text-xs text-text-muted">{record.marketingTopic ?? 'general'}</div>
        </div>
      ),
    },
    {
      title: t('loyalty.campaign_start'),
      dataIndex: 'startDate',
      render: (value) => (value ? formatDate(value) : '-'),
    },
    { title: t('loyalty.col_delivered'), dataIndex: 'deliveredCount' },
    { title: t('loyalty.col_read'), dataIndex: 'readCount' },
    { title: t('loyalty.col_replied'), dataIndex: 'repliedCount' },
    {
      title: t('promotions.status'),
      dataIndex: 'status',
      render: (status) => <Tag>{campaignStatusLabels[String(status)] ?? status}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="small"
            icon={<BarChart3 size={14} />}
            onClick={() => setDetailsCampaign(record)}
          >
            {t('common.details')}
          </Button>
          <Button
            size="small"
            icon={<Pencil size={14} />}
            onClick={() => {
              setEditingCampaign(record)
              setModalOpen(true)
            }}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={() => void handleDeleteCampaign(record.id)}
            loading={deleteMutation.isPending}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('loyalty.campaign_general_title')}
        mobileTitle={t('loyalty.campaign_general_title')}
        mobileLeft={
          <Button
            type="text"
            icon={<ArrowLeft size={18} />}
            onClick={() =>
              navigate({
                to: '/app/$orgSlug/chats/$id' as string,
                params: { orgSlug, id: 'whatsapp' },
                search: { account: socialAccountId },
              })
            }
          >
            WhatsApp
          </Button>
        }
        action={
          <div className="flex items-center gap-2">
            <Button icon={<FileText size={16} />} onClick={() => setTemplatesOpen(true)}>
              {t('loyalty.templates')}
            </Button>
            <Button
              type="primary"
              icon={<CalendarClock size={16} />}
              onClick={() => {
                setEditingCampaign(null)
                setModalOpen(true)
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        }
      />
      {campaignsQuery.isLoading || campaigns.length > 0 ? (
        <div className="flex-1 p-4 lg:p-6">
          <Table
            rowKey="id"
            bordered
            loading={campaignsQuery.isLoading}
            dataSource={campaigns}
            columns={columns}
          />
        </div>
      ) : (
        <SocialSetup
          icon={<Megaphone size={40} strokeWidth={1.5} />}
          color="var(--color-brand-whatsapp)"
          title={t('loyalty.campaign_general_empty_title')}
          description={t('loyalty.campaign_general_empty_desc')}
          buttonLabel={t('loyalty.campaign_general_create_title')}
          buttonIcon={<CalendarClock size={18} />}
          onAction={() => {
            setEditingCampaign(null)
            setModalOpen(true)
          }}
          secondaryButtonLabel={t('loyalty.templates_manage')}
          secondaryButtonIcon={<FileText size={18} />}
          onSecondaryAction={() => setTemplatesOpen(true)}
          actionsLayout="stack"
        />
      )}

      <CampaignModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingCampaign(null)
        }}
        socialAccountId={socialAccountId}
        orgSlug={orgSlug}
        defaultFooter={defaultTemplateFooter}
        onSubmit={handleCreateCampaign}
        loading={createMutation.isPending || updateMutation.isPending}
        campaign={editingCampaign}
      />
      <CampaignDetailsModal
        open={!!detailsCampaign}
        campaign={detailsCampaign}
        onClose={() => setDetailsCampaign(null)}
      />
      <LoyaltyTemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        socialAccountId={socialAccountId}
        defaultFooter={defaultTemplateFooter}
      />
    </div>
  )
}

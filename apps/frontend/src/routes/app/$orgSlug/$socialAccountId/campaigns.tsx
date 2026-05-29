import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Segmented,
  Spin,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  FileText,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import {
  ProductPickerModal,
  type PickerProduct,
} from '@app/components/promotions/product-picker-modal'
import { TemplateSelectField } from '@app/components/loyalty/template-select-field'
import { LoyaltyTemplateModal } from '@app/components/loyalty/loyalty-template-modal'
import type {
  CampaignAudienceType,
  CampaignTemplateSelection,
  LoyaltyCampaign,
  LoyaltyTemplate,
} from '@app/lib/api/loyalty-api'
import type { Catalog } from '@app/lib/api/agent-api'
import { $api } from '@app/lib/api/$api'
import type { components } from '@app/lib/api/v1'
import { formatDate } from '@app/lib/format'

export const Route = createFileRoute('/app/$orgSlug/$socialAccountId/campaigns')({
  component: GeneralCampaignsPage,
})

type TemplateBlock = {
  id: string
  allLanguages?: boolean
  languageCodes: string[]
  template: LoyaltyTemplate | null
  variableValues: Record<string, string>
  mpmProducts: PickerProduct[]
}

type TicketStatusOption = { id: string; name: string }
type CampaignFormPayload = components['schemas']['CreateLoyaltyCampaignDto']
type CampaignUpdatePayload = components['schemas']['UpdateLoyaltyCampaignDto']
type CampaignAudiencePreview = {
  maxEligible: number
  limitedCount: number
  languages: Array<{ code: string; count: number }>
}
type CampaignDetails = {
  stats: Array<{ date: string; delivered: number; read: number; replied: number }>
  contacts: {
    data: Array<{
      id: string
      contactName: string | null
      contactPhone: string | null
      languageCode: string | null
      status: string
    }>
    total: number
  }
}

const ALL_LANGUAGES_VALUE = '__ALL_LANGUAGES__'
const MAX_MPM_PRODUCTS = 30

function newBlock(): TemplateBlock {
  return {
    id: crypto.randomUUID(),
    languageCodes: [],
    template: null,
    variableValues: {},
    mpmProducts: [],
  }
}

function templateHasMpmButton(template?: LoyaltyTemplate | null) {
  return template?.buttons?.some((button) => button.type === 'MPM') ?? false
}

function templateFromAssignment(
  socialAccountId: string,
  assignment: CampaignTemplateSelection,
): LoyaltyTemplate {
  return {
    id: assignment.metaTemplateId,
    socialAccountId,
    name: assignment.metaTemplateName,
    language: assignment.metaTemplateLanguage,
    category: assignment.metaTemplateCategory ?? 'MARKETING',
    body: assignment.body ?? '',
    variables: Object.keys(assignment.variableValues ?? {}),
    status: 'APPROVED',
    buttons: assignment.mpmProductRetailerIds?.length
      ? [{ type: 'MPM', text: 'View items' }]
      : undefined,
  }
}

function placeholderProduct(productId: string): PickerProduct {
  return {
    id: productId,
    name: productId,
    description: '',
    imageUrl: '',
    price: 0,
    currency: '',
  }
}

function CampaignDetailsModal({
  campaign,
  open,
  onClose,
}: {
  campaign: LoyaltyCampaign | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'stats' | 'contacts'>('stats')
  const [bucket, setBucket] = useState<'delivered' | 'read' | 'replied'>('delivered')
  const [page, setPage] = useState(1)
  const contactStatusLabels: Record<string, string> = {
    PENDING: t('loyalty.campaign_contact_status_pending'),
    SENT: t('loyalty.campaign_contact_status_sent'),
    DELIVERED: t('loyalty.campaign_contact_status_delivered'),
    READ: t('loyalty.campaign_contact_status_read'),
    REPLIED: t('loyalty.campaign_contact_status_replied'),
    FAILED: t('loyalty.campaign_contact_status_failed'),
  }

  const detailsQuery = $api.useQuery(
    'get',
    '/loyalty/campaigns/{id}/details',
    {
      params: {
        path: { id: campaign?.id ?? '' },
        query: { bucket, page: String(page), pageSize: '10' },
      },
    },
    { enabled: open && !!campaign },
  )
  const details = detailsQuery.data as unknown as CampaignDetails | undefined

  return (
    <Modal title={campaign?.name} open={open} onCancel={onClose} footer={null} width={860}>
      <Segmented
        value={tab}
        onChange={(value) => setTab(value as 'stats' | 'contacts')}
        options={[
          { label: t('loyalty.campaign_details_stats'), value: 'stats' },
          { label: t('loyalty.campaign_details_contacts'), value: 'contacts' },
        ]}
      />
      {detailsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spin />
        </div>
      ) : tab === 'stats' ? (
        <div className="mt-4 h-72">
          <ResponsiveContainer>
            <LineChart data={details?.stats ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => dayjs(value).format('DD/MM')}
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={(value) => dayjs(value as string).format('DD/MM/YYYY')} />
              <Line type="monotone" dataKey="delivered" stroke="#1677ff" strokeWidth={2} />
              <Line type="monotone" dataKey="read" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="replied" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4">
          <Segmented
            value={bucket}
            onChange={(value) => {
              setBucket(value as 'delivered' | 'read' | 'replied')
              setPage(1)
            }}
            options={[
              { label: t('loyalty.col_delivered'), value: 'delivered' },
              { label: t('loyalty.col_read'), value: 'read' },
              { label: t('loyalty.col_replied'), value: 'replied' },
            ]}
          />
          <Table
            className="mt-3"
            rowKey="id"
            size="small"
            dataSource={details?.contacts.data ?? []}
            columns={[
              { title: t('loyalty.campaign_contact'), dataIndex: 'contactName' },
              { title: t('loyalty.campaign_contact_phone'), dataIndex: 'contactPhone' },
              {
                title: t('loyalty.campaign_contact_language'),
                dataIndex: 'languageCode',
                render: (value) => value ?? '-',
              },
              {
                title: t('promotions.status'),
                dataIndex: 'status',
                render: (value) => <Tag>{contactStatusLabels[String(value)] ?? value}</Tag>,
              },
            ]}
            pagination={{
              current: page,
              pageSize: 10,
              total: details?.contacts.total ?? 0,
              onChange: setPage,
            }}
          />
        </div>
      )}
    </Modal>
  )
}

function CampaignModal({
  open,
  onClose,
  socialAccountId,
  orgSlug,
  defaultFooter,
  onSubmit,
  loading,
  campaign,
}: {
  open: boolean
  onClose: () => void
  socialAccountId: string
  orgSlug: string
  defaultFooter?: string
  onSubmit: (payload: CampaignFormPayload) => void | Promise<void>
  loading?: boolean
  campaign?: LoyaltyCampaign | null
}) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [mpmPickerBlockId, setMpmPickerBlockId] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<PickerProduct[]>([])
  const [blocks, setBlocks] = useState<TemplateBlock[]>([newBlock()])

  const audienceType =
    (Form.useWatch('audienceType', form) as CampaignAudienceType | undefined) ?? 'RECENT_CONTACTS'
  const audienceLimit = Form.useWatch('audienceLimit', form) as number | undefined
  const marketingTopic = 'general'
  const recentSince = Form.useWatch('recentSince', form) as dayjs.Dayjs | undefined
  const recentDirection = Form.useWatch('recentDirection', form) as string | undefined
  const productSource = Form.useWatch('productSource', form) as string | undefined
  const ticketStatusIds = Form.useWatch('ticketStatusIds', form) as string[] | undefined

  useEffect(() => {
    if (!open) return
    const criteria = (campaign?.audienceCriteria ?? {}) as Record<string, unknown>
    const productIds = Array.isArray(criteria.productIds) ? criteria.productIds.map(String) : []
    const assignments = campaign?.templateAssignments ?? []

    if (campaign) {
      form.setFieldsValue({
        name: campaign.name,
        audienceType: campaign.audienceType ?? 'RECENT_CONTACTS',
        recentSince:
          typeof criteria.since === 'string' ? dayjs(criteria.since) : dayjs().subtract(30, 'day'),
        recentDirection: typeof criteria.direction === 'string' ? criteria.direction : 'ANY',
        productSource: typeof criteria.source === 'string' ? criteria.source : 'BOTH',
        ticketStatusIds: Array.isArray(criteria.statusIds) ? criteria.statusIds.map(String) : [],
        audienceLimit: campaign.audienceLimit ?? undefined,
        startDate: campaign.startDate ? dayjs(campaign.startDate) : undefined,
      })
      setSelectedProducts(productIds.map(placeholderProduct))
      setBlocks(
        assignments.length > 0
          ? assignments.map((assignment) => ({
              id: crypto.randomUUID(),
              allLanguages: assignment.allLanguages,
              languageCodes: assignment.languageCodes ?? [],
              template: templateFromAssignment(socialAccountId, assignment),
              variableValues: assignment.variableValues ?? {},
              mpmProducts: (assignment.mpmProductRetailerIds ?? []).map(placeholderProduct),
            }))
          : [newBlock()],
      )
      return
    }

    form.resetFields()
    setSelectedProducts([])
    setBlocks([newBlock()])
  }, [campaign, form, open, socialAccountId])

  const catalogsQuery = $api.useQuery(
    'get',
    '/catalog/org/{organisationId}',
    { params: { path: { organisationId: orgSlug } } },
    { enabled: open },
  )

  const statusesQuery = $api.useQuery(
    'get',
    '/ticket/org/{organisationId}/statuses',
    { params: { path: { organisationId: orgSlug } } },
    { enabled: open },
  )
  const ticketStatuses = (statusesQuery.data ?? []) as TicketStatusOption[]
  const catalogs = (catalogsQuery.data ?? []) as Catalog[]
  const mpmCatalogs = useMemo(
    () =>
      catalogs.filter(
        (catalog) =>
          !!catalog.providerId &&
          catalog.socialAccounts?.some((link) => link.socialAccount.id === socialAccountId),
      ),
    [catalogs, socialAccountId],
  )
  const mpmPickerBlock = blocks.find((block) => block.id === mpmPickerBlockId)

  const audienceCriteria = useMemo(() => {
    if (audienceType === 'PRODUCT_INTEREST') {
      return {
        productIds: selectedProducts.map((product) => product.id),
        source: productSource ?? 'BOTH',
      }
    }
    if (audienceType === 'TICKET_STATUS') {
      return { statusIds: ticketStatusIds ?? [] }
    }
    return {
      since: (recentSince ?? dayjs().subtract(30, 'day')).toISOString(),
      direction: recentDirection ?? 'ANY',
    }
  }, [audienceType, productSource, recentDirection, recentSince, selectedProducts, ticketStatusIds])

  const [previewData, setPreviewData] = useState<CampaignAudiencePreview | null>(null)
  const previewMutation = $api.useMutation(
    'post',
    '/loyalty/campaigns/account/{socialAccountId}/audience-preview',
  )
  const previewEnabled =
    open &&
    (audienceType !== 'PRODUCT_INTEREST' || selectedProducts.length > 0) &&
    (audienceType !== 'TICKET_STATUS' || !!ticketStatusIds?.length)
  const previewPayloadKey = useMemo(
    () => JSON.stringify({ audienceType, audienceCriteria, audienceLimit, marketingTopic }),
    [audienceCriteria, audienceLimit, audienceType, marketingTopic],
  )

  useEffect(() => {
    if (!previewEnabled) {
      setPreviewData(null)
      return
    }

    let cancelled = false
    previewMutation
      .mutateAsync({
        params: { path: { socialAccountId } },
        body: { audienceType, audienceCriteria, audienceLimit, marketingTopic },
      })
      .then((data) => {
        if (!cancelled) setPreviewData(data as unknown as CampaignAudiencePreview)
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null)
      })

    return () => {
      cancelled = true
    }
  }, [
    audienceCriteria,
    audienceLimit,
    audienceType,
    marketingTopic,
    previewEnabled,
    previewPayloadKey,
    socialAccountId,
  ])

  const languageOptions = (previewData?.languages ?? []).map((item) => ({
    value: item.code,
    label: `${item.code} (${item.count})`,
  }))
  const audienceOptions = useMemo(
    () => [
      { value: 'RECENT_CONTACTS', label: t('loyalty.campaign_audience_recent') },
      { value: 'PRODUCT_INTEREST', label: t('loyalty.campaign_audience_product_interest') },
      { value: 'TICKET_STATUS', label: t('loyalty.campaign_audience_ticket_status') },
    ],
    [t],
  )
  const contactTags = useMemo(
    () => [
      { value: 'Nom', label: t('loyalty.campaign_contact_tag_name') },
      { value: 'Prénom', label: t('loyalty.campaign_contact_tag_first_name') },
      { value: 'Nom complet', label: t('loyalty.campaign_contact_tag_full_name') },
    ],
    [t],
  )
  const allLanguagesSelected = blocks.some((block) => block.allLanguages)
  const usedLanguages = new Set(blocks.flatMap((block) => block.languageCodes))

  const handleTemplateChange = (blockId: string, template: LoyaltyTemplate) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? {
              ...block,
              template,
              variableValues: Object.fromEntries(
                template.variables.map((variable) => [
                  variable,
                  block.variableValues[variable] ?? '',
                ]),
              ),
              mpmProducts: templateHasMpmButton(template) ? block.mpmProducts : [],
            }
          : block,
      ),
    )
  }

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const maxEligible = previewData?.maxEligible ?? 0
      if (values.audienceLimit > maxEligible) {
        form.setFields([
          { name: 'audienceLimit', errors: [t('loyalty.campaign_audience_limit_error')] },
        ])
        return
      }
      if (
        blocks.some(
          (block) => !block.template || (!block.allLanguages && block.languageCodes.length === 0),
        )
      ) {
        return
      }
      const invalidMpmBlock = blocks.find(
        (block) => templateHasMpmButton(block.template) && block.mpmProducts.length === 0,
      )
      if (invalidMpmBlock) {
        message.error(t('loyalty.campaign_mpm_products_required'))
        return
      }
      const oversizedMpmBlock = blocks.find((block) => block.mpmProducts.length > MAX_MPM_PRODUCTS)
      if (oversizedMpmBlock) {
        message.error(t('loyalty.campaign_mpm_products_limit', { max: MAX_MPM_PRODUCTS }))
        return
      }

      const assignments: CampaignTemplateSelection[] = blocks.map((block) => ({
        allLanguages: block.allLanguages,
        languageCodes: block.allLanguages ? undefined : block.languageCodes,
        metaTemplateId: block.template!.id,
        metaTemplateName: block.template!.name,
        metaTemplateLanguage: block.template!.language,
        metaTemplateCategory: block.template!.category,
        body: block.template!.body,
        variableValues: block.variableValues,
        mpmProductRetailerIds: templateHasMpmButton(block.template)
          ? block.mpmProducts.map((product) => product.retailerId ?? product.id)
          : undefined,
      }))
      const first = assignments[0]

      onSubmit({
        socialAccountId,
        origin: 'GENERAL',
        name: values.name,
        frequency: 'ONCE',
        marketingTopic: 'general',
        audienceType,
        audienceCriteria,
        audienceLimit: values.audienceLimit,
        templateAssignments: assignments,
        metaTemplateId: first.metaTemplateId,
        metaTemplateName: first.metaTemplateName,
        metaTemplateLanguage: first.metaTemplateLanguage,
        startDate: values.startDate.toISOString(),
      })
    })
  }

  return (
    <>
      <Modal
        title={
          campaign
            ? t('loyalty.campaign_general_edit_title')
            : t('loyalty.campaign_general_create_title')
        }
        open={open}
        onCancel={onClose}
        width={704}
        wrapClassName="campaign-modal-wrap"
        className="campaign-modal"
        style={{ top: 24 }}
        styles={{
          content: {
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100dvh - 48px)',
          },
          body: {
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          },
          header: { flex: '0 0 auto' },
          footer: { flex: '0 0 auto' },
        }}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-text-muted">
              {previewMutation.isPending
                ? t('loyalty.campaign_audience_loading')
                : t('loyalty.campaign_eligible_contacts', {
                    count: previewData?.maxEligible ?? 0,
                  })}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                {campaign ? t('common.edit') : t('common.create')}
              </Button>
            </div>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            audienceType: 'RECENT_CONTACTS',
            recentSince: dayjs().subtract(30, 'day'),
            recentDirection: 'ANY',
            productSource: 'BOTH',
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label={t('loyalty.campaign_name')} name="name" rules={[{ required: true }]}>
              <Input placeholder={t('loyalty.campaign_general_name_placeholder')} />
            </Form.Item>
            <Form.Item
              label={t('loyalty.campaign_start_date')}
              name="startDate"
              rules={[{ required: true }]}
            >
              <DatePicker className="w-full" showTime format="DD/MM/YYYY HH:mm" />
            </Form.Item>
          </div>

          <Form.Item label={t('loyalty.campaign_audience')} name="audienceType">
            <Segmented className="pricing-billing-toggle" options={audienceOptions} />
          </Form.Item>

          {audienceType === 'RECENT_CONTACTS' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Form.Item label={t('loyalty.campaign_recent_direction')} name="recentDirection">
                <Select
                  options={[
                    { value: 'ANY', label: t('loyalty.campaign_recent_any') },
                    { value: 'INBOUND', label: t('loyalty.campaign_recent_inbound') },
                    { value: 'OUTBOUND', label: t('loyalty.campaign_recent_outbound') },
                  ]}
                />
              </Form.Item>
              <Form.Item label={t('loyalty.campaign_recent_since')} name="recentSince">
                <DatePicker className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
            </div>
          )}

          {audienceType === 'PRODUCT_INTEREST' && (
            <div className="mb-4">
              <Form.Item label={t('loyalty.campaign_product_source')} name="productSource">
                <Select
                  options={[
                    { value: 'BOTH', label: t('loyalty.campaign_product_source_both') },
                    { value: 'CUSTOMER', label: t('loyalty.campaign_product_source_customer') },
                    { value: 'BUSINESS', label: t('loyalty.campaign_product_source_business') },
                  ]}
                />
              </Form.Item>
              <TemplateEmptyLike
                title={
                  selectedProducts.length === 0
                    ? t('loyalty.campaign_no_products')
                    : t('loyalty.campaign_products_selected', {
                        count: selectedProducts.length,
                      })
                }
                description={t('loyalty.campaign_products_interest_hint')}
                buttonLabel={t('loyalty.campaign_product_select')}
                onClick={() => setProductPickerOpen(true)}
              />
            </div>
          )}

          {audienceType === 'TICKET_STATUS' && (
            <Form.Item label={t('loyalty.campaign_ticket_statuses')} name="ticketStatusIds">
              <Select
                mode="multiple"
                options={ticketStatuses.map((status) => ({
                  value: status.id,
                  label: status.name,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item
            label={t('loyalty.campaign_audience_limit')}
            name="audienceLimit"
            rules={[
              {
                validator: (_, value: number | undefined) => {
                  const max = previewData?.maxEligible ?? 0
                  if (value && value > max) {
                    return Promise.reject(new Error(t('loyalty.campaign_audience_limit_error')))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <InputNumber min={1} max={previewData?.maxEligible} className="w-full" />
          </Form.Item>

          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('loyalty.campaign_targeted_contacts')}
          </div>
          <div className="flex flex-col gap-3">
            {blocks.map((block, index) => (
              <div key={block.id} className="rounded-xl border border-border-subtle p-4">
                <div className="mb-5">
                  <Select
                    mode="multiple"
                    className="w-full"
                    placeholder={t('loyalty.campaign_contact_languages')}
                    value={block.allLanguages ? [ALL_LANGUAGES_VALUE] : block.languageCodes}
                    options={[
                      ...(blocks.length === 1
                        ? [
                            {
                              value: ALL_LANGUAGES_VALUE,
                              label: t('loyalty.campaign_all_languages'),
                            },
                          ]
                        : []),
                      ...languageOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                        disabled:
                          !block.allLanguages &&
                          usedLanguages.has(option.value) &&
                          !block.languageCodes.includes(option.value),
                      })),
                    ]}
                    optionRender={(option) => {
                      const value = String(option.value)
                      const checked =
                        value === ALL_LANGUAGES_VALUE
                          ? block.allLanguages
                          : block.languageCodes.includes(value)
                      return (
                        <div className="flex items-center gap-2">
                          <Checkbox checked={checked} />
                          <span>{option.label}</span>
                        </div>
                      )
                    }}
                    onChange={(languageCodes) =>
                      setBlocks((prev) =>
                        prev.map((item) => {
                          if (item.id !== block.id) return item
                          if (languageCodes.includes(ALL_LANGUAGES_VALUE)) {
                            return { ...item, allLanguages: true, languageCodes: [] }
                          }
                          return { ...item, allLanguages: false, languageCodes }
                        }),
                      )
                    }
                  />
                </div>
                <TemplateSelectField
                  socialAccountId={socialAccountId}
                  defaultFooter={defaultFooter}
                  value={block.template}
                  onChange={(template) => handleTemplateChange(block.id, template)}
                />
                {templateHasMpmButton(block.template) && (
                  <div className="mt-3">
                    {catalogsQuery.isLoading ? (
                      <div className="flex items-center justify-center rounded-lg border border-border-subtle py-6">
                        <Spin />
                      </div>
                    ) : mpmCatalogs.length === 0 ? (
                      <Alert
                        type="warning"
                        showIcon
                        message={t('loyalty.campaign_mpm_catalog_required')}
                      />
                    ) : (
                      <TemplateEmptyLike
                        title={
                          block.mpmProducts.length === 0
                            ? t('loyalty.campaign_no_products')
                            : t('loyalty.campaign_products_selected', {
                                count: block.mpmProducts.length,
                              })
                        }
                        description={t('loyalty.campaign_mpm_products_hint', {
                          max: MAX_MPM_PRODUCTS,
                        })}
                        buttonLabel={t('loyalty.campaign_product_select')}
                        onClick={() => setMpmPickerBlockId(block.id)}
                      />
                    )}
                  </div>
                )}
                {block.template?.variables.map((variable) => (
                  <div key={variable} className="mt-3">
                    <div className="mb-1 text-xs font-medium text-text-primary">
                      {t('loyalty.campaign_variable', { variable })}
                    </div>
                    <Input
                      value={block.variableValues[variable] ?? ''}
                      onChange={(event) =>
                        setBlocks((prev) =>
                          prev.map((item) =>
                            item.id === block.id
                              ? {
                                  ...item,
                                  variableValues: {
                                    ...item.variableValues,
                                    [variable]: event.target.value,
                                  },
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {contactTags.map((tag) => (
                        <Tag
                          key={tag.value}
                          bordered={false}
                          color="processing"
                          className="cursor-pointer"
                          onClick={() =>
                            setBlocks((prev) =>
                              prev.map((item) =>
                                item.id === block.id
                                  ? {
                                      ...item,
                                      variableValues: {
                                        ...item.variableValues,
                                        [variable]: `[${tag.value}]`,
                                      },
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {tag.label}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
                {index > 0 && (
                  <Button
                    danger
                    size="small"
                    className="mt-3"
                    icon={<Trash2 size={14} />}
                    onClick={() => setBlocks((prev) => prev.filter((item) => item.id !== block.id))}
                  >
                    {t('loyalty.campaign_delete_language_block')}
                  </Button>
                )}
              </div>
            ))}
            {!allLanguagesSelected && (
              <Button
                icon={<Plus size={14} />}
                onClick={() => setBlocks((prev) => [...prev, newBlock()])}
              >
                {t('loyalty.campaign_add_language_template')}
              </Button>
            )}
          </div>
        </Form>
      </Modal>

      <ProductPickerModal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSave={() => undefined}
        catalogs={catalogs}
        initialSelection={selectedProducts.map((product) => product.id)}
        onSaveProducts={setSelectedProducts}
      />
      <ProductPickerModal
        open={!!mpmPickerBlockId}
        onClose={() => setMpmPickerBlockId(null)}
        onSave={() => undefined}
        catalogs={mpmCatalogs}
        initialSelection={mpmPickerBlock?.mpmProducts.map((product) => product.id) ?? []}
        onSaveProducts={(products) => {
          const selected = products.slice(0, MAX_MPM_PRODUCTS)
          if (products.length > MAX_MPM_PRODUCTS) {
            message.warning(t('loyalty.campaign_mpm_products_limit', { max: MAX_MPM_PRODUCTS }))
          }
          setBlocks((prev) =>
            prev.map((block) =>
              block.id === mpmPickerBlockId ? { ...block, mpmProducts: selected } : block,
            ),
          )
        }}
      />
    </>
  )
}

function TemplateEmptyLike({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string
  description: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <div className="create-ticket-empty-section">
      <Megaphone size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
      <div className="text-sm font-medium text-text-primary">{title}</div>
      <div className="text-xs text-text-muted">{description}</div>
      <Button onClick={onClick} icon={<Plus size={16} />} className="mt-2">
        {buttonLabel}
      </Button>
    </div>
  )
}

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

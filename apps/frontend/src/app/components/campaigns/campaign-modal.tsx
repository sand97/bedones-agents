import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Segmented } from 'antd'
import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import {
  ProductPickerModal,
  type PickerProduct,
} from '@app/components/promotions/product-picker-modal'
import type {
  CampaignAudienceType,
  CampaignTemplateSelection,
  LoyaltyCampaign,
  LoyaltyTemplate,
} from '@app/lib/api/loyalty-api'
import type { Catalog } from '@app/lib/api/agent-api'
import { $api } from '@app/lib/api/$api'
import {
  MAX_MPM_PRODUCTS,
  TemplateEmptyLike,
  newBlock,
  placeholderProduct,
  templateFromAssignment,
  templateHasMpmButton,
  type CampaignFormPayload,
  type TemplateBlock,
  type TicketStatusOption,
} from './campaign-shared'
import { CampaignTemplateBlockCard } from './campaign-template-block-card'
import { useCampaignAudiencePreview } from './use-campaign-audience-preview'

export function CampaignModal({
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

  const previewEnabled =
    open &&
    (audienceType !== 'PRODUCT_INTEREST' || selectedProducts.length > 0) &&
    (audienceType !== 'TICKET_STATUS' || !!ticketStatusIds?.length)
  const { previewData, previewMutation } = useCampaignAudiencePreview({
    socialAccountId,
    audienceType,
    audienceCriteria,
    audienceLimit,
    marketingTopic,
    previewEnabled,
  })

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
              <CampaignTemplateBlockCard
                key={block.id}
                block={block}
                index={index}
                blocksCount={blocks.length}
                usedLanguages={usedLanguages}
                languageOptions={languageOptions}
                contactTags={contactTags}
                socialAccountId={socialAccountId}
                defaultFooter={defaultFooter}
                catalogsLoading={catalogsQuery.isLoading}
                mpmCatalogsEmpty={mpmCatalogs.length === 0}
                setBlocks={setBlocks}
                onTemplateChange={(template) => handleTemplateChange(block.id, template)}
                onOpenMpmPicker={() => setMpmPickerBlockId(block.id)}
              />
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

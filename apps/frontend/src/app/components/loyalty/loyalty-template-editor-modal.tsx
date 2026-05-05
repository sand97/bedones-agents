import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Upload,
} from 'antd'
import { Image as ImageIcon, Plus, Trash2, Video as VideoIcon } from 'lucide-react'
import { uploadChatMedia } from '@app/lib/api'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import {
  bodyToVariableKeys,
  findUnknownTokens,
  formatTemplateName,
  getTemplateVariables,
  metaPlaceholdersToTokens,
  tokensToMetaPlaceholders,
} from './loyalty-template-variables'
import {
  getTemplateButtonText,
  LoyaltyTemplatePreview,
  type ButtonType,
  type HeaderType,
  type PreviewButton,
} from './loyalty-template-preview'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
  /** Used as the default footer text when none is provided. */
  defaultFooter?: string
  editingTemplate?: LoyaltyTemplate | null
}

const MAX_BUTTONS = 10
const MAX_BUTTON_TEXT = 25
const MAX_HEADER_TEXT = 60
const MAX_FOOTER_TEXT = 60
const PRODUCT_TEMPLATE_BUTTON_TYPES: ButtonType[] = ['CATALOG', 'MPM']

interface ButtonDraft {
  type: ButtonType
  text: string
  url?: string
  phoneNumber?: string
}

function isProductTemplateButton(type: ButtonType) {
  return PRODUCT_TEMPLATE_BUTTON_TYPES.includes(type)
}

export function LoyaltyTemplateEditorModal({
  open,
  onClose,
  socialAccountId,
  defaultFooter,
  editingTemplate,
}: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const [headerType, setHeaderType] = useState<HeaderType>('NONE')
  // Local-only file kept until the user clicks Create. The preview uses a
  // blob: URL so we never hit the network until submission.
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null)
  const [headerMediaPreviewUrl, setHeaderMediaPreviewUrl] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [buttons, setButtons] = useState<ButtonDraft[]>([])
  const [footerTouched, setFooterTouched] = useState(false)

  const queryKey = ['loyalty-templates', socialAccountId]
  const isEditing = !!editingTemplate
  const liveCategory = (Form.useWatch('category', form) as string | undefined) ?? 'MARKETING'
  const defaultMarketingFooter = t('loyalty.default_marketing_footer')
  const accountFooter = defaultFooter?.trim() ?? ''
  const templateVariables = useMemo(() => getTemplateVariables(t), [t])
  const categoryOptions = [
    { value: 'MARKETING', label: t('loyalty.template_category_marketing') },
    { value: 'UTILITY', label: t('loyalty.template_category_utility') },
    { value: 'AUTHENTICATION', label: t('loyalty.template_category_authentication') },
  ]
  const languageOptions = [
    { value: 'fr', label: t('loyalty.template_language_fr') },
    { value: 'en', label: t('loyalty.template_language_en') },
  ]
  const headerTypeOptions: { value: HeaderType; label: string }[] = [
    { value: 'NONE', label: t('loyalty.header_type_none') },
    { value: 'TEXT', label: t('loyalty.header_type_text') },
    { value: 'IMAGE', label: t('loyalty.header_type_image') },
    { value: 'VIDEO', label: t('loyalty.header_type_video') },
  ]
  const buttonTypeOptions: { value: ButtonType; label: string }[] = [
    { value: 'QUICK_REPLY', label: t('loyalty.button_type_quick_reply') },
    { value: 'URL', label: t('loyalty.button_type_url') },
    { value: 'PHONE_NUMBER', label: t('loyalty.button_type_phone') },
    ...(liveCategory === 'MARKETING'
      ? [
          { value: 'CATALOG' as const, label: t('loyalty.button_type_catalog') },
          { value: 'MPM' as const, label: t('loyalty.button_type_mpm') },
        ]
      : []),
  ]

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string
      body: string
      variables: string[]
      language: string
      category: string
      headerType: HeaderType
      headerText?: string
      headerMediaUrl?: string
      footerText?: string
      buttons: ButtonDraft[]
    }) => loyaltyApi.createTemplate({ socialAccountId, ...payload }),
    onSuccess: (created) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      message.success(t('loyalty.template_created'))
      onClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string
      body: string
      variables: string[]
      language: string
      category: string
      headerType: HeaderType
      headerText?: string
      headerMediaUrl?: string
      footerText?: string
      buttons: ButtonDraft[]
    }) => loyaltyApi.updateTemplate(socialAccountId, editingTemplate!.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) =>
        (prev ?? []).map((tmpl) => (tmpl.id === updated.id ? { ...tmpl, ...updated } : tmpl)),
      )
      message.success(t('loyalty.template_updated'))
      onClose()
    },
  })

  // Revoke any blob: URL we created so we don't leak.
  const clearMediaPreview = () => {
    setHeaderMediaPreviewUrl((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return ''
    })
    setHeaderMediaFile(null)
  }

  useEffect(() => {
    if (!open) {
      form.resetFields()
      setHeaderType('NONE')
      clearMediaPreview()
      setButtons([])
      setFooterTouched(false)
    } else if (editingTemplate) {
      form.setFieldsValue({
        name: editingTemplate.name,
        language: editingTemplate.language,
        category: editingTemplate.category,
        body: metaPlaceholdersToTokens(editingTemplate.body, templateVariables),
        headerText: metaPlaceholdersToTokens(editingTemplate.headerText ?? '', templateVariables),
        footerText: editingTemplate.footerText,
      })
      setFooterTouched(true)
      setHeaderType((editingTemplate.headerType as HeaderType | undefined) ?? 'NONE')
      setButtons(
        (editingTemplate.buttons ?? []).map((button) => ({
          type: button.type as ButtonType,
          text: button.text,
          url: button.url,
          phoneNumber: button.phoneNumber,
        })),
      )
    } else {
      form.setFieldsValue({
        language: 'fr',
        category: 'MARKETING',
        footerText: defaultMarketingFooter,
      })
      setFooterTouched(false)
    }
    // We intentionally don't include clearMediaPreview in deps — its identity
    // changes every render but it's safe to use the latest closure here.
  }, [open, form, editingTemplate, defaultMarketingFooter, templateVariables])

  useEffect(() => {
    if (liveCategory === 'MARKETING') return
    setButtons((prev) => prev.filter((button) => !isProductTemplateButton(button.type)))
  }, [liveCategory])

  // Cleanup the blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (headerMediaPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(headerMediaPreviewUrl)
      }
    }
  }, [headerMediaPreviewUrl])

  // Live form values used by the preview pane.
  const liveBody = (Form.useWatch('body', form) as string | undefined) ?? ''
  const liveHeaderText = (Form.useWatch('headerText', form) as string | undefined) ?? ''
  const liveFooter = (Form.useWatch('footerText', form) as string | undefined) ?? ''
  const hasProductTemplateButton = buttons.some((button) => isProductTemplateButton(button.type))
  const hasMpmTemplateButton = buttons.some((button) => button.type === 'MPM')
  const hasReachedButtonLimit = buttons.length >= MAX_BUTTONS
  const canAddButton = !hasReachedButtonLimit && !hasProductTemplateButton
  const buttonHelpText = hasProductTemplateButton
    ? t('loyalty.buttons_product_locked_hint')
    : hasReachedButtonLimit
      ? t('loyalty.buttons_limit_reached', { max: MAX_BUTTONS })
      : t('loyalty.buttons_hint', { max: MAX_BUTTONS })

  const handleSubmit = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    if (hasMpmTemplateButton) {
      if (headerType === 'NONE') {
        message.error(t('loyalty.button_mpm_header_required_error'))
        return
      }
      if (headerType === 'TEXT' && !String(values.headerText ?? '').trim()) {
        form.setFields([
          { name: 'headerText', errors: [t('loyalty.button_mpm_header_text_required')] },
        ])
        return
      }
      if (
        (headerType === 'IMAGE' || headerType === 'VIDEO') &&
        !headerMediaFile &&
        !headerMediaPreviewUrl
      ) {
        message.error(t('loyalty.button_mpm_header_media_required'))
        return
      }
    }

    const tokenBody = values.body as string
    const metaBody = tokensToMetaPlaceholders(tokenBody)
    const headerText: string | undefined =
      headerType === 'TEXT' ? tokensToMetaPlaceholders(values.headerText ?? '') : undefined

    // Upload the media now (deferred until submission to avoid wasting bandwidth
    // on files the user might still discard).
    let mediaUrl: string | undefined
    if ((headerType === 'IMAGE' || headerType === 'VIDEO') && headerMediaFile) {
      setUploading(true)
      try {
        mediaUrl = await uploadChatMedia(headerMediaFile)
      } catch {
        message.error(t('upload.error'))
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    }

    // Reject button rows the user added but never filled in.
    const cleanButtons = buttons
      .map((button) => ({
        ...button,
        text: getTemplateButtonText(button.type, button.text).trim(),
      }))
      .filter((button) => button.text.length > 0)

    const payload = {
      name: values.name,
      body: metaBody,
      variables: bodyToVariableKeys(tokenBody),
      language: values.language ?? 'fr',
      category: values.category ?? 'MARKETING',
      headerType,
      headerText,
      headerMediaUrl: mediaUrl,
      footerText: (values.footerText as string | undefined)?.trim() || undefined,
      buttons: cleanButtons,
    }

    if (isEditing) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const insertToken = (token: string) => {
    const current = (form.getFieldValue('body') as string | undefined) ?? ''
    const sep = current.length > 0 && !/\s$/.test(current) ? ' ' : ''
    form.setFieldValue('body', `${current}${sep}[${token}]`)
    form.validateFields(['body']).catch(() => undefined)
  }

  const handleAddButton = () => {
    if (!canAddButton) return
    setButtons((prev) => [...prev, { type: 'QUICK_REPLY', text: '' }])
  }

  const updateButton = (index: number, patch: Partial<ButtonDraft>) => {
    setButtons((prev) => {
      const nextButton = { ...prev[index], ...patch }
      if (patch.type && isProductTemplateButton(patch.type)) {
        return [
          {
            type: patch.type,
            text: getTemplateButtonText(patch.type),
          },
        ]
      }
      if (patch.type && !isProductTemplateButton(patch.type)) {
        nextButton.text = isProductTemplateButton(prev[index]?.type) ? '' : (nextButton.text ?? '')
      }
      return prev.map((b, i) => (i === index ? nextButton : b))
    })
  }

  const removeButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index))
  }

  const previewButtons: PreviewButton[] = buttons
    .map((button) => ({
      ...button,
      text: getTemplateButtonText(button.type, button.text).trim(),
    }))
    .filter((button) => button.text.length > 0)

  return (
    <Modal
      title={isEditing ? t('loyalty.template_edit') : t('loyalty.template_create')}
      open={open}
      onCancel={onClose}
      width={960}
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
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={uploading || createMutation.isPending || updateMutation.isPending}
          >
            {isEditing ? t('common.save') : t('common.create')}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ─── Form column ─── */}
        <div>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ language: 'fr', category: 'MARKETING' }}
            onFinish={handleSubmit}
            className="pt-2"
          >
            <Form.Item
              label={t('loyalty.template_name')}
              name="name"
              rules={[{ required: true, message: t('promotions.required') }]}
              extra={t('loyalty.template_name_hint')}
            >
              <Input
                placeholder="welcome_loyalty_program"
                disabled={isEditing}
                onBlur={(e) => {
                  const formatted = formatTemplateName(e.target.value)
                  if (formatted !== e.target.value) form.setFieldValue('name', formatted)
                }}
              />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item label={t('loyalty.template_language')} name="language">
                <Select options={languageOptions} disabled={isEditing} />
              </Form.Item>
              <Form.Item label={t('loyalty.template_category')} name="category">
                <Select
                  options={categoryOptions}
                  onChange={(category) => {
                    const previousDefault =
                      liveCategory === 'MARKETING' ? defaultMarketingFooter : accountFooter
                    const currentFooter = String(form.getFieldValue('footerText') ?? '')
                    if (!footerTouched || currentFooter === previousDefault) {
                      form.setFieldValue(
                        'footerText',
                        category === 'MARKETING' ? defaultMarketingFooter : accountFooter,
                      )
                      setFooterTouched(false)
                    }
                    form.validateFields(['footerText']).catch(() => undefined)
                  }}
                />
              </Form.Item>
            </div>

            {/* ─── Section: Header ─── */}
            <Divider orientation="left" plain>
              {t('loyalty.section_header')}
            </Divider>

            <Form.Item label={t('loyalty.header_type')} required={hasMpmTemplateButton}>
              <Select
                value={headerType}
                onChange={(val) => {
                  setHeaderType(val)
                  if (val !== 'IMAGE' && val !== 'VIDEO') clearMediaPreview()
                  if (val !== 'TEXT') form.setFieldValue('headerText', undefined)
                }}
                options={headerTypeOptions}
              />
            </Form.Item>

            {headerType === 'TEXT' && (
              <Form.Item
                label={t('loyalty.header_text')}
                name="headerText"
                rules={[{ max: MAX_HEADER_TEXT }]}
              >
                <Input
                  placeholder={t('loyalty.header_text_placeholder')}
                  maxLength={MAX_HEADER_TEXT}
                  showCount
                />
              </Form.Item>
            )}

            {(headerType === 'IMAGE' || headerType === 'VIDEO') && (
              <Form.Item
                label={
                  headerType === 'IMAGE' ? t('loyalty.header_image') : t('loyalty.header_video')
                }
              >
                {headerMediaPreviewUrl ? (
                  <div className="flex items-center gap-3">
                    {headerType === 'IMAGE' ? (
                      <img
                        src={headerMediaPreviewUrl}
                        alt="header"
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ) : (
                      <video
                        src={headerMediaPreviewUrl}
                        className="h-20 w-32 rounded-lg object-cover"
                        muted
                      />
                    )}
                    <Button
                      size="small"
                      danger
                      icon={<Trash2 size={14} />}
                      onClick={clearMediaPreview}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ) : (
                  <Upload.Dragger
                    showUploadList={false}
                    accept={headerType === 'IMAGE' ? '.jpg,.jpeg,.png,.webp' : '.mp4,.mov'}
                    beforeUpload={(file) => {
                      // Stage the file locally, no network call yet.
                      // Actual upload happens on Create.
                      clearMediaPreview()
                      setHeaderMediaFile(file)
                      setHeaderMediaPreviewUrl(URL.createObjectURL(file))
                      return false
                    }}
                    customRequest={() => {}}
                  >
                    <div className="flex flex-col items-center gap-2 py-2">
                      {headerType === 'IMAGE' ? (
                        <ImageIcon size={24} className="text-text-muted" />
                      ) : (
                        <VideoIcon size={24} className="text-text-muted" />
                      )}
                      <span className="text-sm font-medium text-text-primary">
                        {headerType === 'IMAGE'
                          ? t('loyalty.header_upload_image')
                          : t('loyalty.header_upload_video')}
                      </span>
                    </div>
                  </Upload.Dragger>
                )}
              </Form.Item>
            )}

            {/* ─── Section: Body ─── */}
            <Divider orientation="left" plain>
              {t('loyalty.section_body')}
            </Divider>

            <Form.Item
              label={t('loyalty.template_body')}
              name="body"
              rules={[
                { required: true, message: t('promotions.required') },
                {
                  validator: (_, value: string) => {
                    const unknown = findUnknownTokens(value ?? '')
                    if (unknown.length === 0) return Promise.resolve()
                    return Promise.reject(
                      new Error(
                        t('loyalty.template_unknown_variables', {
                          tokens: unknown.map((tok) => `[${tok}]`).join(', '),
                        }),
                      ),
                    )
                  },
                },
              ]}
              extra={t('loyalty.template_body_hint')}
            >
              <Input.TextArea rows={5} placeholder={t('loyalty.template_body_placeholder')} />
            </Form.Item>

            <div className="mb-4 flex flex-wrap gap-1">
              {templateVariables.map((v) => (
                <Tooltip
                  key={v.key}
                  title={
                    <div className="flex flex-col gap-1">
                      <span>{v.description}</span>
                      <span className="text-xs opacity-80">
                        {t('loyalty.template_variable_example')}: {v.example}
                      </span>
                    </div>
                  }
                >
                  <Tag
                    bordered={false}
                    color="processing"
                    className="cursor-pointer"
                    onClick={() => insertToken(v.token)}
                  >
                    + [{v.token}]
                  </Tag>
                </Tooltip>
              ))}
            </div>

            <Form.Item
              label={t('loyalty.footer_text')}
              name="footerText"
              rules={[
                { max: MAX_FOOTER_TEXT },
                {
                  validator: (_, value: string | undefined) => {
                    if (liveCategory !== 'MARKETING') return Promise.resolve()
                    const footer = value?.trim() ?? ''
                    if (!footer.includes('STOP')) {
                      return Promise.reject(new Error(t('loyalty.footer_stop_required')))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
              extra={t('loyalty.footer_text_hint')}
            >
              <Input
                placeholder={t('loyalty.footer_text_placeholder')}
                maxLength={MAX_FOOTER_TEXT}
                showCount
                onChange={() => setFooterTouched(true)}
              />
            </Form.Item>

            {/* ─── Section: Buttons ─── */}
            <Divider orientation="left" plain>
              {t('loyalty.section_buttons')}
            </Divider>

            <div className="flex flex-col gap-2">
              {buttons.map((btn, i) => {
                const hasFixedLabel = isProductTemplateButton(btn.type)
                const fixedLabel = getTemplateButtonText(btn.type)

                return (
                  <div key={i} className="flex flex-col gap-2">
                    <Space.Compact block>
                      <Select
                        value={btn.type}
                        onChange={(val: ButtonType) => updateButton(i, { type: val })}
                        options={buttonTypeOptions}
                        style={{ width: hasFixedLabel ? 'calc(100% - var(--height-input))' : 220 }}
                      />
                      {!hasFixedLabel && (
                        <Input
                          value={btn.text}
                          onChange={(e) => updateButton(i, { text: e.target.value })}
                          maxLength={MAX_BUTTON_TEXT}
                          showCount
                          placeholder={t('loyalty.button_text_placeholder')}
                        />
                      )}
                      <Button
                        danger
                        icon={<Trash2 size={14} />}
                        onClick={() => removeButton(i)}
                        className="loyalty-template-button-delete"
                      />
                    </Space.Compact>
                    {hasFixedLabel && (
                      <div className="text-xs text-text-muted">
                        {t('loyalty.button_fixed_label_hint', { label: fixedLabel })}
                      </div>
                    )}
                    {btn.type === 'MPM' && (
                      <Alert
                        type="info"
                        showIcon
                        message={t('loyalty.button_mpm_header_required_title')}
                        description={t('loyalty.button_mpm_header_required_desc')}
                      />
                    )}
                    {btn.type === 'URL' && (
                      <Input
                        addonBefore={t('loyalty.button_url')}
                        value={btn.url ?? ''}
                        onChange={(e) => updateButton(i, { url: e.target.value })}
                        placeholder="https://"
                      />
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <Input
                        addonBefore={t('loyalty.button_phone')}
                        value={btn.phoneNumber ?? ''}
                        onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                        placeholder="+237 6XX XXX XXX"
                      />
                    )}
                  </div>
                )
              })}

              <Button
                onClick={handleAddButton}
                icon={<Plus size={14} />}
                disabled={!canAddButton}
                className="self-start"
              >
                {t('loyalty.add_button')}
              </Button>
              <div className="text-xs text-text-muted">{buttonHelpText}</div>
              {liveCategory === 'MARKETING' && !hasProductTemplateButton && (
                <div className="text-xs text-text-muted">{t('loyalty.product_buttons_hint')}</div>
              )}
            </div>
          </Form>
        </div>

        {/* ─── Preview column ─── */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('loyalty.preview_title')}
          </div>
          <div className="text-xs text-text-muted mb-3">{t('loyalty.preview_hint')}</div>
          <LoyaltyTemplatePreview
            headerType={headerType}
            headerText={liveHeaderText}
            headerMediaUrl={headerMediaPreviewUrl}
            body={liveBody}
            footerText={liveFooter}
            buttons={previewButtons}
          />
        </div>
      </div>
    </Modal>
  )
}

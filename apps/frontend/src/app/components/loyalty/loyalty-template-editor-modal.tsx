import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Divider, Form, Input, Modal, Select, Spin, Tag, Tooltip, Upload } from 'antd'
import { Image as ImageIcon, Plus, Trash2, Video as VideoIcon } from 'lucide-react'
import { uploadChatMedia } from '@app/lib/api'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import {
  TEMPLATE_VARIABLES,
  bodyToVariableKeys,
  findUnknownTokens,
  formatTemplateName,
  tokensToMetaPlaceholders,
} from './loyalty-template-variables'
import {
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
}

const CATEGORY_OPTIONS = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utility' },
]

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

const HEADER_TYPE_OPTIONS: { value: HeaderType; label: string }[] = [
  { value: 'NONE', label: 'Aucun' },
  { value: 'TEXT', label: 'Texte' },
  { value: 'IMAGE', label: 'Photo' },
  { value: 'VIDEO', label: 'Vidéo' },
]

const BUTTON_TYPE_OPTIONS: { value: ButtonType; label: string }[] = [
  { value: 'QUICK_REPLY', label: 'Réponse rapide' },
  { value: 'URL', label: 'Lien (URL)' },
  { value: 'PHONE_NUMBER', label: 'Appel téléphonique' },
]

const MAX_BUTTONS = 10
const MAX_BUTTON_TEXT = 25
const MAX_HEADER_TEXT = 60
const MAX_FOOTER_TEXT = 60

interface ButtonDraft {
  type: ButtonType
  text: string
  url?: string
  phoneNumber?: string
}

export function LoyaltyTemplateEditorModal({
  open,
  onClose,
  socialAccountId,
  defaultFooter,
}: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const [headerType, setHeaderType] = useState<HeaderType>('NONE')
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [buttons, setButtons] = useState<ButtonDraft[]>([])

  const queryKey = ['loyalty-templates', socialAccountId]

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

  useEffect(() => {
    if (!open) {
      form.resetFields()
      setHeaderType('NONE')
      setHeaderMediaUrl('')
      setButtons([])
    } else if (defaultFooter) {
      form.setFieldValue('footerText', defaultFooter)
    }
  }, [open, form, defaultFooter])

  // Live form values used by the preview pane.
  const liveBody = (Form.useWatch('body', form) as string | undefined) ?? ''
  const liveHeaderText = (Form.useWatch('headerText', form) as string | undefined) ?? ''
  const liveFooter = (Form.useWatch('footerText', form) as string | undefined) ?? ''

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const tokenBody = values.body as string
      const metaBody = tokensToMetaPlaceholders(tokenBody)
      const headerText: string | undefined =
        headerType === 'TEXT' ? tokensToMetaPlaceholders(values.headerText ?? '') : undefined
      const mediaUrl: string | undefined =
        headerType === 'IMAGE' || headerType === 'VIDEO' ? headerMediaUrl || undefined : undefined

      // Reject button rows the user added but never filled in.
      const cleanButtons = buttons.filter((b) => b.text.trim().length > 0)

      createMutation.mutate({
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
      })
    })
  }

  const insertToken = (token: string) => {
    const current = (form.getFieldValue('body') as string | undefined) ?? ''
    const sep = current.length > 0 && !/\s$/.test(current) ? ' ' : ''
    form.setFieldValue('body', `${current}${sep}[${token}]`)
    form.validateFields(['body']).catch(() => undefined)
  }

  const handleAddButton = () => {
    if (buttons.length >= MAX_BUTTONS) return
    setButtons((prev) => [...prev, { type: 'QUICK_REPLY', text: '' }])
  }

  const updateButton = (index: number, patch: Partial<ButtonDraft>) => {
    setButtons((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  const removeButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index))
  }

  const previewButtons: PreviewButton[] = buttons
    .filter((b) => b.text.trim().length > 0)
    .map((b) => ({ ...b }))

  return (
    <Modal
      title={t('loyalty.template_create')}
      open={open}
      onCancel={onClose}
      width={960}
      styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit} loading={createMutation.isPending}>
            {t('common.create')}
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
                onBlur={(e) => {
                  const formatted = formatTemplateName(e.target.value)
                  if (formatted !== e.target.value) form.setFieldValue('name', formatted)
                }}
              />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item label={t('loyalty.template_language')} name="language">
                <Select options={LANGUAGE_OPTIONS} />
              </Form.Item>
              <Form.Item label={t('loyalty.template_category')} name="category">
                <Select options={CATEGORY_OPTIONS} />
              </Form.Item>
            </div>

            {/* ─── Section: Header ─── */}
            <Divider orientation="left" plain>
              {t('loyalty.section_header')}
            </Divider>

            <Form.Item label={t('loyalty.header_type')}>
              <Select
                value={headerType}
                onChange={(val) => {
                  setHeaderType(val)
                  if (val !== 'IMAGE' && val !== 'VIDEO') setHeaderMediaUrl('')
                  if (val !== 'TEXT') form.setFieldValue('headerText', undefined)
                }}
                options={HEADER_TYPE_OPTIONS}
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
                {headerMediaUrl ? (
                  <div className="flex items-center gap-3">
                    {headerType === 'IMAGE' ? (
                      <img
                        src={headerMediaUrl}
                        alt="header"
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ) : (
                      <video
                        src={headerMediaUrl}
                        className="h-20 w-32 rounded-lg object-cover"
                        muted
                      />
                    )}
                    <Button
                      size="small"
                      danger
                      icon={<Trash2 size={14} />}
                      onClick={() => setHeaderMediaUrl('')}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ) : (
                  <Upload.Dragger
                    showUploadList={false}
                    accept={headerType === 'IMAGE' ? '.jpg,.jpeg,.png,.webp' : '.mp4,.mov'}
                    beforeUpload={async (file) => {
                      setUploading(true)
                      try {
                        const url = await uploadChatMedia(file)
                        setHeaderMediaUrl(url)
                      } catch {
                        message.error(t('upload.error'))
                      } finally {
                        setUploading(false)
                      }
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
                        {uploading
                          ? t('common.loading')
                          : headerType === 'IMAGE'
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
              {TEMPLATE_VARIABLES.map((v) => (
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
              rules={[{ max: MAX_FOOTER_TEXT }]}
              extra={t('loyalty.footer_text_hint')}
            >
              <Input
                placeholder={t('loyalty.footer_text_placeholder')}
                maxLength={MAX_FOOTER_TEXT}
                showCount
              />
            </Form.Item>

            {/* ─── Section: Buttons ─── */}
            <Divider orientation="left" plain>
              {t('loyalty.section_buttons')}
            </Divider>

            <div className="flex flex-col gap-2">
              {buttons.map((btn, i) => (
                <div
                  key={i}
                  className="flex items-end gap-2 rounded-md border border-border-subtle p-2"
                >
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-text-primary">
                        {t('loyalty.button_type')}
                      </div>
                      <Select
                        value={btn.type}
                        onChange={(val) => updateButton(i, { type: val })}
                        options={BUTTON_TYPE_OPTIONS}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-text-primary">
                        {t('loyalty.button_text')}
                      </div>
                      <Input
                        value={btn.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        maxLength={MAX_BUTTON_TEXT}
                        showCount
                        placeholder={t('loyalty.button_text_placeholder')}
                      />
                    </div>
                    {btn.type === 'URL' && (
                      <div className="col-span-2">
                        <div className="mb-1 text-xs font-medium text-text-primary">
                          {t('loyalty.button_url')}
                        </div>
                        <Input
                          value={btn.url ?? ''}
                          onChange={(e) => updateButton(i, { url: e.target.value })}
                          placeholder="https://"
                        />
                      </div>
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <div className="col-span-2">
                        <div className="mb-1 text-xs font-medium text-text-primary">
                          {t('loyalty.button_phone')}
                        </div>
                        <Input
                          value={btn.phoneNumber ?? ''}
                          onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                          placeholder="+237 6XX XXX XXX"
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    type="text"
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => removeButton(i)}
                  />
                </div>
              ))}

              <Button
                onClick={handleAddButton}
                icon={<Plus size={14} />}
                disabled={buttons.length >= MAX_BUTTONS}
                className="self-start"
              >
                {t('loyalty.add_button')}
              </Button>
              <div className="text-xs text-text-muted">
                {t('loyalty.buttons_hint', { max: MAX_BUTTONS })}
              </div>
            </div>
          </Form>
        </div>

        {/* ─── Preview column ─── */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('loyalty.preview_title')}
          </div>
          <div className="text-xs text-text-muted mb-3">{t('loyalty.preview_hint')}</div>
          {uploading ? (
            <div className="flex items-center justify-center py-12">
              <Spin />
            </div>
          ) : (
            <LoyaltyTemplatePreview
              headerType={headerType}
              headerText={liveHeaderText}
              headerMediaUrl={headerMediaUrl}
              body={liveBody}
              footerText={liveFooter}
              buttons={previewButtons}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

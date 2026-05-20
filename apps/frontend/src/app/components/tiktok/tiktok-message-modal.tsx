import { Alert, Form, Input, Modal, Select } from 'antd'
import { useTranslation } from 'react-i18next'

export type TikTokRichMessagePayload =
  | {
      tiktokMessageType: 'SHARE_POST'
      tiktokSharePostId: string
    }
  | {
      tiktokMessageType: 'TEMPLATE'
      tiktokTemplate: {
        type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
        title: string
        buttons: Array<{ type: 'REPLY'; title: string; id: string }>
      }
    }

type TikTokFormValues = {
  kind: 'SHARE_POST' | 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
  postId?: string
  title?: string
  button1?: string
  button2?: string
  button3?: string
}

interface TikTokMessageModalProps {
  open: boolean
  onClose: () => void
  onSend: (payload: TikTokRichMessagePayload) => Promise<void>
  loading?: boolean
}

export function TikTokMessageModal({ open, onClose, onSend, loading }: TikTokMessageModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm<TikTokFormValues>()
  const kind = Form.useWatch('kind', form) || 'SHARE_POST'
  const isTemplate = kind === 'QA_BUTTON_CARD' || kind === 'QA_LINK_CARD'

  const handleOk = async () => {
    const values = await form.validateFields()

    if (values.kind === 'SHARE_POST') {
      await onSend({
        tiktokMessageType: 'SHARE_POST',
        tiktokSharePostId: values.postId!.trim(),
      })
      form.resetFields()
      return
    }

    const buttons = [values.button1, values.button2, values.button3]
      .map((value, index) => ({
        type: 'REPLY' as const,
        title: value?.trim() || '',
        id: `answer_${index + 1}`,
      }))
      .filter((button) => button.title)

    await onSend({
      tiktokMessageType: 'TEMPLATE',
      tiktokTemplate: {
        type: values.kind,
        title: values.title!.trim(),
        buttons,
      },
    })
    form.resetFields()
  }

  return (
    <Modal
      title={t('chat.tiktok_modal_title')}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('common.send')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form<TikTokFormValues>
        form={form}
        layout="vertical"
        initialValues={{ kind: 'SHARE_POST' }}
        className="mt-2"
      >
        <Form.Item name="kind" label={t('chat.tiktok_message_kind')}>
          <Select
            options={[
              { value: 'SHARE_POST', label: t('chat.tiktok_share_post') },
              { value: 'QA_BUTTON_CARD', label: t('chat.tiktok_qa_button_card') },
              { value: 'QA_LINK_CARD', label: t('chat.tiktok_qa_link_card') },
            ]}
          />
        </Form.Item>

        {kind === 'SHARE_POST' ? (
          <Form.Item
            name="postId"
            label={t('chat.tiktok_post_id')}
            rules={[{ required: true, message: t('chat.tiktok_post_id_required') }]}
          >
            <Input placeholder={t('chat.tiktok_post_id_placeholder')} />
          </Form.Item>
        ) : (
          <>
            <Alert type="info" showIcon className="mb-3" message={t('chat.tiktok_template_hint')} />
            <Form.Item
              name="title"
              label={t('chat.tiktok_card_title')}
              rules={[
                { required: true, message: t('chat.tiktok_card_title_required') },
                { max: 40, message: t('chat.tiktok_card_title_limit') },
              ]}
            >
              <Input
                maxLength={40}
                showCount
                placeholder={t('chat.tiktok_card_title_placeholder')}
              />
            </Form.Item>

            <Form.Item
              name="button1"
              label={t('chat.tiktok_button_1')}
              rules={[
                { required: true, message: t('chat.tiktok_button_required') },
                {
                  max: kind === 'QA_BUTTON_CARD' ? 20 : 40,
                  message:
                    kind === 'QA_BUTTON_CARD'
                      ? t('chat.tiktok_button_card_limit')
                      : t('chat.tiktok_link_card_limit'),
                },
              ]}
            >
              <Input
                maxLength={kind === 'QA_BUTTON_CARD' ? 20 : 40}
                showCount
                placeholder={t('chat.tiktok_button_placeholder')}
              />
            </Form.Item>

            {isTemplate &&
              (['button2', 'button3'] as const).map((name, index) => (
                <Form.Item
                  key={name}
                  name={name}
                  label={t(`chat.tiktok_button_${index + 2}`)}
                  rules={[
                    {
                      max: kind === 'QA_BUTTON_CARD' ? 20 : 40,
                      message:
                        kind === 'QA_BUTTON_CARD'
                          ? t('chat.tiktok_button_card_limit')
                          : t('chat.tiktok_link_card_limit'),
                    },
                  ]}
                >
                  <Input
                    maxLength={kind === 'QA_BUTTON_CARD' ? 20 : 40}
                    showCount
                    placeholder={t('chat.tiktok_button_optional_placeholder')}
                  />
                </Form.Item>
              ))}
          </>
        )}
      </Form>
    </Modal>
  )
}

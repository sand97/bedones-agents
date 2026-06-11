import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, Typography, message as antdMessage } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { $api } from '@app/lib/api/$api'

const { Paragraph } = Typography

interface CustomerKnowledgeModalProps {
  conversationId: string
  open: boolean
  onClose: () => void
  /** Only admins may edit; everyone else sees the knowledge read-only. */
  canEdit: boolean
}

/**
 * Shows the durable "customer knowledge" the AI accumulated for a conversation
 * (one fact per line) and lets an admin curate it. The same notes feed both the
 * live agent (so it doesn't ask again) and the ticket agent (so orders are
 * complete), so editing here directly shapes what the AI knows.
 */
export function CustomerKnowledgeModal({
  conversationId,
  open,
  onClose,
  canEdit,
}: CustomerKnowledgeModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')

  const knowledgeQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{conversationId}/contact-notes',
    { params: { path: { conversationId } } },
    { enabled: open },
  )

  // Hydrate the editable buffer once per opening, so a background refetch never
  // clobbers what the admin is currently typing.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false
      return
    }
    if (!hydratedRef.current && knowledgeQuery.data) {
      setValue(knowledgeQuery.data.content ?? '')
      hydratedRef.current = true
    }
  }, [open, knowledgeQuery.data])

  const saveMutation = $api.useMutation(
    'put',
    '/messaging/conversations/{conversationId}/contact-notes',
  )

  const handleSave = async () => {
    try {
      const result = await saveMutation.mutateAsync({
        params: { path: { conversationId } },
        body: { content: value },
      })
      queryClient.setQueryData(
        [
          'get',
          '/messaging/conversations/{conversationId}/contact-notes',
          { params: { path: { conversationId } } },
        ],
        result,
      )
      antdMessage.success(t('chat.knowledge_saved'))
      onClose()
    } catch {
      antdMessage.error(t('chat.knowledge_save_error'))
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('chat.knowledge_title')}
      footer={
        canEdit
          ? [
              <Button key="cancel" onClick={onClose}>
                {t('common.cancel')}
              </Button>,
              <Button
                key="save"
                type="primary"
                loading={saveMutation.isPending}
                onClick={handleSave}
              >
                {t('common.save')}
              </Button>,
            ]
          : [
              <Button key="close" onClick={onClose}>
                {t('common.close')}
              </Button>,
            ]
      }
    >
      <Paragraph type="secondary" className="text-sm">
        {t('chat.knowledge_description')}
      </Paragraph>
      <Input.TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={!canEdit}
        disabled={knowledgeQuery.isLoading}
        autoSize={{ minRows: 6, maxRows: 16 }}
        placeholder={t('chat.knowledge_placeholder')}
      />
    </Modal>
  )
}

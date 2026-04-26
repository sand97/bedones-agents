import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Modal, Tag } from 'antd'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { LoyaltyTemplateEditorModal } from './loyalty-template-editor-modal'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
}

export function LoyaltyTemplateModal({ open, onClose, socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<LoyaltyTemplate | null>(null)

  const queryKey = useMemo(() => ['loyalty-templates', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listTemplates(socialAccountId),
    enabled: open && !!socialAccountId,
  })

  const syncMutation = useMutation({
    mutationFn: () => loyaltyApi.syncTemplates(socialAccountId),
    onSuccess: (templates) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, templates)
      message.success(t('loyalty.templates_synced'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await loyaltyApi.removeTemplate(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) =>
        (prev ?? []).filter((tmpl) => tmpl.id !== id),
      )
      message.success(t('common.delete'))
    },
  })

  const handleCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const handleEdit = (tmpl: LoyaltyTemplate) => {
    setEditing(tmpl)
    setEditorOpen(true)
  }

  const handleDelete = (tmpl: LoyaltyTemplate) => {
    Modal.confirm({
      title: t('loyalty.confirm_delete_template_title'),
      content: t('loyalty.confirm_delete_template_message', { name: tmpl.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(tmpl.id),
    })
  }

  const templates = data ?? []
  const showEmpty = !isLoading && templates.length === 0

  return (
    <>
      <Modal
        title={t('loyalty.templates_title')}
        open={open}
        onCancel={onClose}
        width={560}
        styles={{ body: { padding: showEmpty ? 0 : 16 } }}
        footer={
          showEmpty ? null : (
            <div className="flex items-center justify-end gap-2">
              <Button
                icon={<RefreshCw size={14} />}
                onClick={() => syncMutation.mutate()}
                loading={syncMutation.isPending}
              >
                {t('loyalty.templates_sync')}
              </Button>
              <Button type="primary" icon={<Plus size={14} />} onClick={handleCreate}>
                {t('loyalty.template_create')}
              </Button>
            </div>
          )
        }
      >
        {showEmpty ? (
          <SocialSetup
            icon={<WhatsAppIcon width={40} height={40} />}
            color="var(--color-brand-whatsapp)"
            title={t('loyalty.templates_empty_title')}
            description={t('loyalty.templates_empty_desc')}
            buttonLabel={t('loyalty.template_create')}
            buttonIcon={<Plus size={18} />}
            onAction={handleCreate}
            secondaryButtonLabel={t('loyalty.templates_sync_meta')}
            secondaryButtonIcon={<RefreshCw size={16} />}
            secondaryLoading={syncMutation.isPending}
            onSecondaryAction={() => syncMutation.mutate()}
          />
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="flex items-start gap-3 rounded-md border border-border-subtle p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text-primary">
                    {tmpl.name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{tmpl.body}</div>
                  <div className="mt-2 flex items-center gap-1">
                    <Tag bordered={false} color="default">
                      {tmpl.language}
                    </Tag>
                    <Tag bordered={false}>{tmpl.category}</Tag>
                    <Tag bordered={false}>{tmpl.status}</Tag>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button size="small" onClick={() => handleEdit(tmpl)}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<Trash2 size={12} />}
                    onClick={() => handleDelete(tmpl)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <LoyaltyTemplateEditorModal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        socialAccountId={socialAccountId}
        editingTemplate={editing}
      />
    </>
  )
}

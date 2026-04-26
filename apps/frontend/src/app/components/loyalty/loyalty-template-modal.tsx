import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Modal, Spin, Tag } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { LoyaltyTemplateEditorModal } from './loyalty-template-editor-modal'
import { metaPlaceholdersToTokens } from './loyalty-template-variables'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
}

/**
 * Templates are fetched live from Meta — never cached in our DB.
 * We use staleTime: Infinity so we don't hammer Meta on every modal open;
 * a manual refresh happens after create/delete via setQueryData / invalidate.
 */
export function LoyaltyTemplateModal({ open, onClose, socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)

  const queryKey = useMemo(() => ['loyalty-templates', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listTemplates(socialAccountId),
    enabled: open && !!socialAccountId,
    staleTime: Infinity,
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      await loyaltyApi.removeTemplate(socialAccountId, name)
      return name
    },
    onSuccess: (name) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) =>
        (prev ?? []).filter((tmpl) => tmpl.name !== name),
      )
      message.success(t('common.delete'))
    },
  })

  const handleDelete = (tmpl: LoyaltyTemplate) => {
    Modal.confirm({
      title: t('loyalty.confirm_delete_template_title'),
      content: t('loyalty.confirm_delete_template_message', { name: tmpl.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync({ name: tmpl.name }),
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
              <Button type="primary" icon={<Plus size={14} />} onClick={() => setEditorOpen(true)}>
                {t('loyalty.template_create')}
              </Button>
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : showEmpty ? (
          <SocialSetup
            icon={<WhatsAppIcon width={40} height={40} />}
            color="var(--color-brand-whatsapp)"
            title={t('loyalty.templates_empty_title')}
            description={t('loyalty.templates_empty_desc')}
            buttonLabel={t('loyalty.template_create')}
            buttonIcon={<Plus size={18} />}
            onAction={() => setEditorOpen(true)}
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
                  <div className="mt-1 line-clamp-2 text-xs text-text-secondary">
                    {metaPlaceholdersToTokens(tmpl.body)}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Tag bordered={false} color="default">
                      {tmpl.language}
                    </Tag>
                    <Tag bordered={false}>{tmpl.category}</Tag>
                    <Tag bordered={false}>{tmpl.status}</Tag>
                  </div>
                </div>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size={12} />}
                  onClick={() => handleDelete(tmpl)}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>

      <LoyaltyTemplateEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        socialAccountId={socialAccountId}
      />
    </>
  )
}

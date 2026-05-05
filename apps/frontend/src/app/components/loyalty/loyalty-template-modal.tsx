import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Modal, Spin } from 'antd'
import { Plus } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { LoyaltyTemplateEditorModal } from './loyalty-template-editor-modal'
import { LoyaltyTemplateListItem } from './loyalty-template-list-item'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
  /** Pre-fills the footer field of the create modal (typically the WhatsApp page name). */
  defaultFooter?: string
  onTemplateSelected?: (template: LoyaltyTemplate) => void
  selectedTemplateId?: string
}

/**
 * Templates are fetched live from Meta — never cached in our DB.
 * We use staleTime: Infinity so we don't hammer Meta on every modal open;
 * a manual refresh happens after create/delete via setQueryData / invalidate.
 */
export function LoyaltyTemplateModal({
  open,
  onClose,
  socialAccountId,
  defaultFooter,
  onTemplateSelected,
  selectedTemplateId,
}: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<LoyaltyTemplate | null>(null)

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

  const handleEdit = (tmpl: LoyaltyTemplate) => {
    setEditingTemplate(tmpl)
    setEditorOpen(true)
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setEditorOpen(true)
  }

  const handleSelect = (tmpl: LoyaltyTemplate) => {
    if (tmpl.status?.toUpperCase() !== 'APPROVED') {
      message.warning(t('loyalty.template_select_approved_only'))
      return
    }
    onTemplateSelected?.(tmpl)
    onClose()
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
              <Button type="primary" icon={<Plus size={14} />} onClick={handleCreate}>
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
            onAction={handleCreate}
          />
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {templates.map((tmpl) => (
              <LoyaltyTemplateListItem
                key={tmpl.id}
                template={tmpl}
                selected={selectedTemplateId === tmpl.id}
                selectionMode={!!onTemplateSelected}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </Modal>

      <LoyaltyTemplateEditorModal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingTemplate(null)
        }}
        socialAccountId={socialAccountId}
        defaultFooter={defaultFooter}
        editingTemplate={editingTemplate}
      />
    </>
  )
}

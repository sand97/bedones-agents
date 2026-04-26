import { Button, Modal, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { Bell, Trash2 } from 'lucide-react'
import type { Member } from './mock-data'

interface MemberActionsProps {
  member: Member
  onDelete?: (memberId: string) => Promise<void>
  onOpenNotifPrefs?: (member: Member) => void
}

export function MemberActions({ member, onDelete, onOpenNotifPrefs }: MemberActionsProps) {
  const { t } = useTranslation()

  const handleDelete = () => {
    Modal.confirm({
      title: t('members.confirm_delete'),
      content: t('members.confirm_delete_message', { name: member.name }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk() {
        return onDelete?.(member.id)
      },
    })
  }

  const isOwner = member.role === 'owner'

  return (
    <div className="flex items-center justify-end gap-2">
      <Tooltip title={t('notifications.table_action_title')}>
        <Button
          variant="outlined"
          size="small"
          icon={<Bell size={15} strokeWidth={1.5} />}
          onClick={() => onOpenNotifPrefs?.(member)}
        />
      </Tooltip>
      {!isOwner && (
        <Tooltip title={t('common.delete')}>
          <Button
            variant="outlined"
            size="small"
            danger
            icon={<Trash2 size={15} strokeWidth={1.5} />}
            onClick={handleDelete}
          />
        </Tooltip>
      )}
    </div>
  )
}

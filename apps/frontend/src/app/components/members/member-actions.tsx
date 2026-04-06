import { Button, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import type { Member } from './mock-data'

interface MemberActionsProps {
  member: Member
  onDelete?: (memberId: string) => Promise<void>
}

export function MemberActions({ member, onDelete }: MemberActionsProps) {
  const { t } = useTranslation()

  if (member.role === 'owner') {
    return null
  }

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

  return (
    <Button
      variant="outlined"
      size="small"
      danger
      icon={<Trash2 size={15} />}
      onClick={handleDelete}
    >
      {t('common.delete')}
    </Button>
  )
}

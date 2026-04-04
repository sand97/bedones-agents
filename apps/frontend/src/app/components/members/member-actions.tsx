import { Button, Modal } from 'antd'
import { Trash2 } from 'lucide-react'
import type { Member } from './mock-data'

interface MemberActionsProps {
  member: Member
  onDelete?: (memberId: string) => Promise<void>
}

export function MemberActions({ member, onDelete }: MemberActionsProps) {
  if (member.role === 'owner') {
    return null
  }

  const handleDelete = () => {
    Modal.confirm({
      title: 'Supprimer ce membre ?',
      content: `${member.name} sera retiré de l'organisation. Cette action est irréversible.`,
      okText: 'Supprimer',
      okType: 'danger',
      cancelText: 'Annuler',
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
      Supprimer
    </Button>
  )
}

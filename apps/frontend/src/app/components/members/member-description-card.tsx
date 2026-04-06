import { Descriptions } from 'antd'
import { useTranslation } from 'react-i18next'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import { MemberCell } from './member-cell'
import { MemberActions } from './member-actions'
import { MEMBER_ROLE_CONFIG, type Member } from './mock-data'

interface MemberDescriptionCardProps {
  member: Member
  onDelete?: (memberId: string) => Promise<void>
}

export function MemberDescriptionCard({ member, onDelete }: MemberDescriptionCardProps) {
  const { t } = useTranslation()
  const roleConfig = MEMBER_ROLE_CONFIG[member.role]
  const isInvited = member.status === 'invited'

  return (
    <Descriptions
      bordered
      column={2}
      size="small"
      layout="vertical"
      className="ticket-list-card-bordered"
    >
      <Descriptions.Item label="Infos membre" span={2}>
        <MemberCell member={member} />
      </Descriptions.Item>
      <Descriptions.Item label={t('members.role')}>
        <StatusTag label={roleConfig.label} color={roleConfig.color} />
      </Descriptions.Item>
      <Descriptions.Item label={t('members.status')}>
        <StatusTag
          label={isInvited ? t('members.invited') : t('members.active')}
          color={isInvited ? '#f59e0b' : '#10b981'}
        />
      </Descriptions.Item>
      <Descriptions.Item label={t('members.added_at')}>
        <span className="text-text-secondary">{formatDate(member.joinedAt)}</span>
      </Descriptions.Item>
      {member.role !== 'owner' && (
        <Descriptions.Item>
          <MemberActions member={member} onDelete={onDelete} />
        </Descriptions.Item>
      )}
    </Descriptions>
  )
}

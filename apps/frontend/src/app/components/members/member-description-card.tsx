import { Descriptions } from 'antd'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import { MemberCell } from './member-cell'
import { MemberActions } from './member-actions'
import { MEMBER_ROLE_CONFIG, type Member } from './mock-data'

export function MemberDescriptionCard({ member }: { member: Member }) {
  const roleConfig = MEMBER_ROLE_CONFIG[member.role]
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
      <Descriptions.Item label="Rôle">
        <StatusTag label={roleConfig.label} color={roleConfig.color} />
      </Descriptions.Item>
      <Descriptions.Item label="Ajouté le">
        <span className="text-text-secondary">{formatDate(member.joinedAt)}</span>
      </Descriptions.Item>
      <Descriptions.Item span={2}>
        <MemberActions />
      </Descriptions.Item>
    </Descriptions>
  )
}

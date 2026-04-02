import { Avatar } from 'antd'
import { User } from 'lucide-react'
import type { Member } from './mock-data'

export function MemberCell({ member }: { member: Member }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        size={32}
        icon={<User size={14} strokeWidth={1} />}
        style={{ background: member.avatarColor, color: '#fff', flexShrink: 0 }}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">{member.name}</div>
        <div className="truncate text-xs text-text-muted">{member.email}</div>
      </div>
    </div>
  )
}

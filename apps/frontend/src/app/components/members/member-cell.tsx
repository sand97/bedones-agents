import { Avatar, Button, message } from 'antd'
import { User, Copy } from 'lucide-react'
import type { Member } from './mock-data'

export function MemberCell({ member }: { member: Member }) {
  const copyInviteLink = () => {
    if (!member.inviteToken) return
    const link = `${window.location.origin}/invitation?token=${encodeURIComponent(member.inviteToken)}`
    navigator.clipboard.writeText(link)
    message.success("Lien d'invitation copié")
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar
        size={32}
        icon={<User size={14} strokeWidth={1} />}
        style={{ background: member.avatarColor, color: '#fff', flexShrink: 0 }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{member.name}</span>
          {member.status === 'invited' && member.inviteToken && (
            <Button
              type="link"
              size="small"
              icon={<Copy size={12} />}
              onClick={(e) => {
                e.stopPropagation()
                copyInviteLink()
              }}
              className="!p-0 !h-auto"
            >
              Copier l&apos;invitation
            </Button>
          )}
        </div>
        {member.phone && <div className="truncate text-xs text-text-muted">{member.phone}</div>}
      </div>
    </div>
  )
}

import { Avatar, Button, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { User, Copy } from 'lucide-react'
import type { Member } from './mock-data'

export function MemberCell({ member }: { member: Member }) {
  const { t } = useTranslation()
  const copyInviteLink = () => {
    if (!member.inviteToken) return
    const link = `${window.location.origin}/invitation?token=${encodeURIComponent(member.inviteToken)}`
    navigator.clipboard.writeText(link)
    message.success(t('members.invite_link_copied'))
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
              {t('members.copy_invite')}
            </Button>
          )}
        </div>
        {member.phone && <div className="truncate text-xs text-text-muted">{member.phone}</div>}
      </div>
    </div>
  )
}

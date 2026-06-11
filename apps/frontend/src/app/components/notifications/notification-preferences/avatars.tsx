import { useState } from 'react'
import { Popover } from 'antd'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
  TikTokIcon,
  MessengerIcon,
} from '@app/components/icons/social-icons'
import type {
  NotifMember,
  NotifSocialAccount,
  SocialProvider,
} from '../notification-preferences-api'
import { initialsOf, toneFor } from './helpers'

// ─── Avatar primitives ─────────────────────────────────────

export function Avatar({ user, size = 28 }: { user: NotifMember; size?: number }) {
  return (
    <span
      className="notif-modal__avatar"
      style={{
        width: size,
        height: size,
        background: toneFor(user.id),
        boxShadow: '0 0 0 2px var(--color-bg-surface)',
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
      title={user.name}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        initialsOf(user.name)
      )}
    </span>
  )
}

export function AvatarStack({
  users,
  size = 28,
  max = 4,
}: {
  users: NotifMember[]
  size?: number
  max?: number
}) {
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length
  return (
    <span className="notif-modal__avatar-stack">
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
          <Avatar user={u} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="notif-modal__avatar notif-modal__avatar--more"
          style={{
            width: size,
            height: size,
            marginLeft: -8,
            boxShadow: '0 0 0 2px var(--color-bg-surface)',
            fontSize: Math.max(9, Math.round(size * 0.34)),
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}

export function MiniStack({ users, max = 3 }: { users: NotifMember[]; max?: number }) {
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length
  return (
    <span className="notif-modal__stack-mini">
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar user={u} size={16} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="notif-modal__avatar notif-modal__avatar--more"
          style={{
            width: 16,
            height: 16,
            marginLeft: -6,
            fontSize: 8,
            boxShadow: '0 0 0 1.5px var(--color-bg-surface)',
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}

// ─── Header trigger (popover with member list) ─────────────

export function UsersPopoverTrigger({ users }: { users: NotifMember[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const single = users.length === 1

  const popover = (
    <div style={{ minWidth: 240 }}>
      <div className="notif-modal__users-pop-head">
        {users.length === 1
          ? t('notifications.selected_member')
          : t('notifications.selected_members')}
      </div>
      <ul className="notif-modal__users-pop-list">
        {users.map((u) => (
          <li key={u.id}>
            <Avatar user={u} size={28} />
            <div style={{ minWidth: 0 }}>
              <div className="notif-modal__users-pop-name">{u.name}</div>
              {u.email && <div className="notif-modal__users-pop-mail">{u.email}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <Popover
      content={popover}
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
    >
      <button type="button" className={'notif-modal__users-trigger ' + (open ? 'is-open' : '')}>
        {single ? (
          <>
            <Avatar user={users[0]} size={26} />
            <span className="notif-modal__users-trigger-name">{users[0].name}</span>
          </>
        ) : (
          <>
            <AvatarStack users={users} size={26} max={4} />
            <span className="notif-modal__users-trigger-name">
              {t('notifications.members_count', { count: users.length })}
            </span>
          </>
        )}
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>
    </Popover>
  )
}

// ─── Page avatar & network icons ───────────────────────────

export function PageAvatar({ page }: { page: NotifSocialAccount }) {
  const display = page.pageName || page.username || page.providerAccountId
  return (
    <span className="notif-modal__pageavatar" style={{ background: toneFor(page.id) }}>
      {page.profilePictureUrl ? (
        <img
          src={page.profilePictureUrl}
          alt={display}
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        initialsOf(display)
      )}
    </span>
  )
}

export function NetworkIcon({ provider, size = 14 }: { provider: SocialProvider; size?: number }) {
  const props = { width: size, height: size }
  switch (provider) {
    case 'FACEBOOK':
      return <FacebookIcon {...props} />
    case 'INSTAGRAM':
      return <InstagramIcon {...props} />
    case 'TIKTOK':
      return <TikTokIcon {...props} />
    case 'WHATSAPP':
      return <WhatsAppIcon {...props} />
  }
}

export function MessagingNetworkIcon({
  provider,
  size = 14,
}: {
  provider: SocialProvider
  size?: number
}) {
  // Messenger is shown for FACEBOOK in messaging context
  if (provider === 'FACEBOOK') return <MessengerIcon width={size} height={size} />
  return <NetworkIcon provider={provider} size={size} />
}

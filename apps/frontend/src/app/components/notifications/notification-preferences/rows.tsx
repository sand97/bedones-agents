import { useState } from 'react'
import { Popover } from 'antd'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus, Minus } from 'lucide-react'
import type {
  NotifMember,
  NotifSocialAccount,
  NotificationPreferenceRow,
  NotificationType,
} from '../notification-preferences-api'
import { NETWORK_LABEL, aggregateStatus, splitByStatus, type PendingMap } from './helpers'
import { Avatar, MessagingNetworkIcon, MiniStack, NetworkIcon, PageAvatar } from './avatars'

// ─── Page section (collapsible) ────────────────────────────

interface PageSectionProps {
  page: NotifSocialAccount
  group: 'comments' | 'messaging'
  defaultOpen?: boolean
  children: React.ReactNode
}

export function PageSection({ page, group, defaultOpen = false, children }: PageSectionProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const Icon = group === 'messaging' ? MessagingNetworkIcon : NetworkIcon
  const subLabel = `${
    group === 'comments'
      ? t('notifications.section_comments')
      : t('notifications.section_messaging')
  } ${NETWORK_LABEL[page.provider]}`
  const display = page.pageName || page.username || page.providerAccountId

  return (
    <div className="notif-modal__pageblock">
      <button
        type="button"
        className="notif-modal__section"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <PageAvatar page={page} />
        <div className="notif-modal__section-text">
          <div className="notif-modal__section-name">{display}</div>
          <div
            className="notif-modal__section-meta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon provider={page.provider} size={12} />
            {subLabel}
          </div>
        </div>
        <span className={'notif-modal__section-chevron ' + (open ? 'is-open' : '')}>
          <ChevronDown size={16} strokeWidth={1.75} />
        </span>
      </button>
      {open && <div className="notif-modal__pageblock-body">{children}</div>}
    </div>
  )
}

// ─── Mixed pill ────────────────────────────────────────────

function MixedActivePill({ onUsers, totalUsers }: { onUsers: NotifMember[]; totalUsers: number }) {
  const { t } = useTranslation()
  const popover = (
    <div style={{ minWidth: 220 }}>
      <div className="notif-modal__users-pop-head">{t('notifications.active_for_label')}</div>
      <ul className="notif-modal__users-pop-list">
        {onUsers.length === 0 && (
          <li style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            {t('notifications.active_for_no_member')}
          </li>
        )}
        {onUsers.map((u) => (
          <li key={u.id}>
            <Avatar user={u} size={22} />
            <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>{u.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <Popover content={popover} trigger="click" placement="bottom">
      <button type="button" className="notif-modal__mixedpill" onClick={(e) => e.stopPropagation()}>
        <span>{t('notifications.active_for', { on: onUsers.length, total: totalUsers })}</span>
        <ChevronDown size={11} strokeWidth={1.5} />
      </button>
    </Popover>
  )
}

// ─── Confirm popover for deactivate ────────────────────────

interface ConfirmPopoverProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  optionLabel: string
  pageLabel: string
  networkLabel: string
  users: NotifMember[]
  children: React.ReactNode
}

function ConfirmPopover({
  open,
  onClose,
  onConfirm,
  optionLabel,
  pageLabel,
  networkLabel,
  users,
  children,
}: ConfirmPopoverProps) {
  const { t } = useTranslation()
  const single = users.length === 1
  const content = (
    <div style={{ width: 280 }}>
      <div className="notif-modal__confirm-title">
        {t('notifications.confirm_title', { label: optionLabel })}
      </div>
      <div className="notif-modal__confirm-body">
        {single
          ? t('notifications.confirm_body_single', {
              name: users[0]?.name ?? '',
              label: optionLabel.toLowerCase(),
              network: networkLabel,
              page: pageLabel,
            })
          : t('notifications.confirm_body_multi', {
              label: optionLabel.toLowerCase(),
              network: networkLabel,
              page: pageLabel,
            })}
      </div>
      {!single && (
        <ul className="notif-modal__confirm-users">
          {users.map((u) => (
            <li key={u.id}>
              <Avatar user={u} size={20} />
              <span>{u.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="notif-modal__actionbtn"
          onClick={onClose}
          style={{ height: 30 }}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid transparent',
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {t('notifications.confirm_deactivate')}
        </button>
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      placement="top"
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      {children}
    </Popover>
  )
}

// ─── Actions row (Activer left / Désactiver right) ─────────

interface ActionsRowProps {
  status: 'on' | 'off' | 'mixed'
  members: NotifMember[]
  onUsers: NotifMember[]
  offUsers: NotifMember[]
  onActivate: (userIds: string[]) => void
  onDeactivate: (userIds: string[]) => void
  optionLabel: string
  pageLabel: string
  networkLabel: string
}

function ActionsRow({
  status,
  members,
  onUsers,
  offUsers,
  onActivate,
  onDeactivate,
  optionLabel,
  pageLabel,
  networkLabel,
}: ActionsRowProps) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const single = members.length === 1
  const hasActivate = status !== 'on'
  const hasDeactivate = status !== 'off'

  const activateTargets = offUsers.length ? offUsers : members
  const deactivateTargets = onUsers.length ? onUsers : members

  const activateBtn = (
    <button
      type="button"
      key="activate"
      className="notif-modal__actionbtn"
      onClick={() => onActivate(activateTargets.map((u) => u.id))}
    >
      <Plus size={12} strokeWidth={2} />
      <span>{t('notifications.activate_for')}</span>
      {single ? (
        <span style={{ fontWeight: 600 }}>{members[0].name.split(' ')[0]}</span>
      ) : (
        <MiniStack users={activateTargets} />
      )}
    </button>
  )

  const deactivateBtn = (
    <ConfirmPopover
      key="deactivate"
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={() => {
        onDeactivate(deactivateTargets.map((u) => u.id))
        setConfirmOpen(false)
      }}
      optionLabel={optionLabel}
      pageLabel={pageLabel}
      networkLabel={networkLabel}
      users={deactivateTargets}
    >
      <button
        type="button"
        className="notif-modal__actionbtn notif-modal__actionbtn--danger"
        onClick={() => setConfirmOpen(true)}
      >
        <Minus size={12} strokeWidth={2} />
        <span>{t('notifications.deactivate_for')}</span>
        {single ? (
          <span style={{ fontWeight: 600 }}>{members[0].name.split(' ')[0]}</span>
        ) : (
          <MiniStack users={deactivateTargets} />
        )}
      </button>
    </ConfirmPopover>
  )

  if (hasActivate && !hasDeactivate)
    return <div className="notif-modal__actions">{activateBtn}</div>
  if (!hasActivate && hasDeactivate)
    return <div className="notif-modal__actions">{deactivateBtn}</div>
  return (
    <div className="notif-modal__actions">
      {activateBtn}
      {deactivateBtn}
    </div>
  )
}

// ─── Row (one option) ──────────────────────────────────────

interface RowProps {
  page: NotifSocialAccount
  group: 'comments' | 'messaging'
  type: NotificationType
  members: NotifMember[]
  preferences: NotificationPreferenceRow[]
  pending: PendingMap
  onStage: (input: {
    userIds: string[]
    type: NotificationType
    enabled: boolean
    socialAccountId: string
  }) => void
}

export function Row({ page, group, type, members, preferences, pending, onStage }: RowProps) {
  const { t } = useTranslation()
  const status = aggregateStatus(preferences, pending, members, page.id, type)
  const { onUsers, offUsers } = splitByStatus(preferences, pending, members, page.id, type)
  const optionLabel = t(`notifications.types.${type.toLowerCase()}`)
  const optionSub = t(`notifications.types.${type.toLowerCase()}_desc`)
  const networkLabel =
    group === 'messaging' && page.provider === 'FACEBOOK'
      ? 'Messenger'
      : NETWORK_LABEL[page.provider]
  const pageLabel = page.pageName || page.username || page.providerAccountId

  return (
    <div className="notif-modal__row">
      <div className="notif-modal__row-text">
        <div className="notif-modal__row-label">
          {optionLabel}
          {status === 'mixed' && members.length > 1 && (
            <MixedActivePill onUsers={onUsers} totalUsers={members.length} />
          )}
        </div>
        <div className="notif-modal__row-sub">{optionSub}</div>
      </div>
      <ActionsRow
        status={status}
        members={members}
        onUsers={onUsers}
        offUsers={offUsers}
        onActivate={(userIds) =>
          onStage({ userIds, type, enabled: true, socialAccountId: page.id })
        }
        onDeactivate={(userIds) =>
          onStage({ userIds, type, enabled: false, socialAccountId: page.id })
        }
        optionLabel={optionLabel}
        pageLabel={pageLabel}
        networkLabel={networkLabel}
      />
    </div>
  )
}

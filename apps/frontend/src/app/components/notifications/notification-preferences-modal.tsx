import { useEffect, useMemo, useState } from 'react'
import { Modal, Popover, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronDown, Plus, Minus, X } from 'lucide-react'
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
  TikTokIcon,
  MessengerIcon,
} from '@app/components/icons/social-icons'
import {
  type NotifMember,
  type NotifSocialAccount,
  type NotificationPreferenceRow,
  type NotificationType,
  type SocialProvider,
  useBulkUpdateNotificationPreferenceMutation,
  useNotificationPreferencesQuery,
} from './notification-preferences-api'
import { TicketCollectionSelect } from './ticket-collection-select'
import { TicketStatusNotifications } from './ticket-status-notifications'

const NETWORK_LABEL: Record<SocialProvider, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  WHATSAPP: 'WhatsApp',
}

const TONES = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#111b21']

function toneFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

function initialsOf(name: string) {
  const parts = name.replace(/^@/, '').match(/\b[\p{L}]/gu) || ['•']
  return parts.slice(0, 2).join('').toUpperCase()
}

// New members start with every notification disabled — nothing is delivered
// until it's explicitly enabled, for any type.
function defaultEnabled(_type: NotificationType) {
  return false
}

type PendingMap = Record<string, boolean>

const pendingKey = (userId: string, socialAccountId: string, type: NotificationType) =>
  `${userId}|${socialAccountId}|${type}`

function effectiveEnabled(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  userId: string,
  socialAccountId: string,
  type: NotificationType,
) {
  const k = pendingKey(userId, socialAccountId, type)
  if (k in pending) return pending[k]
  const row = preferences.find(
    (p) => p.userId === userId && p.socialAccountId === socialAccountId && p.type === type,
  )
  return row ? row.enabled : defaultEnabled(type)
}

function aggregateStatus(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  members: NotifMember[],
  socialAccountId: string,
  type: NotificationType,
): 'on' | 'off' | 'mixed' {
  let on = 0
  let off = 0
  for (const m of members) {
    if (effectiveEnabled(preferences, pending, m.id, socialAccountId, type)) on++
    else off++
  }
  if (on === members.length) return 'on'
  if (off === members.length) return 'off'
  return 'mixed'
}

function splitByStatus(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  members: NotifMember[],
  socialAccountId: string,
  type: NotificationType,
) {
  const onUsers: NotifMember[] = []
  const offUsers: NotifMember[] = []
  for (const m of members) {
    if (effectiveEnabled(preferences, pending, m.id, socialAccountId, type)) onUsers.push(m)
    else offUsers.push(m)
  }
  return { onUsers, offUsers }
}

// ─── Avatar primitives ─────────────────────────────────────

function Avatar({ user, size = 28 }: { user: NotifMember; size?: number }) {
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

function AvatarStack({
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

function MiniStack({ users, max = 3 }: { users: NotifMember[]; max?: number }) {
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

function UsersPopoverTrigger({ users }: { users: NotifMember[] }) {
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

// ─── Page section (collapsible) ────────────────────────────

function PageAvatar({ page }: { page: NotifSocialAccount }) {
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

function NetworkIcon({ provider, size = 14 }: { provider: SocialProvider; size?: number }) {
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

function MessagingNetworkIcon({
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

interface PageSectionProps {
  page: NotifSocialAccount
  group: 'comments' | 'messaging'
  defaultOpen?: boolean
  children: React.ReactNode
}

function PageSection({ page, group, defaultOpen = false, children }: PageSectionProps) {
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
  organisationId: string
  onStage: (input: {
    userIds: string[]
    type: NotificationType
    enabled: boolean
    socialAccountId: string
  }) => void
}

function Row({
  page,
  group,
  type,
  members,
  preferences,
  pending,
  onStage,
  organisationId,
}: RowProps) {
  const { t } = useTranslation()
  const status = aggregateStatus(preferences, pending, members, page.id, type)
  const { onUsers, offUsers } = splitByStatus(preferences, pending, members, page.id, type)
  const isTicketType = type === 'MESSAGE_TICKET_CREATED'
  const memberPref = preferences.find(
    (p) => p.userId === members[0]?.id && p.socialAccountId === page.id && p.type === type,
  )
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
      {isTicketType && page.catalogId && members[0] && (
        <TicketCollectionSelect
          organisationId={organisationId}
          catalogId={page.catalogId}
          socialAccountId={page.id}
          userIds={members.map((m) => m.id)}
          type={type}
          enabled={memberPref?.enabled ?? true}
          value={memberPref?.collectionIds ?? []}
        />
      )}
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

// ─── Main modal ────────────────────────────────────────────

export interface NotificationPreferencesModalProps {
  open: boolean
  onClose: () => void
  organisationId: string
  members: NotifMember[]
}

export function NotificationPreferencesModal({
  open,
  onClose,
  organisationId,
  members,
}: NotificationPreferencesModalProps) {
  const { t } = useTranslation()
  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const query = useNotificationPreferencesQuery(organisationId, memberIds, { enabled: open })
  const mutation = useBulkUpdateNotificationPreferenceMutation(organisationId, memberIds)

  // Local stage of unsaved changes — { userId|socialAccountId|type: enabled }.
  // We commit them to the backend only on Save, then close. Reset on open/close.
  const [pending, setPending] = useState<PendingMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setPending({})
      setSaving(false)
    }
  }, [open])

  const renderMembers = query.data?.members ?? members

  const stage = (input: {
    userIds: string[]
    type: NotificationType
    enabled: boolean
    socialAccountId: string
  }) => {
    setPending((prev) => {
      const next = { ...prev }
      for (const uid of input.userIds) {
        next[pendingKey(uid, input.socialAccountId, input.type)] = input.enabled
      }
      return next
    })
  }

  const dirtyCount = Object.keys(pending).length

  const handleSave = async () => {
    if (dirtyCount === 0) {
      onClose()
      return
    }
    // Group pending changes by (socialAccountId, type, enabled) so we can hit
    // the bulk endpoint once per group with the matching userIds.
    const groups = new Map<
      string,
      { socialAccountId: string; type: NotificationType; enabled: boolean; userIds: string[] }
    >()
    for (const [k, enabled] of Object.entries(pending)) {
      const [userId, socialAccountId, type] = k.split('|') as [string, string, NotificationType]
      const groupKey = `${socialAccountId}|${type}|${enabled ? 1 : 0}`
      const existing = groups.get(groupKey)
      if (existing) existing.userIds.push(userId)
      else groups.set(groupKey, { socialAccountId, type, enabled, userIds: [userId] })
    }
    setSaving(true)
    try {
      await Promise.all(
        Array.from(groups.values()).map((g) =>
          mutation.mutateAsync({
            userIds: g.userIds,
            socialAccountId: g.socialAccountId,
            type: g.type,
            enabled: g.enabled,
          }),
        ),
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      closable={false}
      destroyOnClose
      className="notif-modal"
    >
      <div className="notif-modal__head">
        <div className="notif-modal__head-text">
          <div className="notif-modal__eyebrow">
            <Bell size={12} strokeWidth={1.25} />
            {t('notifications.eyebrow')}
          </div>
          <div className="notif-modal__title">
            <span className="notif-modal__title-prefix">{t('notifications.title_prefix')}</span>
            <UsersPopoverTrigger users={renderMembers} />
          </div>
        </div>
        <button
          type="button"
          className="notif-modal__close"
          aria-label={t('common.cancel')}
          onClick={onClose}
        >
          <X size={18} strokeWidth={1.25} />
        </button>
      </div>

      <div className="notif-modal__body">
        {query.isLoading && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin />
          </div>
        )}
        {query.data && (
          <>
            {query.data.commentSocialAccounts.map((page, idx) => (
              <PageSection
                key={`comments-${page.id}`}
                page={page}
                group="comments"
                defaultOpen={idx === 0}
              >
                {query.data.commentTypes.map((type) => (
                  <Row
                    key={type}
                    page={page}
                    group="comments"
                    type={type}
                    members={renderMembers}
                    preferences={query.data.preferences}
                    pending={pending}
                    organisationId={organisationId}
                    onStage={stage}
                  />
                ))}
              </PageSection>
            ))}
            {query.data.messagingSocialAccounts.map((page) => (
              <PageSection key={`messaging-${page.id}`} page={page} group="messaging">
                {query.data.messageTypes.map((type) => (
                  <Row
                    key={type}
                    page={page}
                    group="messaging"
                    type={type}
                    members={renderMembers}
                    preferences={query.data.preferences}
                    pending={pending}
                    organisationId={organisationId}
                    onStage={stage}
                  />
                ))}
                {query.data.ticketStatuses.length > 0 && (
                  <TicketStatusNotifications
                    organisationId={organisationId}
                    page={page}
                    userIds={renderMembers.map((m) => m.id)}
                    statuses={query.data.ticketStatuses}
                    rows={query.data.ticketStatusNotifications}
                  />
                )}
              </PageSection>
            ))}
          </>
        )}
      </div>

      <div className="notif-modal__foot">
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            className="notif-modal__actionbtn"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="notif-modal__actionbtn"
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            style={{
              background: 'var(--color-text-primary)',
              color: '#fff',
              borderColor: 'var(--color-text-primary)',
              opacity: saving || dirtyCount === 0 ? 0.6 : 1,
            }}
          >
            {saving ? <Spin size="small" /> : t('notifications.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

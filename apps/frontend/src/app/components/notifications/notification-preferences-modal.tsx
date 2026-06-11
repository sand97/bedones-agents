import { useEffect, useMemo, useState } from 'react'
import { Modal, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { Bell, X } from 'lucide-react'
import {
  type NotifMember,
  type NotificationType,
  useBulkUpdateNotificationPreferenceMutation,
  useNotificationPreferencesQuery,
} from './notification-preferences-api'
import { pendingKey, type PendingMap } from './notification-preferences/helpers'
import { UsersPopoverTrigger } from './notification-preferences/avatars'
import { PageSection, Row } from './notification-preferences/rows'

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
                    onStage={stage}
                  />
                ))}
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

import { useState, useMemo, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Modal, message } from 'antd'
import { Search, ChevronDown, UserPlus, Copy, Check } from 'lucide-react'
import { $api } from '@app/lib/api/$api'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { MemberDescriptionCard } from '@app/components/members/member-description-card'
import { InviteMemberModal } from '@app/components/members/invite-member-modal'
import { useMemberColumns } from '@app/components/members/member-columns'
import {
  mapApiMember,
  MEMBER_ROLE_CONFIG,
  ALL_ROLES,
  type MemberRole,
} from '@app/components/members/mock-data'

export const Route = createFileRoute('/app/$orgSlug/members')({
  component: MembersPage,
})

const DEFAULT_PAGE_SIZE = 8

const ROLE_FILTER_OPTIONS = ALL_ROLES.map((role) => ({
  key: role,
  label: MEMBER_ROLE_CONFIG[role].label,
  color: MEMBER_ROLE_CONFIG[role].color,
}))

function MembersPage() {
  const { t } = useTranslation()
  const { orgSlug } = Route.useParams()
  const { isDesktop } = useLayout()
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLinkModal, setInviteLinkModal] = useState<{
    open: boolean
    link: string
    name: string
  }>({ open: false, link: '', name: '' })
  const [copied, setCopied] = useState(false)

  const membersQuery = $api.useQuery('get', '/organisations/{orgId}/members', {
    params: { path: { orgId: orgSlug } },
  })

  const inviteMutation = $api.useMutation('post', '/organisations/{orgId}/members/invite')
  const deleteMutation = $api.useMutation('delete', '/organisations/{orgId}/members/{memberId}')

  const members = useMemo(
    () =>
      (membersQuery.data ?? []).map((m, i) =>
        mapApiMember(m as Parameters<typeof mapApiMember>[0], i),
      ),
    [membersQuery.data],
  )

  const invalidateMembers = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['get', '/organisations/{orgId}/members', { params: { path: { orgId: orgSlug } } }],
    })
  }, [queryClient, orgSlug])

  const handleInvite = async (values: {
    firstName: string
    lastName: string
    phone: string
    role: MemberRole
  }) => {
    try {
      const result = await inviteMutation.mutateAsync({
        params: { path: { orgId: orgSlug } },
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          role: values.role.toUpperCase() as 'ADMIN' | 'MEMBER',
        },
      })

      invalidateMembers()

      // Show the invite link modal
      const inviteToken = (result as unknown as { inviteToken?: string }).inviteToken
      if (inviteToken) {
        const link = `${window.location.origin}/invitation?token=${encodeURIComponent(inviteToken)}`
        setInviteLinkModal({
          open: true,
          link,
          name: `${values.firstName} ${values.lastName}`,
        })
        setCopied(false)
      } else {
        message.success(t('members.invitation_created'))
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('members.create_invitation_error')
      message.error(errorMessage)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLinkModal.link)
    setCopied(true)
    message.success(t('members.link_copied'))
  }

  const handleDelete = async (memberId: string) => {
    try {
      await deleteMutation.mutateAsync({
        params: { path: { orgId: orgSlug, memberId } },
      })
      message.success(t('members.member_deleted'))
      invalidateMembers()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('social.delete_error')
      message.error(errorMessage)
    }
  }

  const columns = useMemberColumns(handleDelete)

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role as MemberRole)
        ? prev.filter((r) => r !== role)
        : [...prev, role as MemberRole],
    )
    setCurrentPage(1)
  }

  const filteredMembers = useMemo(() => {
    let result = members

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || (m.phone && m.phone.includes(q)),
      )
    }

    if (selectedRoles.length > 0) {
      result = result.filter((m) => selectedRoles.includes(m.role))
    }

    return result
  }, [members, searchText, selectedRoles])

  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredMembers.slice(start, start + pageSize)
  }, [filteredMembers, currentPage, pageSize])

  const roleButtonLabel =
    selectedRoles.length > 0
      ? t('members.role_with_count', { count: selectedRoles.length })
      : t('members.role')

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('members.title')}
        action={
          <Button
            onClick={() => setInviteOpen(true)}
            icon={<UserPlus size={16} strokeWidth={1.5} />}
          >
            {t('common.add')}
          </Button>
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder={t('members.search_placeholder')}
            prefix={<Search size={16} className="text-text-muted" />}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setCurrentPage(1)
            }}
            allowClear
            className="tickets-filter-input"
          />
          <FilterPopover
            title={t('members.filter_role')}
            options={ROLE_FILTER_OPTIONS}
            selected={selectedRoles}
            onToggle={toggleRole}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{roleButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
        </div>

        {isDesktop ? (
          <Table
            dataSource={paginatedMembers}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
            loading={membersQuery.isLoading}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('members.no_members')}
              </div>
            ) : (
              paginatedMembers.map((member) => (
                <MemberDescriptionCard key={member.id} member={member} onDelete={handleDelete} />
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={filteredMembers.length}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="membre"
        />
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
      />

      {/* Invite link modal */}
      <Modal
        title={t('members.invitation_created')}
        open={inviteLinkModal.open}
        onCancel={() => setInviteLinkModal((prev) => ({ ...prev, open: false }))}
        footer={[
          <Button
            key="copy"
            type="primary"
            icon={copied ? <Check size={16} /> : <Copy size={16} />}
            onClick={handleCopyLink}
          >
            {copied ? t('common.copied') : t('members.copy_link')}
          </Button>,
        ]}
        width={520}
      >
        <div className="flex flex-col gap-3 py-2">
          <p className="text-sm text-text-secondary">
            {t('members.invitation_share_message', { name: inviteLinkModal.name })}
          </p>
          <Input.TextArea
            value={inviteLinkModal.link}
            readOnly
            autoSize={{ minRows: 2 }}
            className="!cursor-text"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      </Modal>
    </div>
  )
}

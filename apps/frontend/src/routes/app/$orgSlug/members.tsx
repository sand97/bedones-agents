import { useState, useMemo, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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
import { getMemberColumns } from '@app/components/members/member-columns'
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
        message.success('Invitation créée')
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erreur lors de la création de l'invitation"
      message.error(errorMessage)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLinkModal.link)
    setCopied(true)
    message.success('Lien copié')
  }

  const handleDelete = async (memberId: string) => {
    try {
      await deleteMutation.mutateAsync({
        params: { path: { orgId: orgSlug, memberId } },
      })
      message.success('Membre supprimé')
      invalidateMembers()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la suppression'
      message.error(errorMessage)
    }
  }

  const columns = useMemo(() => getMemberColumns(handleDelete), [orgSlug])

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

  const roleButtonLabel = selectedRoles.length > 0 ? `Rôle (${selectedRoles.length})` : 'Rôle'

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Membres"
        action={
          <Button
            onClick={() => setInviteOpen(true)}
            icon={<UserPlus size={16} strokeWidth={1.5} />}
          >
            Ajouter
          </Button>
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder="Rechercher par nom ou téléphone..."
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
            title="Filtrer par rôle"
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
                Aucun membre trouvé
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
        title="Invitation créée"
        open={inviteLinkModal.open}
        onCancel={() => setInviteLinkModal((prev) => ({ ...prev, open: false }))}
        footer={[
          <Button
            key="copy"
            type="primary"
            icon={copied ? <Check size={16} /> : <Copy size={16} />}
            onClick={handleCopyLink}
          >
            {copied ? 'Copié' : 'Copier le lien'}
          </Button>,
        ]}
        width={520}
      >
        <div className="flex flex-col gap-3 py-2">
          <p className="text-sm text-text-secondary">
            L&apos;invitation pour <strong>{inviteLinkModal.name}</strong> a été créée. Partagez ce
            lien pour qu&apos;il puisse rejoindre l&apos;organisation.
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

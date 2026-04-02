import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table, Input, Button } from 'antd'
import { Search, ChevronDown, UserPlus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { MemberDescriptionCard } from '@app/components/members/member-description-card'
import { InviteMemberModal } from '@app/components/members/invite-member-modal'
import { memberColumns } from '@app/components/members/member-columns'
import {
  MOCK_MEMBERS,
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
  const { isDesktop } = useLayout()
  const [searchText, setSearchText] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [inviteOpen, setInviteOpen] = useState(false)

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role as MemberRole)
        ? prev.filter((r) => r !== role)
        : [...prev, role as MemberRole],
    )
    setCurrentPage(1)
  }

  const filteredMembers = useMemo(() => {
    let result = MOCK_MEMBERS

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      )
    }

    if (selectedRoles.length > 0) {
      result = result.filter((m) => selectedRoles.includes(m.role))
    }

    return result
  }, [searchText, selectedRoles])

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
            placeholder="Rechercher par nom ou email..."
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
            columns={memberColumns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                Aucun membre trouvé
              </div>
            ) : (
              paginatedMembers.map((member) => (
                <MemberDescriptionCard key={member.id} member={member} />
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

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  )
}

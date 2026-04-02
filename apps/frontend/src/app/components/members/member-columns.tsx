import type { ColumnsType } from 'antd/es/table'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import { MemberCell } from './member-cell'
import { MemberActions } from './member-actions'
import { MEMBER_ROLE_CONFIG, type Member, type MemberRole } from './mock-data'

export const memberColumns: ColumnsType<Member> = [
  {
    title: 'Membre',
    key: 'member',
    ellipsis: true,
    render: (_: unknown, record: Member) => <MemberCell member={record} />,
  },
  {
    title: 'Rôle',
    dataIndex: 'role',
    key: 'role',
    width: 120,
    render: (role: MemberRole) => {
      const config = MEMBER_ROLE_CONFIG[role]
      return <StatusTag label={config.label} color={config.color} />
    },
  },
  {
    title: 'Ajouté le',
    dataIndex: 'joinedAt',
    key: 'joinedAt',
    width: 200,
    render: (date: string) => (
      <span className="text-sm text-text-secondary">{formatDate(date)}</span>
    ),
    sorter: (a: Member, b: Member) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    defaultSortOrder: 'descend',
  },
  {
    title: '',
    key: 'actions',
    width: 270,
    render: () => <MemberActions />,
  },
]

import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import { MemberCell } from './member-cell'
import { MemberActions } from './member-actions'
import { MEMBER_ROLE_CONFIG, type Member, type MemberRole } from './mock-data'

export function useMemberColumns(onDelete: (memberId: string) => void): ColumnsType<Member> {
  const { t } = useTranslation()

  return [
    {
      title: t('members.member'),
      key: 'member',
      ellipsis: true,
      render: (_: unknown, record: Member) => <MemberCell member={record} />,
    },
    {
      title: t('members.role'),
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: MemberRole) => {
        const config = MEMBER_ROLE_CONFIG[role]
        return <StatusTag label={config.label} color={config.color} />
      },
    },
    {
      title: t('members.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const isInvited = status === 'invited'
        return (
          <StatusTag
            label={isInvited ? t('members.invited') : t('members.active')}
            color={isInvited ? '#f59e0b' : '#10b981'}
          />
        )
      },
    },
    {
      title: t('members.added_at'),
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
      width: 150,
      render: (_: unknown, record: Member) => <MemberActions member={record} onDelete={onDelete} />,
    },
  ]
}

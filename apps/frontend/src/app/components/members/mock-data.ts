export type MemberRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'active' | 'invited'

export interface Member {
  id: string
  name: string
  phone?: string
  role: MemberRole
  status: MemberStatus
  avatarColor: string
  joinedAt: string
  inviteToken?: string
}

export const MEMBER_ROLE_CONFIG: Record<MemberRole, { label: string; color: string }> = {
  owner: { label: 'Propriétaire', color: '#111b21' },
  admin: { label: 'Admin', color: '#6366f1' },
  member: { label: 'Membre', color: '#0ea5e9' },
}

export const ALL_ROLES = Object.keys(MEMBER_ROLE_CONFIG) as MemberRole[]

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6']

/** Map an API MemberResponseDto to the local Member type */
export function mapApiMember(
  apiMember: {
    id: string
    role: string
    status: string
    createdAt: string
    inviteToken?: string
    user: {
      id: string
      name: string
      phone?: unknown
      avatar?: unknown
    }
  },
  index: number,
): Member {
  return {
    id: apiMember.id,
    name: apiMember.user.name,
    phone: (apiMember.user.phone as string) || undefined,
    role: apiMember.role.toLowerCase() as MemberRole,
    status: apiMember.status.toLowerCase() as MemberStatus,
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    joinedAt: apiMember.createdAt,
    inviteToken: apiMember.inviteToken,
  }
}

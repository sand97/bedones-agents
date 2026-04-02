export type MemberRole = 'admin' | 'invite' | 'client'

export interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  avatarColor: string
  joinedAt: string
}

export const MEMBER_ROLE_CONFIG: Record<MemberRole, { label: string; color: string }> = {
  admin: { label: 'Admin', color: '#111b21' },
  invite: { label: 'Invité', color: '#6366f1' },
  client: { label: 'Client', color: '#0ea5e9' },
}

export const ALL_ROLES = Object.keys(MEMBER_ROLE_CONFIG) as MemberRole[]

export const MOCK_MEMBERS: Member[] = [
  {
    id: '1',
    name: 'Konan Achi',
    email: 'konan@example.com',
    role: 'admin',
    avatarColor: '#6366f1',
    joinedAt: '2024-11-15T10:00:00Z',
  },
  {
    id: '2',
    name: 'Aminata Diallo',
    email: 'aminata@example.com',
    role: 'admin',
    avatarColor: '#ec4899',
    joinedAt: '2024-12-01T14:30:00Z',
  },
  {
    id: '3',
    name: 'Yao Kouassi',
    email: 'yao@example.com',
    role: 'invite',
    avatarColor: '#f59e0b',
    joinedAt: '2025-01-10T09:15:00Z',
  },
  {
    id: '4',
    name: 'Fatou Camara',
    email: 'fatou@example.com',
    role: 'client',
    avatarColor: '#10b981',
    joinedAt: '2025-02-05T16:45:00Z',
  },
  {
    id: '5',
    name: 'Ibrahim Touré',
    email: 'ibrahim@example.com',
    role: 'client',
    avatarColor: '#0ea5e9',
    joinedAt: '2025-02-18T11:00:00Z',
  },
  {
    id: '6',
    name: 'Mariam Koné',
    email: 'mariam@example.com',
    role: 'invite',
    avatarColor: '#8b5cf6',
    joinedAt: '2025-03-01T08:30:00Z',
  },
  {
    id: '7',
    name: 'Ousmane Bamba',
    email: 'ousmane@example.com',
    role: 'client',
    avatarColor: '#ef4444',
    joinedAt: '2025-03-12T13:20:00Z',
  },
  {
    id: '8',
    name: 'Aïcha Sanogo',
    email: 'aicha@example.com',
    role: 'invite',
    avatarColor: '#14b8a6',
    joinedAt: '2025-03-20T15:00:00Z',
  },
  {
    id: '9',
    name: 'Sékou Traoré',
    email: 'sekou@example.com',
    role: 'client',
    avatarColor: '#f97316',
    joinedAt: '2025-03-25T10:45:00Z',
  },
]

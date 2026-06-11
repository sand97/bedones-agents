import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Catalog, CatalogMigration } from '@app/lib/api/agent-api'
import type { components } from '@app/lib/api/v1'

export const NS = 'catalog_migration.flow.'

/** Only the "commerce" vertical can hold the products migrated from WhatsApp. */
export function isCommerceVertical(vertical?: string | null): boolean {
  return (vertical ?? '').toLowerCase() === 'commerce'
}

export const IN_FLIGHT: CatalogMigration['status'][] = ['QUEUED', 'EXTRACTING', 'IMPORTING']

export type WaAccount = components['schemas']['SocialAccountResponseDto']

export interface BtnCfg {
  label: string
  icon?: string | null
  disabled?: boolean
  onClick: () => void
}

export interface Screen {
  title: string | null
  current: number
  body: ReactNode
  back?: () => void
  primary?: BtnCfg
  footStep?: ReactNode
}

/** Everything the per-step screen builders need from the modal component. */
export interface ScreenContext {
  tf: (key: string, opts?: Record<string, unknown>) => string
  step: number
  phase: string
  setStep: Dispatch<SetStateAction<number>>
  setPhase: Dispatch<SetStateAction<string>>
  setJustConnected: Dispatch<SetStateAction<boolean>>
  setMigrationId: Dispatch<SetStateAction<string | undefined>>
  collectionsCount: number
  setCollectionsCount: Dispatch<SetStateAction<number>>
  connectedCatalogs: Catalog[]
  targetCatalog: Catalog | undefined
  selectedCatalogId: string | undefined
  setSelectedCatalogId: Dispatch<SetStateAction<string | undefined>>
  catalogChoice: 'connected' | 'new'
  setCatalogChoice: Dispatch<SetStateAction<'connected' | 'new'>>
  whatsappAccounts: WaAccount[]
  selectedAccountId: string | undefined
  setSelectedAccountId: Dispatch<SetStateAction<string | undefined>>
  presetAccountId?: string
  isResync?: boolean
  waNumber: string
  sourcePhone: string
  migration: CatalogMigration | undefined
  importProgress: number
  startMutation: { isPending: boolean; mutate: () => void }
  smbLinkMutation: { isPending: boolean }
  close: () => void
  showConnectNotice: () => void
  connectCatalog: () => void
  connectAccount: () => void
  smbDone: () => void
  reportProblem: () => void
  openSupport: () => void
  recheck: () => void
}

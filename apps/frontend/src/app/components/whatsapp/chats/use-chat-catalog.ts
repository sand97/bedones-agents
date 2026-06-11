import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePersistedQuery } from '@app/lib/use-persisted-query'
import { catalogApi } from '@app/lib/api/agent-api'

/**
 * Catalog/commerce state for the chats page: WhatsApp commerce settings (incl.
 * SMB detection), org catalogs, DB-linked catalog and migration eligibility.
 * Extracted verbatim from the chats/$id route.
 */
export function useChatCatalog({
  id,
  orgSlug,
  currentAccount,
  currentAccountId,
}: {
  id: string
  orgSlug: string
  currentAccount: { id: string; providerAccountId: string } | null
  currentAccountId: string | null
}) {
  // ─── WhatsApp commerce settings query ───
  // Doubles as SMB detection: Meta rejects the WABA product_catalogs call with
  // a (#10) "SMB business type" error for WhatsApp Business app numbers, which
  // the backend surfaces as `isSmb`. No extra round-trip needed.
  type CommerceEntry = { is_catalog_visible: boolean; id?: string }
  type CommerceData = { data: CommerceEntry[]; isSmb?: boolean }
  const commerceQuery = usePersistedQuery<CommerceData>({
    queryKey: ['whatsapp-commerce', currentAccount?.providerAccountId],
    queryFn: () => catalogApi.getWhatsappCommerceSettings(currentAccount?.providerAccountId || ''),
    enabled: id === 'whatsapp' && !!currentAccountId && !!currentAccount,
    staleTime: 5 * 60 * 1000,
  })

  // ─── Catalogs query (for the shared config modal + DB-link detection) ───
  // Enabled for every channel so the catalog/labels modal can associate a
  // catalog via our DB link (Instagram DM / Messenger / TikTok), not just WA.
  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    enabled: !!currentAccountId,
    staleTime: 30_000,
  })

  // A number is "linked" to a catalogue if Meta has a commerce catalog for it OR
  // if we recorded the link in our DB (CatalogSocialAccount) — the latter covers
  // SMB numbers, which can't be linked through the Meta API.
  const dbLinkedCatalog = useMemo(
    () =>
      (catalogsQuery.data || []).find((c) =>
        c.socialAccounts?.some((sa) => sa.socialAccount.id === currentAccount?.id),
      ),
    [catalogsQuery.data, currentAccount],
  )

  const hasCatalogAssociated = useMemo(() => {
    const data = commerceQuery.data?.data
    if (data && data.some((entry) => !!entry.id)) return true
    return !!dbLinkedCatalog
  }, [commerceQuery.data, dbLinkedCatalog])

  // Only an SMB number owns an in-app WhatsApp Business catalogue worth
  // migrating — offer "migrate your catalog" only for those, with none yet.
  const canMigrateCatalog = !hasCatalogAssociated && commerceQuery.data?.isSmb === true

  // Find the catalog linked to the current WhatsApp number (for product sending)
  const linkedCatalog = useMemo(() => {
    if (id !== 'whatsapp' || !currentAccount) return undefined
    const catalogs = catalogsQuery.data || []
    const commerceId = commerceQuery.data?.data?.find((e) => !!e.id)?.id
    if (commerceId) {
      // Match by Meta providerId
      const match = catalogs.find((c) => c.providerId === String(commerceId))
      if (match) return match
    }
    // DB link (CatalogSocialAccount) — source of truth for SMB numbers.
    if (dbLinkedCatalog) return dbLinkedCatalog
    // Fallback: first catalog with a providerId
    return catalogs.find((c) => !!c.providerId)
  }, [id, currentAccount, catalogsQuery.data, commerceQuery.data, dbLinkedCatalog])

  return {
    commerceQuery,
    catalogsQuery,
    hasCatalogAssociated,
    canMigrateCatalog,
    linkedCatalog,
  }
}

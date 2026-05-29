/**
 * Commerce Manager migration draft — persisted in localStorage so the
 * multi-step migration modal survives the round-trips the flow requires:
 *   - connecting a catalogue (Facebook OAuth leaves the page and comes back),
 *   - adding a WhatsApp number (may navigate away).
 * On return, the host page reopens the modal at the recorded step.
 * Cleared when the wizard is closed or finished.
 */

const KEY = 'bedones:catalog_migration_draft'

export interface CatalogMigrationDraft {
  /** Whether the modal should reopen on the next mount. */
  open?: boolean
  /** Wizard step to resume at. */
  step?: number
  /** Answer to "do you already have a Commerce Manager catalogue?". */
  hasExistingCatalog?: 'yes' | 'no' | 'unknown'
  /** Destination catalogue chosen/connected by the user. */
  catalogId?: string
  /** True right after a connect redirect, so we can auto-select the new catalogue. */
  justConnected?: boolean
  /** Pre-selected WhatsApp source number (digits only). */
  sourcePhone?: string
  /** In-flight migration id, so we resume straight on the progress step. */
  migrationId?: string
}

export function readCatalogMigrationDraft(): CatalogMigrationDraft {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CatalogMigrationDraft) : {}
  } catch {
    return {}
  }
}

export function writeCatalogMigrationDraft(draft: CatalogMigrationDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* localStorage unavailable — ignore */
  }
}

export function clearCatalogMigrationDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* localStorage unavailable — ignore */
  }
}

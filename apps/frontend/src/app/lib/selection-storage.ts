/**
 * Tiny localStorage-backed key/value store for "remember last selection" UX.
 * Used to restore the previously chosen catalog / WhatsApp account / etc.
 * when the user navigates away and comes back. Keys are namespaced by scope.
 */

function storageKey(scope: string): string {
  return `selection:${scope}`
}

type StorageMap = Record<string, string>

function read(scope: string): StorageMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(scope))
    return raw ? (JSON.parse(raw) as StorageMap) : {}
  } catch {
    return {}
  }
}

function write(scope: string, map: StorageMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(map))
  } catch {
    // ignore quota / serialization issues
  }
}

export function getStoredSelection(scope: string, key: string): string | null {
  return read(scope)[key] ?? null
}

export function setStoredSelection(scope: string, key: string, value: string) {
  const map = read(scope)
  if (map[key] === value) return
  map[key] = value
  write(scope, map)
}

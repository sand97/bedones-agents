type StorageMap = Record<string, string>

export interface AccountStorage {
  get(channelId: string): string | null
  set(channelId: string, accountId: string): void
  clear(channelId: string): void
}

/**
 * Builds a localStorage-backed store that remembers the last selected account
 * per channel. Each instance owns its own storage key so unrelated sections
 * (e.g. chats vs comments) never clobber each other, even when they share a
 * channel id like `tiktok`.
 */
export function createAccountStorage(storageKey: string): AccountStorage {
  function read(): StorageMap {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as StorageMap) : {}
    } catch {
      return {}
    }
  }

  function write(map: StorageMap) {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(map))
    } catch {
      // swallow quota / serialization errors
    }
  }

  return {
    get(channelId) {
      return read()[channelId] ?? null
    },
    set(channelId, accountId) {
      const map = read()
      if (map[channelId] === accountId) return
      map[channelId] = accountId
      write(map)
    },
    clear(channelId) {
      const map = read()
      if (!(channelId in map)) return
      delete map[channelId]
      write(map)
    },
  }
}

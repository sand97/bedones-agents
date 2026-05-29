const STORAGE_KEY = 'chat_last_account_per_channel'

type StorageMap = Record<string, string>

function read(): StorageMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StorageMap) : {}
  } catch {
    return {}
  }
}

function write(map: StorageMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // swallow quota / serialization errors
  }
}

export function getStoredChatAccount(channelId: string): string | null {
  return read()[channelId] ?? null
}

export function setStoredChatAccount(channelId: string, accountId: string) {
  const map = read()
  if (map[channelId] === accountId) return
  map[channelId] = accountId
  write(map)
}

export function clearStoredChatAccount(channelId: string) {
  const map = read()
  if (!(channelId in map)) return
  delete map[channelId]
  write(map)
}

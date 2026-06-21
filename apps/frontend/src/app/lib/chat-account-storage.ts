import { createAccountStorage } from './account-storage'

const storage = createAccountStorage('chat_last_account_per_channel')

export function getStoredChatAccount(channelId: string): string | null {
  return storage.get(channelId)
}

export function setStoredChatAccount(channelId: string, accountId: string) {
  storage.set(channelId, accountId)
}

export function clearStoredChatAccount(channelId: string) {
  storage.clear(channelId)
}

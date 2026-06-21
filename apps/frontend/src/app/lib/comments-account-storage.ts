import { createAccountStorage } from './account-storage'

const storage = createAccountStorage('comments_last_account_per_channel')

export function getStoredCommentsAccount(channelId: string): string | null {
  return storage.get(channelId)
}

export function setStoredCommentsAccount(channelId: string, accountId: string) {
  storage.set(channelId, accountId)
}

export function clearStoredCommentsAccount(channelId: string) {
  storage.clear(channelId)
}

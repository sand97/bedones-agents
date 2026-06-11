import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import type { Comment } from '../mock-data'

export type Provider = 'facebook' | 'instagram' | 'tiktok'

export interface Thread {
  root: Comment
  replies: Comment[]
}

export function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH[h]mm')
}

function formatDateLabel(timestamp: string, t: (key: string) => string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return t('date.today')
  if (date.isSame(now.subtract(1, 'day'), 'day')) return t('date.yesterday')
  return date.format('D MMMM')
}

export function buildThreads(comments: Comment[]): Thread[] {
  // Dedupe by id — websocket invalidations + optimistic refetch can deliver
  // the same comment twice, which then renders as a visible duplicate.
  const seen = new Set<string>()
  const unique: Comment[] = []
  for (const c of comments) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    unique.push(c)
  }

  const roots = unique.filter((c) => !c.parentId)
  const replyMap = new Map<string, Comment[]>()

  for (const c of unique) {
    if (c.parentId) {
      const arr = replyMap.get(c.parentId) || []
      arr.push(c)
      replyMap.set(c.parentId, arr)
    }
  }

  return roots.map((root) => ({
    root,
    replies: replyMap.get(root.id) || [],
  }))
}

/** Map fromId → fromName for every comment in a post, used to resolve `@[USER_ID]` mentions. */
export function buildUserNameMap(comments: Comment[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of comments) {
    if (c.fromId && c.fromName && !map.has(c.fromId)) {
      map.set(c.fromId, c.fromName)
    }
  }
  return map
}

/**
 * Facebook embeds user tags as `@[USER_ID]` in the raw comment text.
 * Replace each occurrence with the resolved username (in bold) so the reader
 * sees a readable name instead of a numeric ID.
 */
export function renderCommentMessage(message: string, userById: Map<string, string>): ReactNode {
  if (!message) return null
  const regex = /@\[([^\]]+)\]/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let mentionKey = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index))
    }
    const userId = match[1]
    const name = userById.get(userId) ?? userId
    parts.push(
      <span key={`mention-${mentionKey++}`} className="font-semibold text-text-primary">
        @{name}
      </span>,
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex === 0) return message
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex))
  }
  return parts
}

export function groupThreadsByDate(
  threads: Thread[],
  t: (key: string) => string,
): { date: string; threads: Thread[] }[] {
  const groups: { date: string; threads: Thread[] }[] = []

  for (const thread of threads) {
    const label = formatDateLabel(thread.root.createdTime, t)
    const last = groups[groups.length - 1]

    if (last && last.date === label) {
      last.threads.push(thread)
    } else {
      groups.push({ date: label, threads: [thread] })
    }
  }

  return groups
}

import type { Post } from './mock-data'

/** Map API post response to component Post type */
export function mapPost(p: {
  id: string
  message?: string
  imageUrl?: string
  permalinkUrl?: string
  totalComments: number
  unreadComments: number
  comments: {
    id: string
    postId: string
    parentId?: string
    message: string
    fromId: string
    fromName: string
    fromAvatar?: string
    createdTime: string
    isRead: boolean
    isPageReply: boolean
    status: string
    action: string
    actionReason?: string
    replyMessage?: string
  }[]
}): Post {
  return {
    id: p.id,
    message: p.message ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    permalinkUrl: p.permalinkUrl ?? undefined,
    totalComments: p.totalComments,
    unreadComments: p.unreadComments,
    comments: p.comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      parentId: c.parentId ?? undefined,
      message: c.message,
      fromId: c.fromId,
      fromName: c.fromName,
      fromAvatar: c.fromAvatar ?? undefined,
      createdTime: c.createdTime as string,
      isRead: c.isRead,
      isPageReply: c.isPageReply,
      status: c.status as 'VISIBLE' | 'HIDDEN' | 'DELETED',
      action: c.action as 'NONE' | 'HIDE' | 'DELETE' | 'REPLY',
      actionReason: c.actionReason ?? undefined,
      replyMessage: c.replyMessage ?? undefined,
    })),
  }
}

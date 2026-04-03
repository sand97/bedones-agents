/**
 * Comment types — these mirror the backend API response DTOs.
 * Used by comments UI components. No mock data — all data comes from API.
 */

export interface PostAuthor {
  id: string
  name: string
  avatarUrl?: string
}

export type CommentStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED'
export type CommentAction = 'NONE' | 'HIDE' | 'DELETE' | 'REPLY'

export interface Comment {
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
  status: CommentStatus
  action: CommentAction
  actionReason?: string
  replyMessage?: string
}

export interface Post {
  id: string
  message?: string
  imageUrl?: string
  permalinkUrl?: string
  totalComments: number
  unreadComments: number
  comments: Comment[]
}

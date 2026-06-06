import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'
import { SocialService } from '../../social/social.service'
import { mcpContext, requireAdmin } from '../mcp-context'
import {
  DESTRUCTIVE_EXTERNAL,
  READ_ONLY,
  WRITE_EXTERNAL,
  WRITE_INTERNAL,
  withTitle,
} from './annotations'
import {
  accountIdSchema,
  commentIdSchema,
  commentOnPostSchema,
  emptySchema,
  postIdSchema,
  replyToCommentSchema,
} from './tool-schemas'

@Injectable()
export class McpCommentsTools {
  constructor(private readonly social: SocialService) {}

  @Tool({
    name: 'list_social_accounts',
    annotations: withTitle('Lister les comptes sociaux', READ_ONLY),
    description:
      "Lister les comptes sociaux connectés de l'organisation (pages Facebook, comptes Instagram, WhatsApp, TikTok) avec leurs IDs.",
    parameters: emptySchema,
  })
  async listAccounts(_a: unknown, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.getAccountsForOrg(ctx.userId, ctx.organisationId)
  }

  @Tool({
    name: 'get_unread_counts',
    annotations: withTitle('Compteurs de non-lus', READ_ONLY),
    description: 'Compteurs de commentaires et messages non lus par réseau social.',
    parameters: emptySchema,
  })
  async unread(_a: unknown, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.getUnreadCounts(ctx.userId, ctx.organisationId)
  }

  @Tool({
    name: 'list_posts',
    annotations: withTitle('Lister les publications', READ_ONLY),
    description: "Lister les posts d'un compte social avec leurs commentaires.",
    parameters: accountIdSchema,
  })
  async listPosts(args: z.infer<typeof accountIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.getPostsForAccount(ctx.userId, args.accountId)
  }

  @Tool({
    name: 'comment_on_post',
    annotations: withTitle('Commenter une publication', WRITE_EXTERNAL),
    description: 'Publier un commentaire de premier niveau sur un post.',
    parameters: commentOnPostSchema,
  })
  async commentOnPost(args: z.infer<typeof commentOnPostSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.commentOnPost(ctx.userId, args.postId, args.message)
  }

  @Tool({
    name: 'reply_to_comment',
    annotations: withTitle('Répondre à un commentaire', WRITE_EXTERNAL),
    description: 'Répondre à un commentaire (Facebook / Instagram).',
    parameters: replyToCommentSchema,
  })
  async reply(args: z.infer<typeof replyToCommentSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.replyToComment(ctx.userId, args.commentId, args.message)
  }

  @Tool({
    name: 'hide_comment',
    annotations: withTitle('Masquer un commentaire', WRITE_EXTERNAL),
    description: 'Masquer un commentaire.',
    parameters: commentIdSchema,
  })
  async hide(args: z.infer<typeof commentIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.hideComment(ctx.userId, args.commentId)
  }

  @Tool({
    name: 'unhide_comment',
    annotations: withTitle('Ré-afficher un commentaire', WRITE_EXTERNAL),
    description: 'Ré-afficher un commentaire masqué.',
    parameters: commentIdSchema,
  })
  async unhide(args: z.infer<typeof commentIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.social.unhideComment(ctx.userId, args.commentId)
  }

  @Tool({
    name: 'delete_comment',
    annotations: withTitle('Supprimer un commentaire', DESTRUCTIVE_EXTERNAL),
    description: 'Supprimer définitivement un commentaire. Réservé aux administrateurs.',
    parameters: commentIdSchema,
  })
  async delete(args: z.infer<typeof commentIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    requireAdmin(ctx)
    return this.social.deleteComment(ctx.userId, args.commentId)
  }

  @Tool({
    name: 'mark_comments_read',
    annotations: withTitle('Marquer les commentaires comme lus', WRITE_INTERNAL),
    description: "Marquer les commentaires d'un post comme lus.",
    parameters: postIdSchema,
  })
  async markRead(args: z.infer<typeof postIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    await this.social.markCommentsAsRead(ctx.userId, args.postId)
    return { status: 'success' }
  }
}

import type { ReactNode } from 'react'
import { useState, useCallback, useMemo } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { App, Button, Progress } from 'antd'
import { ArrowLeft, CheckCircle, MessageSquareOff, Settings } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { CommentsLayout } from '@app/components/comments/comments-layout'
import { CommentsConfigModal } from '@app/components/comments/comments-config'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'
import { useUnreadCounts } from '@app/contexts/unread-context'
import { $api } from '@app/lib/api/$api'
import type { Post } from '@app/components/comments/mock-data'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
  buildTikTokOAuthUrl,
} from '@app/lib/auth-redirect'

export const Route = createFileRoute('/app/$orgSlug/comments/$id')({
  component: CommentsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    post: (search.post as string) || undefined,
    filter: (search.filter as string) || undefined,
    account: (search.account as string) || undefined,
  }),
})

const ICON_SIZE = 40

interface CommentConfigEntry {
  labelKey: string
  mobileLabel: string
  icon: ReactNode
  color: string
  titleKey: string
  descriptionKey: string
  buttonKey: string
  connectLabelKey: string
  provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
}

const COMMENT_CONFIG: Record<string, CommentConfigEntry> = {
  facebook: {
    labelKey: 'comments.facebook_label',
    mobileLabel: 'Facebook',
    icon: <FacebookIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-facebook)',
    titleKey: 'comments.connect_facebook_title',
    descriptionKey: 'comments.connect_facebook_desc',
    buttonKey: 'comments.connect_facebook_btn',
    connectLabelKey: 'comments.connect_facebook_short',
    provider: 'FACEBOOK',
  },
  instagram: {
    labelKey: 'comments.instagram_label',
    mobileLabel: 'Instagram',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    titleKey: 'comments.connect_instagram_title',
    descriptionKey: 'comments.connect_instagram_desc',
    buttonKey: 'comments.connect_instagram_btn',
    connectLabelKey: 'comments.connect_instagram_short',
    provider: 'INSTAGRAM',
  },
  tiktok: {
    labelKey: 'comments.tiktok_label',
    mobileLabel: 'TikTok',
    icon: <TikTokIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-tiktok)',
    titleKey: 'comments.connect_tiktok_title',
    descriptionKey: 'comments.connect_tiktok_desc',
    buttonKey: 'comments.connect_tiktok_btn',
    connectLabelKey: 'comments.connect_tiktok_short',
    provider: 'TIKTOK',
  },
}

/** Map API post response to component Post type */
function mapPost(p: {
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

function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() =>
        navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, post: undefined }) as never,
        })
      }
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Posts
    </Button>
  )
}

function CommentsPage() {
  const { t } = useTranslation()
  const { id, orgSlug } = useParams({ from: '/app/$orgSlug/comments/$id' })
  const search = useSearch({ from: '/app/$orgSlug/comments/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isDesktop } = useLayout()
  const { refresh: refreshUnread } = useUnreadCounts()
  const { message: messageApi } = App.useApp()
  const rawConfig = COMMENT_CONFIG[id]
  const config = rawConfig
    ? {
        ...rawConfig,
        label: t(rawConfig.labelKey),
        title: t(rawConfig.titleKey),
        description: t(rawConfig.descriptionKey),
        button: t(rawConfig.buttonKey),
        connectLabel: t(rawConfig.connectLabelKey),
      }
    : null
  const title = config?.label || `Commentaires — ${id}`

  const hasSelectedPost = !!search.post

  // The selected account comes from URL search param
  const currentAccountId = search.account || null

  const [configOpen, setConfigOpen] = useState(false)
  const [configJustConnected, setConfigJustConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // ─── Accounts query ───
  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })

  // Filter accounts by provider AND comments scope
  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (a) => a.provider === config?.provider && a.scopes?.includes('comments'),
      ),
    [accountsQuery.data, config?.provider],
  )

  // Auto-select first account if none in URL
  const setAccountInUrl = useCallback(
    (accountId: string) => {
      navigate({
        search: (prev: Record<string, unknown>) =>
          ({ ...prev, account: accountId, post: undefined }) as never,
        replace: true,
      })
    },
    [navigate],
  )

  // Auto-select on first load
  if (accounts.length > 0 && !currentAccountId) {
    setAccountInUrl(accounts[0].id)
  }

  // ─── Posts query ───
  const postsQuery = $api.useQuery(
    'get',
    '/social/accounts/{accountId}/posts',
    { params: { path: { accountId: currentAccountId! } } },
    { enabled: !!currentAccountId },
  )

  const posts: Post[] = useMemo(
    () => (postsQuery.data ?? []).map((p) => mapPost(p as Parameters<typeof mapPost>[0])),
    [postsQuery.data],
  )

  // ─── Derived ───
  const currentAccount = accounts.find((a) => a.id === currentAccountId)
  const hasAccounts = accounts.length > 0
  const isConfigured = !!currentAccount?.settings?.isConfigured
  const hasPosts = posts.length > 0
  const isRefreshing = postsQuery.isFetching && !postsQuery.isLoading

  // ─── Invalidation helper ───
  const invalidatePosts = useCallback(() => {
    if (!currentAccountId) return
    queryClient.invalidateQueries({
      queryKey: [
        'get',
        '/social/accounts/{accountId}/posts',
        { params: { path: { accountId: currentAccountId } } },
      ],
    })
  }, [queryClient, currentAccountId])

  const invalidateAccounts = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['get', '/social/accounts/{organisationId}'],
    })
  }, [queryClient])

  // ─── Mutations ───
  const replyMutation = $api.useMutation('post', '/social/comments/reply')
  const commentMutation = $api.useMutation('post', '/social/comments/post')
  const tiktokReplyMutation = $api.useMutation('post', '/social/tiktok/comments/reply')
  const hideMutation = $api.useMutation('post', '/social/comments/hide')
  const unhideMutation = $api.useMutation('post', '/social/comments/unhide')
  const deleteMutation = $api.useMutation('post', '/social/comments/delete')
  const markReadMutation = $api.useMutation('post', '/social/comments/mark-read')

  // ─── Actions ───
  const handleReply = async (commentId: string, message: string) => {
    if (id === 'tiktok') {
      await tiktokReplyMutation.mutateAsync({ body: { commentId, message } })
    } else {
      await replyMutation.mutateAsync({ body: { commentId, message } })
    }
    invalidatePosts()
  }

  const handleComment = async (postId: string, message: string) => {
    if (id === 'tiktok') {
      // TikTok doesn't support top-level comments via API
      messageApi.warning(t('comments.tiktok_no_direct'))
      return
    }
    await commentMutation.mutateAsync({ body: { postId, message } })
    invalidatePosts()
  }

  const handleHide = async (commentId: string) => {
    await hideMutation.mutateAsync({ body: { commentId } })
    invalidatePosts()
  }

  const handleUnhide = async (commentId: string) => {
    await unhideMutation.mutateAsync({ body: { commentId } })
    invalidatePosts()
  }

  const handleDelete = async (commentId: string) => {
    await deleteMutation.mutateAsync({ body: { commentId } })
    invalidatePosts()
  }

  const handleMarkRead = async (postId: string) => {
    try {
      await markReadMutation.mutateAsync({ body: { postId } })
      // Update cache directly — set unreadComments to 0 and all comments to isRead: true
      const postsKey = [
        'get',
        '/social/accounts/{accountId}/posts',
        { params: { path: { accountId: currentAccountId! } } },
      ]
      queryClient.setQueryData(postsKey, (old: unknown[] | undefined) =>
        (old ?? []).map((item) => {
          const p = item as Record<string, unknown>
          return p.id === postId
            ? {
                ...p,
                unreadComments: 0,
                comments: ((p.comments as Record<string, unknown>[]) ?? []).map((c) => ({
                  ...c,
                  isRead: true,
                })),
              }
            : p
        }),
      )
      refreshUnread()
    } catch {
      // silent
    }
  }

  const handleConnect = () => {
    setConnecting(true)

    setAuthRedirect({
      intent: 'connect_pages',
      orgId: orgSlug,
      provider: id as 'facebook' | 'instagram' | 'tiktok',
      scopes: ['comments'],
    })

    if (id === 'facebook') {
      const configId = import.meta.env.VITE_FB_COMMENTS_CONFIGGURATION_ID
      if (!configId) {
        messageApi.error(t('comments.config_facebook_missing'))
        setConnecting(false)
        return
      }
      window.location.href = buildFacebookOAuthUrl(configId)
    } else if (id === 'instagram') {
      window.location.href = buildInstagramOAuthUrl('comments')
    } else if (id === 'tiktok') {
      const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY
      if (!clientKey) {
        messageApi.error(t('comments.config_tiktok_missing'))
        setConnecting(false)
        return
      }
      window.location.href = buildTikTokOAuthUrl()
    }
  }

  const handleSwitchAccount = (account: SocialAccount) => {
    setAccountInUrl(account.id)
  }

  // ─── Not found ───
  if (!config) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={title} />
        <div className="flex flex-1 items-center justify-center text-text-muted">
          {t('comments.page_not_found')}
        </div>
      </div>
    )
  }

  // ─── Loading (first load, no cache) ───
  if (accountsQuery.isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader title={config.label} mobileTitle={config.mobileLabel} />
        <CommentsLayout posts={[]} provider={id as 'facebook' | 'instagram' | 'tiktok'} loading />
      </div>
    )
  }

  // ─── No account connected → Setup screen ───
  if (!hasAccounts) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={config.label} mobileTitle={config.mobileLabel} />
        <SocialSetup
          icon={config.icon}
          color={config.color}
          title={config.title}
          description={config.description}
          buttonLabel={config.button}
          loading={connecting}
          onAction={handleConnect}
        />
      </div>
    )
  }

  // ─── Build account switcher items ───
  const accountSwitcherItems: SocialAccount[] = accounts.map((a) => ({
    id: a.id,
    name: a.pageName || a.username || a.providerAccountId,
    avatarUrl: a.profilePictureUrl ?? undefined,
  }))

  const currentSwitcherItem =
    accountSwitcherItems.find((a) => a.id === currentAccountId) || accountSwitcherItems[0]

  const accountSwitcher = (
    <AccountSwitcher
      accounts={accountSwitcherItems}
      currentAccount={currentSwitcherItem}
      connectLabel={config.connectLabel}
      onSwitch={handleSwitchAccount}
      onConnect={handleConnect}
    />
  )

  // ─── Account connected but no settings configured → Config prompt ───
  if (!isConfigured || configJustConnected) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader
          title={config.label}
          mobileTitle={config.mobileLabel}
          action={accountSwitcher}
        />
        <SocialSetup
          icon={<CheckCircle size={40} strokeWidth={1.5} />}
          color={config.color}
          title={t('comments.page_added')}
          description={t('comments.setup_description')}
          buttonLabel={t('comments.setup_button')}
          buttonIcon={<Settings size={18} />}
          onAction={() => setConfigOpen(true)}
        />
        {currentAccountId && (
          <CommentsConfigModal
            pageName={currentSwitcherItem.name}
            accountId={currentAccountId}
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            onSaved={() => {
              setConfigJustConnected(false)
              invalidateAccounts()
            }}
          />
        )}
      </div>
    )
  }

  // ─── No posts yet → empty state ───
  if (!hasPosts && !postsQuery.isFetching && postsQuery.isFetched) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader
          title={config.label}
          mobileTitle={config.mobileLabel}
          action={accountSwitcher}
        />
        <SocialSetup
          icon={<MessageSquareOff size={40} strokeWidth={1.5} />}
          color={config.color}
          title={t('comments.no_comments')}
          description={t('comments.no_comments_desc', { provider: config.mobileLabel })}
          buttonLabel={t('comments.edit_config')}
          buttonType="default"
          buttonIcon={<Settings size={18} />}
          onAction={() => setConfigOpen(true)}
        />
        {currentAccountId && (
          <CommentsConfigModal
            pageName={currentSwitcherItem.name}
            accountId={currentAccountId}
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            onSaved={() => invalidateAccounts()}
            initialSettings={currentAccount?.settings ?? undefined}
          />
        )}
      </div>
    )
  }

  // ─── Full comments UI ───
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader
        title={config.label}
        mobileTitle={config.mobileLabel}
        action={accountSwitcher}
        mobileLeft={hasSelectedPost && !isDesktop ? <MobileBackButton /> : undefined}
      />

      {/* Background refresh indicator */}
      {isRefreshing && (
        <Progress
          percent={100}
          status="active"
          showInfo={false}
          strokeLinecap="square"
          size={[undefined as unknown as number, 2]}
          className="comments-refresh-progress"
        />
      )}

      <CommentsLayout
        posts={posts}
        provider={id as 'facebook' | 'instagram' | 'tiktok'}
        loading={postsQuery.isLoading}
        pageName={currentSwitcherItem.name}
        accountId={currentAccountId || undefined}
        isConfigured={isConfigured}
        onReply={handleReply}
        onComment={handleComment}
        onHide={handleHide}
        onUnhide={handleUnhide}
        onDelete={handleDelete}
        onMarkRead={handleMarkRead}
        onSettingsSaved={() => invalidateAccounts()}
      />
    </div>
  )
}

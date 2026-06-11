import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { MessageCircle, Search, Sparkles, ShoppingBag, Wrench } from 'lucide-react'
import { ConversationList } from './conversation-list'
import { ChatWindow } from './chat-window'
import { SocialSetup } from '@app/components/social/social-setup'
import { HeaderHelper } from '@app/components/shared/header-helper'
import { ListSearchInput } from '@app/components/shared/list-search-input'
import { ConversationListSkeleton, ChatWindowSkeleton } from './chat-skeleton'
import { labelApi } from '@app/lib/api/agent-api'
import type { Conversation } from './mock-data'
import {
  PROVIDER_EMPTY_STATE,
  useSetupState,
  type ChatProvider,
} from './chat-layout/provider-empty-state'
import { LabelsFilterPopover } from './chat-layout/labels-filter-popover'
import { ChatToolsPopover } from './chat-layout/chat-tools-popover'

interface ChatLayoutProps {
  conversations: Conversation[]
  loading?: boolean
  provider?: ChatProvider
  onSend?: (
    message: string,
    media?: { url: string; type: 'image' | 'video' | 'audio' | 'file' },
    replyToId?: string,
  ) => Promise<void>
  onUploadAndSend?: (
    file: File,
    type: 'image' | 'video' | 'audio' | 'file',
    replyToId?: string,
  ) => Promise<void>
  /** Called (throttled) when the admin is typing in the input — used to send typing indicator to the customer */
  onTyping?: () => void
  onSelectConversation?: (convId: string) => void
  onRetry?: (messageId: string) => void
  /** Called when user clicks anywhere in the chat window area */
  onChatClick?: () => void
  /** Whether a ready/active agent is configured for this provider */
  hasReadyAgent?: boolean
  /** Whether a catalog is associated with the current WhatsApp number */
  hasCatalogAssociated?: boolean
  /** Callback when user clicks the "configure agent" button */
  onConfigureAgent?: () => void
  /** Callback when user clicks the "configure catalog" button */
  onConfigureCatalog?: () => void
  /** Whether the current WhatsApp number is an SMB (Coexistence) number with no
   * catalog yet — show "migrate your catalog" instead of "associate a catalog". */
  canMigrateCatalog?: boolean
  /** Callback when user clicks the "migrate catalog" button */
  onMigrateCatalog?: () => void
  /** Callback when user clicks the Options button */
  onOpenOptions?: () => void
  onOpenTemplates?: () => void
  onOpenCampaigns?: () => void
  /** Called when user clicks the "Disconnect" tool */
  onDisconnect?: () => void
  /** Social account ID used to fetch labels from the database */
  socialAccountId?: string
  /** Whether the current WhatsApp number has a linked catalog for product sending */
  hasCatalogForProducts?: boolean
  /** Called when user clicks the "Product" attachment option */
  onProductClick?: () => void
  /** Called when user clicks the "Send catalog" attachment option */
  onCatalogClick?: () => void
  onTemplateClick?: () => void
  onTikTokMessageClick?: () => void
}

export function ChatLayout({
  conversations,
  loading = false,
  provider = 'whatsapp',
  onSend,
  onUploadAndSend,
  onTyping,
  onSelectConversation,
  onRetry,
  onChatClick,
  hasReadyAgent = false,
  hasCatalogAssociated = true,
  onConfigureAgent,
  onConfigureCatalog,
  canMigrateCatalog = false,
  onMigrateCatalog,
  onOpenOptions,
  onOpenTemplates,
  onOpenCampaigns,
  onDisconnect,
  socialAccountId,
  hasCatalogForProducts,
  onProductClick,
  onCatalogClick,
  onTemplateClick,
  onTikTokMessageClick,
}: ChatLayoutProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string }
  const providerConfig = PROVIDER_EMPTY_STATE[provider]
  const selectedConvId = search.conv
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Debounce the raw input into the applied query; the gap is the "searching" window.
  useEffect(() => {
    if (searchInput === searchQuery) return
    const id = window.setTimeout(() => setSearchQuery(searchInput), 350)
    return () => window.clearTimeout(id)
  }, [searchInput, searchQuery])

  const isSearching = searchInput !== searchQuery

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchInput('')
    setSearchQuery('')
  }

  const labelsQuery = useQuery({
    queryKey: ['labels', socialAccountId],
    queryFn: () => labelApi.list(socialAccountId!),
    enabled: !!socialAccountId,
  })
  const dbLabels = labelsQuery.data ?? []

  const selectedConversation = conversations.find((c) => c.id === selectedConvId)

  const setupState = useSetupState(provider, hasCatalogAssociated, hasReadyAgent)
  const hasConversations = conversations.length > 0

  const selectConversation = (conv: Conversation) => {
    if (onSelectConversation) {
      onSelectConversation(conv.id)
    } else {
      navigate({ search: { conv: conv.id } as never })
    }
  }

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    )
  }

  const filteredConversations = useMemo(() => {
    let result = conversations
    if (filter === 'unread') {
      result = result.filter((c) => c.unreadCount > 0)
    }
    if (selectedLabelIds.length > 0) {
      result = result.filter((c) => c.labels.some((l) => selectedLabelIds.includes(l.id)))
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter((c) => {
        const haystacks = [c.contact.name, c.contact.phone, c.contact.username, c.lastMessage]
        if (haystacks.some((h) => h?.toLowerCase().includes(q))) return true
        return c.messages.some(
          (m) => m.text?.toLowerCase().includes(q) || m.imageCaption?.toLowerCase().includes(q),
        )
      })
    }
    return result
  }, [conversations, filter, selectedLabelIds, searchQuery])

  if (loading) {
    return (
      <div className="chat-split">
        <div className="chat-split__left">
          <ConversationListSkeleton />
        </div>
        <div className="chat-split__right chat-split__right--visible">
          <ChatWindowSkeleton />
        </div>
      </div>
    )
  }

  /* ── Catalog setup: "migrate" (SMB number) vs "associate" (Cloud API) ── */
  const renderCatalogSetup = () =>
    canMigrateCatalog ? (
      <SocialSetup
        icon={<ShoppingBag size={40} strokeWidth={1.5} />}
        color={providerConfig.color}
        title={t('chat.migrate_catalog_title')}
        description={t('chat.migrate_catalog_desc')}
        buttonLabel={t('chat.migrate_catalog_btn')}
        onAction={onMigrateCatalog}
      />
    ) : (
      <SocialSetup
        icon={<ShoppingBag size={40} strokeWidth={1.5} />}
        color={providerConfig.color}
        title={t('chat.configure_catalog_title')}
        description={t('chat.configure_catalog_desc')}
        buttonLabel={t('chat.configure_catalog_btn')}
        onAction={onConfigureCatalog}
      />
    )

  /* ── Desktop SocialSetup (right panel) ── */
  const renderDesktopSetup = () => {
    // Priority: catalog > agent > empty conversations > select conversation
    if (setupState === 'catalog') {
      return renderCatalogSetup()
    }
    if (setupState === 'agent') {
      return (
        <SocialSetup
          icon={<Sparkles size={40} strokeWidth={1.5} />}
          color={providerConfig.color}
          title={t('chat.configure_agent_title')}
          description={t('chat.configure_agent_desc')}
          buttonLabel={t('chat.configure_agent_btn')}
          onAction={onConfigureAgent}
        />
      )
    }
    if (!hasConversations) {
      return (
        <SocialSetup
          icon={<MessageCircle size={40} strokeWidth={1.5} />}
          color={providerConfig.color}
          title={t(providerConfig.noConvTitleKey)}
          description={t('chat.conversations_will_appear')}
        />
      )
    }
    return (
      <SocialSetup
        icon={providerConfig.icon}
        color={providerConfig.color}
        title={t(providerConfig.selectTitleKey)}
        description={t(providerConfig.selectDescKey)}
      />
    )
  }

  /* ── Mobile HeaderHelper (above conversation list) ── */
  const renderMobileHeaderHelper = () => {
    if (!hasConversations) return null // Will show SocialSetup instead
    if (setupState === 'catalog') {
      return (
        <HeaderHelper
          icon={<ShoppingBag size={18} strokeWidth={1.5} />}
          title={
            canMigrateCatalog ? t('chat.migrate_catalog_title') : t('chat.no_catalog_associated')
          }
          subtitle={
            canMigrateCatalog ? t('chat.migrate_catalog_desc') : t('chat.catalog_association_desc')
          }
          primaryAction={{
            title: canMigrateCatalog ? t('chat.migrate') : t('chat.associate'),
            onClick: () => (canMigrateCatalog ? onMigrateCatalog?.() : onConfigureCatalog?.()),
          }}
        />
      )
    }
    if (setupState === 'agent') {
      return (
        <HeaderHelper
          icon={<Sparkles size={18} strokeWidth={1.5} />}
          title={t('agent.no_agent_configured')}
          subtitle={t('agent.setup_banner_desc', {
            provider:
              provider === 'whatsapp'
                ? 'WhatsApp'
                : provider === 'instagram-dm'
                  ? 'Instagram'
                  : provider === 'tiktok'
                    ? 'TikTok'
                    : 'Messenger',
          })}
          primaryAction={{ title: t('agent.configure'), onClick: () => onConfigureAgent?.() }}
        />
      )
    }
    return null
  }

  return (
    <div className="chat-split">
      {/* Left: conversation list */}
      <div
        className={`chat-split__left ${selectedConversation ? 'chat-split__left--hidden-mobile' : ''}`}
      >
        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3.5">
          <Button
            type={filter === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('all')}
            className="comments-filter-btn"
          >
            {t('comments.all')}
          </Button>
          <Button
            type={filter === 'unread' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('unread')}
            className="comments-filter-btn"
          >
            {t('comments.unread')}
          </Button>
          <LabelsFilterPopover
            labels={dbLabels}
            selectedLabelIds={selectedLabelIds}
            onToggle={toggleLabel}
          >
            <Button
              type={selectedLabelIds.length > 0 ? 'primary' : 'default'}
              size="small"
              className="comments-filter-btn"
            >
              {t('chat.tools_labels')}
              {selectedLabelIds.length > 0 ? ` (${selectedLabelIds.length})` : ''}
            </Button>
          </LabelsFilterPopover>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              type="text"
              size="small"
              icon={<Search size={16} />}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              aria-label={t('common.search')}
              title={t('common.search')}
            />
            <ChatToolsPopover
              provider={provider}
              onOpenOptions={onOpenOptions}
              onOpenTemplates={onOpenTemplates}
              onOpenCampaigns={onOpenCampaigns}
              onDisconnect={onDisconnect}
            >
              <Button
                type="text"
                size="small"
                icon={<Wrench size={16} />}
                aria-label={t('chat.tools')}
                title={t('chat.tools')}
              />
            </ChatToolsPopover>
          </div>
        </div>

        {searchOpen && (
          <ListSearchInput
            value={searchInput}
            onChange={setSearchInput}
            onClose={closeSearch}
            searching={isSearching}
            placeholder={t('chat.search')}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Mobile: HeaderHelper scrolls with the list (under the filter bar) */}
          <div className="md:hidden">{renderMobileHeaderHelper()}</div>

          {/* Mobile only: show SocialSetup when no conversations + setup needed */}
          {!hasConversations && setupState ? (
            <div className="md:hidden">
              {setupState === 'catalog' ? (
                renderCatalogSetup()
              ) : (
                <SocialSetup
                  icon={<Sparkles size={40} strokeWidth={1.5} />}
                  color={providerConfig.color}
                  title={t('chat.configure_agent_title')}
                  description={t('chat.configure_agent_desc')}
                  buttonLabel={t('chat.configure_agent_btn')}
                  onAction={onConfigureAgent}
                />
              )}
            </div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedConvId}
              onSelect={selectConversation}
            />
          )}
        </div>
      </div>

      {/* Right: chat window — click to mark as read */}
      <div
        className={`chat-split__right ${selectedConversation ? 'chat-split__right--visible' : ''}`}
        onClick={onChatClick}
      >
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            provider={provider}
            onSend={onSend}
            onUploadAndSend={onUploadAndSend}
            onTyping={onTyping}
            onRetry={onRetry}
            hasCatalog={hasCatalogForProducts}
            onProductClick={onProductClick}
            onCatalogClick={onCatalogClick}
            onTemplateClick={onTemplateClick}
            onTikTokMessageClick={onTikTokMessageClick}
          />
        ) : (
          renderDesktopSetup()
        )}
      </div>
    </div>
  )
}

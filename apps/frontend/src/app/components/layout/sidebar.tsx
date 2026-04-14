import { useNavigate, useParams, useLocation, useRouter } from '@tanstack/react-router'
import { Avatar, Button, Divider, Popover, Tooltip } from 'antd'
import {
  Sparkles,
  Ticket,
  ShoppingBag,
  BadgePercent,
  Users,
  BarChart3,
  CreditCard,
  LifeBuoy,
  User,
  LogOut,
  Bell,
  Languages,
  LayoutDashboard,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { logout } from '@app/lib/api'
import { useLayout } from '@app/contexts/layout-context'
import { useLocale } from '@app/contexts/locale-context'
import { useUnreadCounts } from '@app/contexts/unread-context'
import { syncDayjsLocale } from '@app/lib/format'
import { OrgSwitcher } from './org-switcher'

const ICON_SIZE = 18
const STROKE = 1

interface NavItem {
  key: string
  labelKey: string
  icon: React.ReactNode
  path: string
  badge?: number
  /** Provider key to dynamically resolve the badge from unread counts */
  unreadProvider?: string
}

interface NavGroup {
  titleKey?: string
  items: NavItem[]
}

const mainGroups: NavGroup[] = [
  {
    items: [
      {
        key: 'agents',
        labelKey: 'sidebar.agents',
        icon: <Sparkles size={ICON_SIZE} strokeWidth={STROKE} />,
        path: 'agents',
      },
      {
        key: 'tickets',
        labelKey: 'sidebar.tickets',
        icon: <Ticket size={ICON_SIZE} strokeWidth={STROKE} />,
        path: 'tickets',
      },
      {
        key: 'catalog',
        labelKey: 'sidebar.catalogs',
        icon: <ShoppingBag size={ICON_SIZE} strokeWidth={STROKE} />,
        path: 'catalog',
      },
      {
        key: 'promotions',
        labelKey: 'sidebar.promotions',
        icon: <BadgePercent size={ICON_SIZE} strokeWidth={STROKE} />,
        path: 'promotions',
      },
    ],
  },
  {
    titleKey: 'sidebar.messaging',
    items: [
      {
        key: 'whatsapp',
        labelKey: 'sidebar.whatsapp',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-whatsapp)' }}
          />
        ),
        path: 'chats/whatsapp',
        unreadProvider: 'WHATSAPP',
      },
      {
        key: 'instagram-dm',
        labelKey: 'sidebar.instagram_dm',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-instagram)' }}
          />
        ),
        path: 'chats/instagram-dm',
        unreadProvider: 'INSTAGRAM_DM',
      },
      {
        key: 'messenger',
        labelKey: 'sidebar.messenger',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-messenger)' }}
          />
        ),
        path: 'chats/messenger',
        unreadProvider: 'MESSENGER',
      },
    ],
  },
  {
    titleKey: 'sidebar.comments_section',
    items: [
      {
        key: 'facebook',
        labelKey: 'sidebar.facebook',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-facebook)' }}
          />
        ),
        path: 'comments/facebook',
        unreadProvider: 'FACEBOOK',
      },
      {
        key: 'instagram',
        labelKey: 'sidebar.instagram',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-instagram)' }}
          />
        ),
        path: 'comments/instagram',
        unreadProvider: 'INSTAGRAM',
      },
      {
        key: 'tiktok',
        labelKey: 'sidebar.tiktok',
        icon: (
          <span
            className="sidebar__social-dot"
            style={{ background: 'var(--color-brand-tiktok)' }}
          />
        ),
        path: 'comments/tiktok',
        unreadProvider: 'TIKTOK',
      },
    ],
  },
]

const bottomItems: NavItem[] = [
  {
    key: 'members',
    labelKey: 'sidebar.members',
    icon: <Users size={ICON_SIZE} strokeWidth={STROKE} />,
    path: 'members',
  },
  {
    key: 'stats',
    labelKey: 'sidebar.stats',
    icon: <BarChart3 size={ICON_SIZE} strokeWidth={STROKE} />,
    path: 'stats',
  },
  {
    key: 'plan',
    labelKey: 'sidebar.plan',
    icon: <CreditCard size={ICON_SIZE} strokeWidth={STROKE} />,
    path: 'plan',
  },
  {
    key: 'legal',
    labelKey: 'sidebar.legal',
    icon: <LifeBuoy size={ICON_SIZE} strokeWidth={STROKE} />,
    path: 'legal',
  },
]

export function Sidebar() {
  const { collapsed, isDesktop, mobileMenuOpen, setMobileMenuOpen } = useLayout()
  const { counts: unreadCounts } = useUnreadCounts()
  const { locale, toggleLocale } = useLocale()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const location = useLocation()
  const router = useRouter()
  const isProfileActive = location.pathname.includes(`/${orgSlug}/notifications`)

  const handleLogout = async () => {
    await logout()
    await router.invalidate()
    navigate({ to: '/auth/login' })
  }

  const handleToggleLocale = () => {
    const newLocale = locale === 'fr' ? 'en' : 'fr'
    toggleLocale()
    syncDayjsLocale(newLocale)
  }

  const isActive = (path: string) => {
    return location.pathname.includes(`/${orgSlug}/${path}`)
  }

  const handleNavigate = (path: string) => {
    if (!isDesktop) setMobileMenuOpen(false)
    navigate({ to: `/app/$orgSlug/${path}` as string, params: { orgSlug } })
  }

  const sidebarClass = [
    'sidebar',
    collapsed && isDesktop ? 'sidebar--collapsed' : '',
    !isDesktop && mobileMenuOpen ? 'sidebar--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {/* Mobile overlay (transparent, closes menu on click outside) */}
      {!isDesktop && (
        <button
          type="button"
          aria-label={t('sidebar.close_menu')}
          onClick={() => setMobileMenuOpen(false)}
          className={`sidebar-overlay ${!mobileMenuOpen ? 'sidebar-overlay--hidden' : ''}`}
        />
      )}

      <aside className={sidebarClass}>
        {/* Org Switcher — sticky top */}
        <div className="flex-shrink-0 px-3 pt-3 pb-1">
          <OrgSwitcher collapsed={collapsed && isDesktop} />
        </div>

        {/* Main Navigation — scrollable */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-1 py-2">
          {mainGroups.map((group, gi) => (
            <div key={gi}>
              {group.titleKey && !(collapsed && isDesktop) && (
                <div className="sidebar__nav-group-title">{t(group.titleKey)}</div>
              )}
              {collapsed && isDesktop && group.titleKey && (
                <div className="mx-4 my-2 h-px bg-border-subtle" />
              )}
              {group.items.map((item) => {
                const active = isActive(item.path)
                const isCollapsed = collapsed && isDesktop
                const badge = item.unreadProvider
                  ? unreadCounts[item.unreadProvider] || undefined
                  : item.badge
                const label = t(item.labelKey)
                const btn = (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                    className={`sidebar__nav-item ${active ? 'sidebar__nav-item--active' : ''}`}
                    style={isCollapsed ? { justifyContent: 'center', padding: '8px' } : undefined}
                  >
                    <span className="relative flex-shrink-0">
                      {item.icon}
                      {isCollapsed && badge ? (
                        <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-text-primary" />
                      ) : null}
                    </span>
                    {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
                    {!isCollapsed && badge ? (
                      <span className="sidebar__nav-badge">{badge > 99 ? '99+' : badge}</span>
                    ) : null}
                  </button>
                )
                return collapsed && isDesktop ? (
                  <Tooltip key={item.key} title={label} placement="right">
                    {btn}
                  </Tooltip>
                ) : (
                  btn
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom section — sticky bottom */}
        <div className="flex flex-shrink-0 flex-col border-t border-border-subtle px-1 py-2">
          {bottomItems.map((item) => {
            const active = isActive(item.path)
            const label = t(item.labelKey)
            const btn = (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.path)}
                className={`sidebar__nav-item ${active ? 'sidebar__nav-item--active' : ''}`}
                style={
                  collapsed && isDesktop ? { justifyContent: 'center', padding: '8px' } : undefined
                }
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!(collapsed && isDesktop) && <span>{label}</span>}
              </button>
            )
            return collapsed && isDesktop ? (
              <Tooltip key={item.key} title={label} placement="right">
                {btn}
              </Tooltip>
            ) : (
              btn
            )
          })}

          {/* User profile */}
          <div className="mx-2 mt-2 border-t border-border-subtle pt-2">
            <Popover
              trigger="click"
              placement={collapsed && isDesktop ? 'rightBottom' : 'topRight'}
              content={
                <div className="flex flex-col" style={{ minWidth: 200 }}>
                  <Button
                    type={'text'}
                    onClick={() => {
                      if (!isDesktop) setMobileMenuOpen(false)
                      navigate({
                        to: '/app/$orgSlug/dashboard' as string,
                        params: { orgSlug },
                      })
                    }}
                    icon={<LayoutDashboard size={16} strokeWidth={1} />}
                  >
                    {t('sidebar.recap')}
                  </Button>
                  <Button
                    type={'text'}
                    onClick={() => {
                      if (!isDesktop) setMobileMenuOpen(false)
                      navigate({
                        to: '/app/$orgSlug/notifications' as string,
                        params: { orgSlug },
                      })
                    }}
                    icon={<Bell size={16} strokeWidth={1} />}
                  >
                    {t('sidebar.notification_prefs')}
                  </Button>
                  <Button
                    type={'text'}
                    onClick={handleToggleLocale}
                    icon={<Languages size={16} strokeWidth={1} />}
                  >
                    {locale === 'fr' ? t('sidebar.use_english') : t('sidebar.use_french')}
                  </Button>
                  <Divider className={'my-1!'} />
                  <Button
                    danger
                    type={'text'}
                    icon={<LogOut size={16} strokeWidth={1} />}
                    onClick={handleLogout}
                  >
                    {t('sidebar.logout')}
                  </Button>
                </div>
              }
            >
              <button
                type="button"
                className={`sidebar__profile-btn ${isProfileActive ? 'sidebar__profile-btn--active' : ''}`}
                style={collapsed && isDesktop ? { justifyContent: 'center' } : undefined}
              >
                <Avatar
                  size={32}
                  icon={<User size={16} strokeWidth={STROKE} />}
                  style={{ background: '#f0f0f0', color: '#666', flexShrink: 0 }}
                />
                {!(collapsed && isDesktop) && (
                  <div className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-sm font-medium text-text-primary">
                      Konan Achi
                    </span>
                    <span className="truncate text-xs text-text-muted">konan@example.com</span>
                  </div>
                )}
              </button>
            </Popover>
          </div>
        </div>
      </aside>
    </>
  )
}

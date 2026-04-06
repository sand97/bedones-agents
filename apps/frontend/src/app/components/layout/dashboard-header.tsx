import type { ReactNode } from 'react'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { useLayout } from '@app/contexts/layout-context'

interface DashboardHeaderProps {
  title: string
  /** Shorter title for mobile */
  mobileTitle?: string
  action?: ReactNode
  /** Replaces the entire left side (toggle + title) on mobile */
  mobileLeft?: ReactNode
}

export function DashboardHeader({ title, mobileTitle, action, mobileLeft }: DashboardHeaderProps) {
  const { t } = useTranslation()
  const { isDesktop, collapsed, mobileMenuOpen, toggleCollapsed } = useLayout()

  const sidebarOpen = isDesktop ? !collapsed : mobileMenuOpen

  return (
    <header className="sticky top-0 z-100 flex h-14 items-center gap-3 border-b border-border-subtle bg-bg-surface px-4">
      {/* Mobile: show custom left content if provided */}
      {!isDesktop && mobileLeft ? (
        <div className="flex flex-1 items-center gap-3">{mobileLeft}</div>
      ) : (
        <>
          <Button
            type="text"
            onClick={toggleCollapsed}
            icon={
              sidebarOpen ? (
                <PanelLeftClose size={20} strokeWidth={1} />
              ) : (
                <PanelLeftOpen size={20} strokeWidth={1} />
              )
            }
            aria-label={sidebarOpen ? t('sidebar.collapse_sidebar') : t('sidebar.expand_sidebar')}
          />
          <h1 className="m-0 flex-1 truncate pr-20 text-base font-medium text-text-primary">
            {!isDesktop && mobileTitle ? mobileTitle : title}
          </h1>
        </>
      )}
      {action}
    </header>
  )
}

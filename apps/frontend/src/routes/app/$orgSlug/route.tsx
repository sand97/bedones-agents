import { createFileRoute, Outlet } from '@tanstack/react-router'
import { LayoutProvider, useLayout } from '@app/contexts/layout-context'
import { UnreadProvider } from '@app/contexts/unread-context'
import { SocketProvider } from '@app/contexts/socket-context'
import { Sidebar } from '@app/components/layout/sidebar'

export const Route = createFileRoute('/app/$orgSlug')({
  component: DashboardLayout,
})

function DashboardLayoutContent() {
  const { collapsed, isDesktop, mobileMenuOpen } = useLayout()

  const contentClass = [
    'page-content',
    collapsed && isDesktop ? 'page-content--collapsed' : '',
    !isDesktop && mobileMenuOpen ? 'page-content--mobile-menu-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className={contentClass}>
        <Outlet />
      </main>
    </div>
  )
}

function DashboardLayout() {
  return (
    <LayoutProvider>
      <SocketProvider>
        <UnreadProvider>
          <DashboardLayoutContent />
        </UnreadProvider>
      </SocketProvider>
    </LayoutProvider>
  )
}

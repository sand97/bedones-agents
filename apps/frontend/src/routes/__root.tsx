import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import '@app/i18n'
import { getStoredLocale } from '@app/i18n'
import { LocaleProvider } from '@app/contexts/locale-context'
import { PostHogProvider } from '@app/contexts/posthog-provider'

import appStyles from '../styles.css?url'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before data is considered stale
      refetchOnWindowFocus: false,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      { title: 'Bedones — CRM Social' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appStyles,
      },
    ],
  }),
  component: RootComponent,
})

function RootDocument({ children }: { children: ReactNode }) {
  const initialLocale = typeof window !== 'undefined' ? getStoredLocale() : 'fr'
  return (
    <html lang={initialLocale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

// Public, SEO-facing routes are plain HTML/CSS marketing pages that don't
// depend on Ant Design. We render their content during SSR (and on the very
// first client paint, before the client-only Antd providers mount) so search
// engines and social scrapers receive real HTML instead of an empty shell.
// App/auth routes keep their previous behaviour: they only render once Antd is
// mounted on the client, which also avoids running Antd on the server.
const PUBLIC_PREFIXES = ['/blog', '/pricing', '/legal']

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  )
}

function RootComponent() {
  const [AntdProviders, setAntdProviders] = useState<ComponentType<{ children: ReactNode }> | null>(
    null,
  )
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    import('../app/core/antd-providers').then((mod) => {
      setAntdProviders(() => mod.default)
    })
  }, [])

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider>
          <LocaleProvider>
            {AntdProviders ? (
              <AntdProviders>
                <Outlet />
              </AntdProviders>
            ) : isPublicPath(pathname) ? (
              <Outlet />
            ) : (
              <div />
            )}
          </LocaleProvider>
        </PostHogProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

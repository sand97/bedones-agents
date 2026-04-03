import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useState } from 'react'

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
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Bedones — CRM Social' },
      {
        name: 'description',
        content: 'Centralisez vos interactions sociales en opportunites commerciales.',
      },
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
  return (
    <html lang="fr">
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

function RootComponent() {
  const [AntdProviders, setAntdProviders] = useState<ComponentType<{ children: ReactNode }> | null>(
    null,
  )

  useEffect(() => {
    import('../app/core/antd-providers').then((mod) => {
      setAntdProviders(() => mod.default)
    })
  }, [])

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {AntdProviders ? (
          <AntdProviders>
            <Outlet />
          </AntdProviders>
        ) : (
          <div />
        )}
      </QueryClientProvider>
    </RootDocument>
  )
}

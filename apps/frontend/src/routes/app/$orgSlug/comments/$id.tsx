import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Button, Empty } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { CommentsLayout } from '@app/components/comments/comments-layout'
import { MOCK_POSTS } from '@app/components/comments/mock-data'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'

export const Route = createFileRoute('/app/$orgSlug/comments/$id')({
  component: CommentsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    post: (search.post as string) || undefined,
    filter: (search.filter as string) || undefined,
  }),
})

const ICON_SIZE = 40

const COMMENT_CONFIG: Record<
  string,
  {
    label: string
    mobileLabel: string
    icon: ReactNode
    color: string
    title: string
    description: string
    button: string
    connectLabel: string
  }
> = {
  facebook: {
    label: 'Commentaires Facebook',
    mobileLabel: 'Facebook',
    icon: <FacebookIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-facebook)',
    title: 'Connecter Facebook',
    description:
      'Reliez votre page Facebook pour suivre et répondre aux commentaires de vos publications directement depuis Bedones.',
    button: 'Connecter une page Facebook',
    connectLabel: 'Connecter une page',
  },
  instagram: {
    label: 'Commentaires Instagram',
    mobileLabel: 'Instagram',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    title: 'Connecter Instagram',
    description:
      'Reliez votre compte Instagram professionnel pour gérer les commentaires de vos publications directement depuis Bedones.',
    button: 'Connecter un compte Instagram',
    connectLabel: 'Connecter un compte',
  },
  tiktok: {
    label: 'Commentaires TikTok',
    mobileLabel: 'TikTok',
    icon: <TikTokIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-tiktok)',
    title: 'Connecter TikTok',
    description:
      'Reliez votre compte TikTok Business pour suivre et répondre aux commentaires de vos vidéos directement depuis Bedones.',
    button: 'Connecter un compte TikTok',
    connectLabel: 'Connecter un compte',
  },
}

const MOCK_FB_ACCOUNTS: SocialAccount[] = [
  { id: '1', name: 'Mboa Fashion' },
  { id: '2', name: 'Chez Fatou Boutique' },
]

function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() => navigate({ search: {} as never })}
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Posts
    </Button>
  )
}

function TikTokPage({ config }: { config: (typeof COMMENT_CONFIG)[string] }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 3000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader
        title={config.label}
        mobileTitle={config.mobileLabel}
        action={
          <AccountSwitcher
            accounts={[{ id: '1', name: 'mboafashion_tiktok' }]}
            currentAccount={{ id: '1', name: 'mboafashion_tiktok' }}
            connectLabel={config.connectLabel}
          />
        }
      />
      <CommentsLayout posts={[]} loading={loading} />
    </div>
  )
}

function CommentsPage() {
  const { id } = useParams({ from: '/app/$orgSlug/comments/$id' })
  const search = useSearch({ from: '/app/$orgSlug/comments/$id' })
  const { isDesktop } = useLayout()
  const config = COMMENT_CONFIG[id]
  const title = config?.label || `Commentaires — ${id}`

  const hasSelectedPost = !!search.post

  if (!config) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={title} />
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Page introuvable
        </div>
      </div>
    )
  }

  // Facebook: full comments UI with mock data
  if (id === 'facebook') {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader
          title={config.label}
          mobileTitle={config.mobileLabel}
          action={
            <AccountSwitcher
              accounts={MOCK_FB_ACCOUNTS}
              currentAccount={MOCK_FB_ACCOUNTS[0]}
              connectLabel={config.connectLabel}
            />
          }
          mobileLeft={hasSelectedPost && !isDesktop ? <MobileBackButton /> : undefined}
        />
        <CommentsLayout posts={MOCK_POSTS} />
      </div>
    )
  }

  // Instagram: connected but no comments yet
  if (id === 'instagram') {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader
          title={title}
          action={
            <AccountSwitcher
              accounts={[{ id: '1', name: 'mboafashion_officiel' }]}
              currentAccount={{ id: '1', name: 'mboafashion_officiel' }}
              connectLabel={config.connectLabel}
            />
          }
        />
        <div className="flex flex-1 items-center justify-center">
          <Empty description={false}>
            <div className="text-center">
              <div className="text-sm font-medium text-text-primary">Aucun commentaire reçu</div>
              <div className="mt-1 text-xs text-text-muted">
                Les commentaires de vos publications Instagram apparaîtront ici
              </div>
            </div>
          </Empty>
        </div>
      </div>
    )
  }

  // TikTok: loading skeleton use case
  if (id === 'tiktok') {
    return <TikTokPage config={config} />
  }

  // Others: setup screen
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title={title} />
      <SocialSetup
        icon={config.icon}
        color={config.color}
        title={config.title}
        description={config.description}
        buttonLabel={config.button}
      />
    </div>
  )
}

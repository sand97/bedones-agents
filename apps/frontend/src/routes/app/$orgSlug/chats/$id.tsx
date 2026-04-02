import type { ReactNode } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { ChatLayout } from '@app/components/whatsapp/chat-layout'
import { MOCK_CONVERSATIONS } from '@app/components/whatsapp/mock-data'
import { WhatsAppIcon, InstagramIcon, MessengerIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'

export const Route = createFileRoute('/app/$orgSlug/chats/$id')({
  component: ChatsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: (search.conv as string) || undefined,
    ticket: (search.ticket as string) || undefined,
  }),
})

const ICON_SIZE = 40

const CHAT_CONFIG: Record<
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
  whatsapp: {
    label: 'WhatsApp',
    mobileLabel: 'WhatsApp',
    icon: <WhatsAppIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-whatsapp)',
    title: 'Connecter un numéro Whatsapp',
    description:
      'Associez votre compte WhatsApp Business via Facebook Cloud API pour centraliser vos conversations et répondre à vos clients directement depuis Bedones.',
    button: 'Connecter un numéro WhatsApp',
    connectLabel: 'Connecter un numéro',
  },
  'instagram-dm': {
    label: 'Messages Instagram',
    mobileLabel: 'Instagram DM',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    title: 'Connecter Instagram Direct',
    description:
      'Reliez votre compte Instagram professionnel pour recevoir et répondre aux messages directs de vos clients depuis Bedones.',
    button: 'Connecter un compte Instagram',
    connectLabel: 'Connecter un compte',
  },
  messenger: {
    label: 'Messenger',
    mobileLabel: 'Messenger',
    icon: <MessengerIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-messenger)',
    title: 'Connecter Messenger',
    description:
      'Reliez votre page Facebook pour gérer les conversations Messenger de vos clients directement depuis Bedones.',
    button: 'Connecter une page Facebook',
    connectLabel: 'Connecter une page',
  },
}

const MOCK_WA_ACCOUNTS: SocialAccount[] = [
  { id: '1', name: '+237 691 000 001' },
  { id: '2', name: '+237 655 000 002' },
]

/* ── Mobile back button ── */

function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() => navigate({ search: {} as never })}
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Chats
    </Button>
  )
}

function ChatsPage() {
  const { id } = useParams({ from: '/app/$orgSlug/chats/$id' })
  const search = useSearch({ from: '/app/$orgSlug/chats/$id' })
  const { isDesktop } = useLayout()
  const config = CHAT_CONFIG[id]
  const title = config?.label || `Messagerie — ${id}`

  const hasSelectedConv = !!search.conv

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

  // WhatsApp: full chat UI with mock data
  if (id === 'whatsapp') {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader
          title={config.label}
          mobileTitle={config.mobileLabel}
          action={
            <AccountSwitcher
              accounts={MOCK_WA_ACCOUNTS}
              currentAccount={MOCK_WA_ACCOUNTS[0]}
              connectLabel={config.connectLabel}
              icon={<WhatsAppIcon width={18} height={18} className="text-brand-whatsapp" />}
            />
          }
          mobileLeft={hasSelectedConv && !isDesktop ? <MobileBackButton /> : undefined}
        />
        <ChatLayout conversations={MOCK_CONVERSATIONS} />
      </div>
    )
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

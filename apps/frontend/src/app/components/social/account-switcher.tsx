import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button } from 'antd'
import { ChevronUpDownIcon } from '@app/components/icons/social-icons'
import { SwitcherPopover } from '@app/components/shared/switcher-popover'

export interface SocialAccount {
  id: string
  name: string
  avatarUrl?: string
}

interface AccountSwitcherProps {
  accounts: SocialAccount[]
  currentAccount: SocialAccount
  connectLabel: string
  /** Optional icon to replace the avatar (e.g. WhatsAppIcon) */
  icon?: ReactNode
  onSwitch?: (account: SocialAccount) => void
  onConnect?: () => void
}

export function AccountSwitcher({
  accounts,
  currentAccount,
  connectLabel,
  icon,
  onSwitch,
  onConnect,
}: AccountSwitcherProps) {
  const { t } = useTranslation()
  const options = accounts.map((account) => ({
    id: account.id,
    isCurrent: account.id === currentAccount.id,
    label: (
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className="flex flex-shrink-0 items-center justify-center"
            style={{ width: 32, height: 32 }}
          >
            {icon}
          </span>
        ) : (
          <Avatar size={32} src={account.avatarUrl} style={{ flexShrink: 0 }}>
            {account.name[0]}
          </Avatar>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {account.name}
        </span>
      </div>
    ),
  }))

  return (
    <SwitcherPopover
      title={t('social.connected_accounts')}
      options={options}
      addLabel={connectLabel}
      placement="bottomRight"
      onSelect={(id) => {
        const account = accounts.find((a) => a.id === id)
        if (account) onSwitch?.(account)
      }}
      onAdd={onConnect}
    >
      <Button type="default" className="flex items-center gap-2 text-text-primary">
        {icon ? (
          <span className="flex flex-shrink-0 items-center justify-center">{icon}</span>
        ) : (
          <Avatar size={20} src={currentAccount.avatarUrl} className="flex-shrink-0">
            {currentAccount.name[0]}
          </Avatar>
        )}
        {currentAccount.name}
        <ChevronUpDownIcon width={20} height={20} />
      </Button>
    </SwitcherPopover>
  )
}

import { Avatar } from 'antd'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ChevronUpDownIcon } from '@app/components/icons/social-icons'
import { SwitcherPopover } from '@app/components/shared/switcher-popover'

interface Organization {
  id: string
  name: string
  slug: string
  plan: string
}

const MOCK_ORGS: Organization[] = [
  { id: '1', name: 'Ma Boutique Abidjan', slug: 'demo-org', plan: 'Pro' },
  { id: '2', name: 'Chez Fatou Mode', slug: 'fatou-mode', plan: 'Free' },
  { id: '3', name: 'Tech Services CI', slug: 'tech-services', plan: 'Free' },
]

interface OrgSwitcherProps {
  collapsed?: boolean
}

export function OrgSwitcher({ collapsed }: OrgSwitcherProps) {
  const { t } = useTranslation()
  const currentOrg = MOCK_ORGS[0]

  const options = MOCK_ORGS.map((org) => ({
    id: org.id,
    isCurrent: org.id === currentOrg.id,
    label: (
      <div className="flex items-center gap-3">
        <Avatar
          size={32}
          style={{ background: '#f0f0f0', color: '#666', flexShrink: 0 }}
          icon={<Building2 size={16} strokeWidth={1} />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-text-primary">{org.name}</span>
          <span className="text-xs text-text-muted">{org.plan}</span>
        </div>
      </div>
    ),
  }))

  return (
    <SwitcherPopover
      title="Organisations"
      options={options}
      addLabel={t('org.create')}
      placement="bottomLeft"
    >
      <button
        type="button"
        className={`flex w-full items-center gap-3 rounded-xl border-none bg-transparent p-2 text-left transition-colors hover:bg-bg-subtle cursor-pointer${collapsed ? ' justify-center' : ''}`}
      >
        <Avatar
          size={36}
          style={{ background: '#f0f0f0', color: '#666', flexShrink: 0 }}
          icon={<Building2 size={18} strokeWidth={1} />}
        />
        {!collapsed && (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-text-primary">
                {currentOrg.name}
              </span>
              <span className="text-xs text-text-muted">{currentOrg.plan}</span>
            </div>
            <ChevronUpDownIcon width={20} height={20} className="flex-shrink-0 text-text-muted" />
          </>
        )}
      </button>
    </SwitcherPopover>
  )
}

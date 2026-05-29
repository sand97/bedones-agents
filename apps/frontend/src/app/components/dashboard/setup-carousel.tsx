import { useMemo, useRef, useState } from 'react'
import { Avatar, Button, Carousel } from 'antd'
import type { CarouselRef } from 'antd/es/carousel'
import { ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/icons/social-icons'
import type { components } from '@app/lib/api/v1'

type SetupStatus = components['schemas']['SetupStatusResponseDto']
type PendingComment = components['schemas']['PendingCommentsStepDto']
type PendingAgent = components['schemas']['PendingAgentStepDto']

/** Unified step shape consumed by the carousel renderer. */
export interface SetupStep {
  key: string
  kind: 'catalog' | 'comments' | 'agent'
  socialAccountId?: string
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  /** Either a brand icon (renders inside a colored chip) or a generic Lucide icon. */
  icon: React.ReactNode
  iconColor: string
  /** Page avatar to display in the centered chip; falls back to `icon`. */
  pageAvatarUrl?: string | null
  pageName?: string | null
}

interface SetupCarouselProps {
  status: SetupStatus
  onConfigureCatalog: () => void
  onConfigureComments: (step: PendingComment) => void
  onConfigureAgent: (step: PendingAgent) => void
}

/**
 * Builds the ordered list of remaining onboarding steps and renders them as a
 * navigable carousel. The order is catalog → comments → agent, matching the
 * back-end and the task description.
 */
export function SetupCarousel({
  status,
  onConfigureCatalog,
  onConfigureComments,
  onConfigureAgent,
}: SetupCarouselProps) {
  const { t } = useTranslation()
  const carouselRef = useRef<CarouselRef | null>(null)
  const [current, setCurrent] = useState(0)

  const steps = useMemo<SetupStep[]>(() => {
    const out: SetupStep[] = []

    if (status.catalogPending) {
      out.push({
        key: 'catalog',
        kind: 'catalog',
        title: t('dashboard.step_catalog_title'),
        description: t('dashboard.step_catalog_desc'),
        actionLabel: t('dashboard.step_catalog_action'),
        onAction: onConfigureCatalog,
        icon: <ShoppingBag size={24} strokeWidth={1.6} />,
        iconColor: 'var(--color-text-muted)',
      })
    }

    for (const step of status.pendingComments) {
      const branding = providerBranding(step.provider)
      out.push({
        key: `comments-${step.socialAccountId}`,
        kind: 'comments',
        socialAccountId: step.socialAccountId,
        title: step.pageName ?? branding.name,
        description: t('dashboard.step_comments_desc', { page: step.pageName ?? branding.name }),
        actionLabel: t('dashboard.step_comments_action'),
        onAction: () => onConfigureComments(step),
        icon: <branding.Icon width={24} height={24} />,
        iconColor: branding.color,
        pageAvatarUrl: step.profilePictureUrl,
        pageName: step.pageName,
      })
    }

    for (const step of status.pendingAgents) {
      const branding = channelBranding(step.channel)
      const description = describeAgentStep(t, step, branding.name)
      out.push({
        key: `agent-${step.socialAccountId}`,
        kind: 'agent',
        socialAccountId: step.socialAccountId,
        title: step.pageName ?? branding.name,
        description,
        actionLabel: t('dashboard.step_agent_action'),
        onAction: () => onConfigureAgent(step),
        icon: <branding.Icon width={24} height={24} />,
        iconColor: branding.color,
        pageAvatarUrl: step.profilePictureUrl,
        pageName: step.pageName,
      })
    }

    return out
  }, [status, t, onConfigureCatalog, onConfigureComments, onConfigureAgent])

  // Reset to the first slide whenever the set of steps changes (after a save).
  if (current >= steps.length && current > 0) {
    queueMicrotask(() => setCurrent(0))
  }

  if (steps.length === 0) return null

  const isFirst = current === 0
  const isLast = current === steps.length - 1

  return (
    <div className="dashboard-setup-card">
      <Carousel
        ref={carouselRef}
        dots={false}
        infinite={false}
        beforeChange={(_, next) => setCurrent(next)}
      >
        {steps.map((step) => (
          <div key={step.key}>
            <StepBody step={step} />
          </div>
        ))}
      </Carousel>

      <div className="dashboard-setup-card__footer">
        <div className="dashboard-setup-card__count">
          {t('dashboard.step_progress', { current: current + 1, total: steps.length })}
        </div>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button
              size={'small'}
              icon={<ArrowLeft size={14} />}
              onClick={() => carouselRef.current?.prev()}
            >
              {t('common.previous')}
            </Button>
          )}
          {!isLast && (
            <Button
              size={'small'}
              iconPosition="end"
              icon={<ArrowRight size={14} />}
              onClick={() => carouselRef.current?.next()}
            >
              {t('common.next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepBody({ step }: { step: SetupStep }) {
  return (
    <div className="dashboard-setup-card__body">
      <div className="dashboard-setup-card__icon" style={{ color: step.iconColor }}>
        {step.pageAvatarUrl ? (
          <Avatar
            size={56}
            src={step.pageAvatarUrl}
            shape="square"
            style={{ background: `${step.iconColor}14`, color: step.iconColor }}
          />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: `${step.iconColor}14`, color: step.iconColor }}
          >
            {step.icon}
          </div>
        )}
      </div>

      <h3 className="m-0 text-base font-semibold text-text-primary">{step.title}</h3>
      <p className="m-0 max-w-md text-sm text-text-secondary">{step.description}</p>

      <Button type="primary" size="middle" onClick={step.onAction}>
        {step.actionLabel}
      </Button>
    </div>
  )
}

function describeAgentStep(
  t: (k: string, opts?: Record<string, unknown>) => string,
  step: PendingAgent,
  channelName: string,
): string {
  switch (step.agentStatus) {
    case 'NONE':
      return t('dashboard.step_agent_desc_none', {
        channel: channelName,
        page: step.pageName ?? channelName,
      })
    case 'DRAFT_OR_CONFIGURING':
      return t('dashboard.step_agent_desc_configuring', { score: step.agentScore })
    case 'READY_BELOW_THRESHOLD':
      return t('dashboard.step_agent_desc_below_threshold', { score: step.agentScore })
    default:
      return t('dashboard.step_agent_desc_none', {
        channel: channelName,
        page: step.pageName ?? channelName,
      })
  }
}

interface Branding {
  name: string
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode
  color: string
}

function providerBranding(provider: string): Branding {
  switch (provider) {
    case 'FACEBOOK':
      return { name: 'Facebook', Icon: FacebookIcon, color: 'var(--color-brand-facebook)' }
    case 'INSTAGRAM':
      return { name: 'Instagram', Icon: InstagramIcon, color: 'var(--color-brand-instagram)' }
    case 'TIKTOK':
      return { name: 'TikTok', Icon: TikTokIcon, color: 'var(--color-brand-tiktok)' }
    default:
      return { name: provider, Icon: FacebookIcon, color: 'var(--color-text-muted)' }
  }
}

function channelBranding(channel: string): Branding {
  switch (channel) {
    case 'WHATSAPP':
      return { name: 'WhatsApp', Icon: WhatsAppIcon, color: 'var(--color-brand-whatsapp)' }
    case 'MESSENGER':
      return { name: 'Messenger', Icon: MessengerIcon, color: 'var(--color-brand-messenger)' }
    case 'INSTAGRAM_DM':
      return { name: 'Instagram', Icon: InstagramIcon, color: 'var(--color-brand-instagram)' }
    case 'TIKTOK_DM':
      return { name: 'TikTok', Icon: TikTokIcon, color: 'var(--color-brand-tiktok)' }
    default:
      return { name: channel, Icon: WhatsAppIcon, color: 'var(--color-text-muted)' }
  }
}

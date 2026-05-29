import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Card, Checkbox, Input, Steps, Upload, message } from 'antd'
import { ArrowLeft, ArrowRight, Check, MessageSquareText, MessagesSquare, Plus } from 'lucide-react'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/icons/social-icons'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
  buildTikTokOAuthUrl,
} from '@app/lib/auth-redirect'
import { $api } from '@app/lib/api/$api'
import { createOrganisation, updateOrganisation, uploadLogo } from '@app/lib/api'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
} from '@app/lib/onboarding-draft'
import {
  formatSocialAccountDescription,
  formatSocialAccountName,
} from '@app/components/social/account-switcher'

export const Route = createFileRoute('/create-organisation')({
  validateSearch: (search: Record<string, unknown>) => ({
    step: search.step ? Number(search.step) : undefined,
  }),
  component: CreateOrganisationPage,
})

/* ─── Types ─── */

type FeatureType = 'comments' | 'messaging'

interface PlatformBranding {
  name: string
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode
  color: string
}

interface PlatformConfig {
  id: string
  name: string
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode
  color: string
  supportedFeatures: FeatureType[]
  /** When ONLY messaging is selected, use this alternate branding */
  messagingOnlyBranding?: PlatformBranding
  priority: number
  description: string
  connectButton: string
  addMoreLabel: string
}

interface FeatureCategoryConfig {
  id: FeatureType
  label: string
  description: string
  icon: (props: { size?: number; strokeWidth?: number; className?: string }) => ReactNode
  platforms: { id: string; label: string }[]
}

/* ─── Configuration ─── */

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: WhatsAppIcon,
    color: 'var(--color-brand-whatsapp)',
    supportedFeatures: ['messaging'],
    priority: 1,
    description:
      'Associez votre compte WhatsApp Business via Facebook Cloud API pour centraliser vos conversations et recevoir les commandes catalogue.',
    connectButton: 'Connecter un numéro WhatsApp',
    addMoreLabel: 'Connecter un autre numéro',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: FacebookIcon,
    color: 'var(--color-brand-facebook)',
    supportedFeatures: ['comments', 'messaging'],
    messagingOnlyBranding: {
      name: 'Messenger',
      icon: MessengerIcon,
      color: 'var(--color-brand-messenger)',
    },
    priority: 2,
    description:
      'Reliez votre page Facebook pour gérer les commentaires et les conversations Messenger directement depuis Bedones.',
    connectButton: 'Connecter une page Facebook',
    addMoreLabel: 'Connecter une autre page',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: TikTokIcon,
    color: 'var(--color-brand-tiktok)',
    supportedFeatures: ['comments', 'messaging'],
    priority: 3,
    description:
      'Connectez votre compte TikTok Business pour surveiller les commentaires et répondre aux messages directs.',
    connectButton: 'Connecter un compte TikTok',
    addMoreLabel: 'Connecter un autre compte',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: InstagramIcon,
    color: 'var(--color-brand-instagram)',
    supportedFeatures: ['comments', 'messaging'],
    priority: 4,
    description:
      'Reliez votre compte Instagram professionnel pour gérer les commentaires et les messages directs de vos clients.',
    connectButton: 'Connecter un compte Instagram',
    addMoreLabel: 'Connecter un autre compte',
  },
]

const FEATURE_CATEGORIES: FeatureCategoryConfig[] = [
  {
    id: 'comments',
    label: 'Gestion de commentaires',
    description: 'Surveillez et répondez aux commentaires sur vos publications',
    icon: MessagesSquare,
    platforms: [
      { id: 'facebook', label: 'Facebook' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'tiktok', label: 'TikTok' },
    ],
  },
  {
    id: 'messaging',
    label: 'Gestion de messagerie',
    description: 'Centralisez vos conversations et messages directs',
    icon: MessageSquareText,
    platforms: [
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'facebook', label: 'Messenger' },
      { id: 'instagram', label: 'Instagram DM' },
      { id: 'tiktok', label: 'TikTok DM' },
    ],
  },
]

/* ─── Onboarding ─── */

/** Map an onboarding platform id to its social account provider. */
const PROVIDER_BY_PLATFORM: Record<string, 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'> = {
  whatsapp: 'WHATSAPP',
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
}

/** A connected social account, ready to display in a connection step. */
interface ConnectedAccount {
  id: string
  name: string
  description?: string
  /** The page's own profile picture; the platform logo is used as a fallback. */
  avatarUrl?: string
}

/* ─── Helpers ─── */

/** Get which features the user actually selected for this specific platform */
function getSelectedFeaturesForPlatform(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): FeatureType[] {
  return platform.supportedFeatures.filter((f) => selectedFeatures[f].has(platform.id))
}

/** Get the label for a platform step based on which features the user selected */
function getPlatformStepLabel(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)

  if (selected.length === 0) return platform.name

  // If only messaging and platform has alternate branding
  if (selected.length === 1 && selected[0] === 'messaging' && platform.messagingOnlyBranding) {
    return platform.messagingOnlyBranding.name
  }

  const parts: string[] = []
  if (selected.includes('comments')) parts.push('Commentaires')
  if (selected.includes('messaging')) parts.push('Messages')

  return `${parts.join(' et ')} ${platform.name}`
}

/** Get branding (icon, color, name) for a platform based on selected features */
function getPlatformBranding(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): PlatformBranding {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)

  if (selected.length === 1 && selected[0] === 'messaging' && platform.messagingOnlyBranding) {
    return platform.messagingOnlyBranding
  }

  return { name: platform.name, icon: platform.icon, color: platform.color }
}

/** Get the description for a platform step based on selected features */
function getPlatformStepDescription(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)
  const branding = getPlatformBranding(platform, selectedFeatures)

  if (selected.length === 2) {
    return `Connectez ${branding.name} pour gérer les commentaires et les messages de vos clients.`
  }
  if (selected.includes('comments')) {
    return `Connectez ${branding.name} pour surveiller et répondre aux commentaires de vos publications.`
  }
  return `Connectez ${branding.name} à notre système pour qu'il réponde à vos clients. Pas de panique il ne sera actif qu'après configuration`
}

/**
 * Get the Facebook Login Configuration ID for a given platform based on selected features.
 * These configuration IDs are set up in Meta Business Suite and define which permissions to request.
 */
function getConfigIdForPlatform(
  platformId: string,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string | null {
  const hasComments = selectedFeatures.comments.has(platformId)
  const hasMessaging = selectedFeatures.messaging.has(platformId)

  if (platformId === 'facebook') {
    if (hasComments && hasMessaging)
      return import.meta.env.VITE_FB_COMMENTS_MESSAGES_CONFIGGURATION_ID
    if (hasComments) return import.meta.env.VITE_FB_COMMENTS_CONFIGGURATION_ID
    if (hasMessaging) return import.meta.env.VITE_FB_MESSAGES_CONFIGGURATION_ID
  }

  // Instagram uses its own OAuth with scopes, no config_id needed
  if (platformId === 'instagram') return null

  return null
}

/** Format connected pages for stepper description */
function formatConnectedPages(pages: string[], platformId?: string): string {
  if (pages.length === 0) {
    if (platformId === 'whatsapp') return 'Aucun numéro connecté'
    if (platformId === 'tiktok' || platformId === 'instagram') return 'Aucun compte connecté'
    return 'Aucune page connectée'
  }
  if (pages.length <= 2) return pages.join(', ')
  return `${pages.slice(0, 2).join(', ')} +${pages.length - 2}`
}

/* ─── Main component ─── */

function CreateOrganisationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { step: searchStep } = Route.useSearch()

  // Restore any in-progress onboarding (survives OAuth redirects and re-login).
  const [draft] = useState(readOnboardingDraft)

  const [currentStep, setCurrentStep] = useState(draft.step ?? searchStep ?? 0)
  const [orgName, setOrgName] = useState(draft.orgName ?? '')
  const [orgLogo, setOrgLogo] = useState<string | null>(null)
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null)
  const [orgId, setOrgId] = useState<string | null>(draft.orgId ?? null)
  const [savingOrg, setSavingOrg] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Feature selections: which feature+platform combos the user picked
  const [selectedFeatures, setSelectedFeatures] = useState<Record<FeatureType, Set<string>>>(
    () => ({
      comments: new Set<string>(draft.comments ?? []),
      messaging: new Set<string>(draft.messaging ?? []),
    }),
  )

  // ─── Real data ───
  const meQuery = $api.useQuery('get', '/auth/me')
  const accountsQuery = $api.useQuery(
    'get',
    '/social/accounts/{organisationId}',
    { params: { path: { organisationId: orgId ?? '' } } },
    { enabled: !!orgId },
  )
  const accounts = accountsQuery.data ?? []
  const connectWhatsApp = $api.useMutation('post', '/social/connect/whatsapp')

  // Resume an existing organisation the user administers that has no social
  // account yet (abandoned onboarding then logged back in) — avoids creating a
  // duplicate. Its creation step is already done, so jump to the network choice.
  useEffect(() => {
    if (orgId) return
    const orgs = meQuery.data?.organisations
    if (!orgs?.length) return
    const resumable = orgs.find(
      (o) => o.socialAccounts.length === 0 && (o.role === 'OWNER' || o.role === 'ADMIN'),
    )
    if (resumable) {
      setOrgId(resumable.id)
      setOrgName((prev) => prev || resumable.name)
      setCurrentStep((s) => Math.max(s, 1))
    }
  }, [meQuery.data, orgId])

  // Persist the draft so the flow survives OAuth redirects / re-login.
  useEffect(() => {
    writeOnboardingDraft({
      orgId: orgId ?? undefined,
      orgName: orgName || undefined,
      step: currentStep,
      comments: [...selectedFeatures.comments],
      messaging: [...selectedFeatures.messaging],
    })
  }, [orgId, orgName, currentStep, selectedFeatures])

  // Derive which features are active (at least one platform selected)
  const activeFeatures = useMemo<FeatureType[]>(() => {
    const features: FeatureType[] = []
    if (selectedFeatures.comments.size > 0) features.push('comments')
    if (selectedFeatures.messaging.size > 0) features.push('messaging')
    return features
  }, [selectedFeatures])

  // Derive which platforms need connection steps
  const requiredPlatforms = useMemo(() => {
    const platformIds = new Set<string>()
    for (const feature of activeFeatures) {
      for (const platformId of selectedFeatures[feature]) {
        platformIds.add(platformId)
      }
    }

    return PLATFORMS.filter((p) => platformIds.has(p.id)).sort((a, b) => a.priority - b.priority)
  }, [activeFeatures, selectedFeatures])

  // Group the real connected accounts by onboarding platform id.
  const connectedByPlatform = useMemo(() => {
    const map: Record<string, ConnectedAccount[]> = {}
    for (const account of accounts) {
      const platformId = Object.keys(PROVIDER_BY_PLATFORM).find(
        (key) => PROVIDER_BY_PLATFORM[key] === account.provider,
      )
      if (!platformId) continue
      ;(map[platformId] ??= []).push({
        id: account.id,
        name: formatSocialAccountName(account),
        description: formatSocialAccountDescription(account),
        avatarUrl: account.profilePictureUrl ?? undefined,
      })
    }
    return map
  }, [accounts])

  // Build all steps: org creation + feature selection + platform connections
  const steps = useMemo(() => {
    const base = [
      { key: 'org', title: 'Organisation' },
      { key: 'features', title: 'Fonctionnalités' },
    ]

    const platformSteps = requiredPlatforms.map((p) => ({
      key: `connect-${p.id}`,
      title: getPlatformStepLabel(p, selectedFeatures),
      platformId: p.id,
      description: formatConnectedPages(
        (connectedByPlatform[p.id] ?? []).map((a) => a.name),
        p.id,
      ),
    }))

    return [...base, ...platformSteps]
  }, [requiredPlatforms, selectedFeatures, connectedByPlatform])

  // Ensure currentStep doesn't exceed available steps
  const safeCurrentStep = Math.min(currentStep, steps.length - 1)
  const isLastStep = safeCurrentStep === steps.length - 1 && steps.length > 2

  const canGoNext = () => {
    if (safeCurrentStep === 0) return orgName.trim().length > 0
    if (safeCurrentStep === 1) return activeFeatures.length > 0
    return true
  }

  const handleNext = async () => {
    // Step 0 → create (or update) the organisation now that we have the name,
    // so every connection step below has a real organisationId to use.
    if (safeCurrentStep === 0) {
      const name = orgName.trim()
      if (!name) return
      setSavingOrg(true)
      try {
        let id = orgId
        if (!id) {
          const org = await createOrganisation(name)
          id = org.id
          setOrgId(org.id)
        } else {
          await updateOrganisation(id, { name })
        }
        // Best-effort logo upload — never blocks the rest of the flow.
        if (orgLogoFile && id) {
          try {
            const logoUrl = await uploadLogo(orgLogoFile)
            await updateOrganisation(id, { logoUrl })
            setOrgLogoFile(null)
          } catch (err) {
            console.error('[Onboarding] Logo upload failed:', err)
          }
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Échec de la création de l'organisation")
        setSavingOrg(false)
        return
      }
      setSavingOrg(false)
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFinish = () => {
    clearOnboardingDraft()
    if (orgId) {
      navigate({ to: '/app/$orgSlug/dashboard', params: { orgSlug: orgId } })
    } else {
      navigate({ to: '/organisations' })
    }
  }

  const handleTogglePlatform = (feature: FeatureType, platformId: string) => {
    setSelectedFeatures((prev) => {
      const next = { ...prev, [feature]: new Set(prev[feature]) }
      if (next[feature].has(platformId)) {
        next[feature].delete(platformId)
      } else {
        next[feature].add(platformId)
      }
      return next
    })
  }

  const handleConnect = async (platformId: string) => {
    if (!orgId) {
      message.error("L'organisation n'est pas encore prête, réessayez dans un instant.")
      return
    }

    // WhatsApp → Embedded Signup popup, then persist via the API (no redirect).
    if (platformId === 'whatsapp') {
      setConnecting(true)
      try {
        const appId = import.meta.env.VITE_FACEBOOK_APP_ID
        const waConfigId = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID
        if (!appId || !waConfigId) return
        const { loginResponse, sessionInfo } = await launchWhatsAppSignup(appId, waConfigId)
        if (!loginResponse.authResponse?.code) return
        await connectWhatsApp.mutateAsync({
          body: {
            organisationId: orgId,
            code: loginResponse.authResponse.code,
            wabaId: sessionInfo.waba_id,
            phoneNumberId: sessionInfo.phone_number_id,
          },
        })
        queryClient.invalidateQueries({
          queryKey: ['get', '/social/accounts/{organisationId}'],
        })
      } catch (err) {
        console.error('[Onboarding] WhatsApp connect failed:', err)
        message.error(err instanceof Error ? err.message : 'Échec de la connexion WhatsApp')
      } finally {
        setConnecting(false)
      }
      return
    }

    // FB / IG / TikTok → OAuth redirect. The callback persists the account and
    // returns here (returnTo); the draft restores the flow on remount.
    const hasComments = selectedFeatures.comments.has(platformId)
    const hasMessaging = selectedFeatures.messaging.has(platformId)
    const returnTo = '/create-organisation'

    if (platformId === 'facebook') {
      const configId = getConfigIdForPlatform('facebook', selectedFeatures)
      if (!configId) return
      setAuthRedirect({
        intent: 'connect_pages',
        orgId,
        provider: 'facebook',
        pageId: 'facebook',
        scopes: [...(hasComments ? ['comments'] : []), ...(hasMessaging ? ['messages'] : [])],
        returnTo,
      })
      window.location.href = buildFacebookOAuthUrl(configId)
      return
    }

    if (platformId === 'instagram') {
      const igScope =
        hasComments && hasMessaging
          ? ('comments+messages' as const)
          : hasMessaging
            ? ('messages' as const)
            : ('comments' as const)
      setAuthRedirect({
        intent: 'connect_pages',
        orgId,
        provider: 'instagram',
        pageId: 'instagram',
        igScope,
        scopes: [...(hasComments ? ['comments'] : []), ...(hasMessaging ? ['messages'] : [])],
        returnTo,
      })
      window.location.href = buildInstagramOAuthUrl(igScope)
      return
    }

    if (platformId === 'tiktok') {
      const tkScope =
        hasComments && hasMessaging
          ? ('comments+messages' as const)
          : hasMessaging
            ? ('messages' as const)
            : ('comments' as const)
      setAuthRedirect({
        intent: 'connect_pages',
        orgId,
        provider: 'tiktok',
        pageId: 'tiktok',
        scopes: [
          ...(hasComments ? ['comments', 'comment.list', 'comment.list.manage'] : []),
          ...(hasMessaging
            ? ['messages', 'message.list.read', 'message.list.send', 'message.list.manage']
            : []),
          'video.list',
        ],
        returnTo,
      })
      window.location.href = buildTikTokOAuthUrl(tkScope)
      return
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-page p-4">
      {/* Grid background */}
      <div className="onboarding-grid-bg absolute inset-0" />

      {/* Mobile Steps — dots + current step title */}
      <div className="fixed top-0 right-0 left-0 z-10 flex flex-col items-center gap-2 border-b border-border-subtle bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={`rounded-full transition-colors ${
                i === safeCurrentStep
                  ? 'h-2 w-2 bg-text-primary'
                  : i < safeCurrentStep
                    ? 'h-1.5 w-1.5 bg-text-primary'
                    : 'h-1.5 w-1.5 bg-bg-muted'
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-text-primary">
          {steps[safeCurrentStep]?.title}
        </span>
      </div>

      {/* Layout wrapper — stepper left, card center */}
      <div className="relative z-1 flex w-full max-w-xl items-start justify-center pt-16 md:pt-0">
        {/* Corner marks — positioned relative to this wrapper */}
        <div className="onboarding-corner onboarding-corner--tl" />
        <div className="onboarding-corner onboarding-corner--tr" />
        <div className="onboarding-corner onboarding-corner--bl" />
        <div className="onboarding-corner onboarding-corner--br" />
        {/* Stepper — desktop, positioned to the left outside the card */}
        <div className="absolute right-full top-1/2 mr-10 hidden w-52 -translate-y-1/2 md:block">
          <Steps
            current={safeCurrentStep}
            direction="vertical"
            size="small"
            items={steps.map((s, i) => ({
              title: s.title,
              description: i >= 2 ? (s as { description?: string }).description : undefined,
              status: i < safeCurrentStep ? 'finish' : i === safeCurrentStep ? 'process' : 'wait',
            }))}
          />
        </div>

        {/* Main card */}
        <Card className="w-full" classNames={{ body: 'px-4! md:px-6!' }}>
          {/* User profile header */}
          {/*<div className="flex items-center gap-3 mb-8 pb-6 border-b border-border-subtle">*/}
          {/*  <Avatar size={40} icon={<User size={20} />} src={MOCK_USER.avatar} />*/}
          {/*  <div>*/}
          {/*    <div className="text-sm font-semibold text-text-primary">{MOCK_USER.name}</div>*/}
          {/*    <div className="text-xs text-text-soft">{MOCK_USER.email}</div>*/}
          {/*  </div>*/}
          {/*</div>*/}

          {/* Step content */}
          {safeCurrentStep === 0 && (
            <StepOrganisation
              orgName={orgName}
              orgLogo={orgLogo}
              onNameChange={setOrgName}
              onLogoChange={setOrgLogo}
              onLogoFileChange={setOrgLogoFile}
            />
          )}

          {safeCurrentStep === 1 && (
            <StepFeatures selectedFeatures={selectedFeatures} onToggle={handleTogglePlatform} />
          )}

          {safeCurrentStep >= 2 && (
            <StepConnectPlatform
              platform={requiredPlatforms[safeCurrentStep - 2]}
              selectedFeatures={selectedFeatures}
              connectedAccounts={
                connectedByPlatform[requiredPlatforms[safeCurrentStep - 2]?.id] ?? []
              }
              connecting={connecting}
              onConnect={() => handleConnect(requiredPlatforms[safeCurrentStep - 2]?.id)}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border-subtle">
            <div>
              {safeCurrentStep > 0 && (
                <Button onClick={handleBack} icon={<ArrowLeft size={16} />}>
                  Retour
                </Button>
              )}
            </div>
            <div>
              {isLastStep ? (
                <Button type="primary" icon={<Check size={16} />} onClick={handleFinish}>
                  Terminer
                </Button>
              ) : (
                <Button
                  type="primary"
                  onClick={handleNext}
                  loading={savingOrg}
                  disabled={!canGoNext()}
                  icon={<ArrowRight size={16} />}
                  iconPosition="end"
                >
                  Suivant
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ─── Icons ─── */

function UploadImageIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.65037 3.5C5.12937 3.5 3.50037 5.227 3.50037 7.899V16.051C3.50037 18.724 5.12937 20.45 7.65037 20.45H16.3004C18.8274 20.45 20.4604 18.724 20.4604 16.051V7.899C20.4604 5.227 18.8274 3.5 16.3004 3.5H7.65037ZM16.3004 21.95H7.65037C4.27037 21.95 2.00037 19.579 2.00037 16.051V7.899C2.00037 4.371 4.27037 2 7.65037 2H16.3004C19.6854 2 21.9604 4.371 21.9604 7.899V16.051C21.9604 19.579 19.6854 21.95 16.3004 21.95Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.28138 17.1805C5.09538 17.1805 4.91038 17.1125 4.76538 16.9745C4.46438 16.6905 4.45238 16.2145 4.73738 15.9155L6.26538 14.3025C7.07438 13.4435 8.43938 13.4015 9.30238 14.2115L10.2604 15.1835C10.5274 15.4535 10.9614 15.4585 11.2294 15.1945C11.3304 15.0755 13.5084 12.4305 13.5084 12.4305C13.9224 11.9285 14.5064 11.6185 15.1554 11.5545C15.8054 11.4975 16.4364 11.6865 16.9394 12.0995C16.9824 12.1345 17.0214 12.1685 19.2174 14.4235C19.5064 14.7195 19.5014 15.1945 19.2044 15.4835C18.9084 15.7745 18.4324 15.7655 18.1434 15.4695C18.1434 15.4695 16.0944 13.3665 15.9484 13.2245C15.7934 13.0975 15.5444 13.0235 15.2994 13.0475C15.0504 13.0725 14.8264 13.1915 14.6674 13.3845C12.3434 16.2035 12.3154 16.2305 12.2774 16.2675C11.4194 17.1095 10.0344 17.0955 9.19138 16.2355C9.19138 16.2355 8.26138 15.2915 8.24538 15.2725C8.01438 15.0585 7.60238 15.0725 7.35538 15.3335L5.82538 16.9465C5.67738 17.1025 5.47938 17.1805 5.28138 17.1805Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.55757 8.12891C8.00457 8.12891 7.55457 8.57891 7.55457 9.13291C7.55457 9.68691 8.00457 10.1379 8.55857 10.1379C9.11257 10.1379 9.56357 9.68691 9.56357 9.13291C9.56357 8.57991 9.11257 8.12991 8.55757 8.12891ZM8.55857 11.6379C7.17757 11.6379 6.05457 10.5139 6.05457 9.13291C6.05457 7.75191 7.17757 6.62891 8.55857 6.62891C9.94057 6.62991 11.0636 7.75391 11.0636 9.13291C11.0636 10.5139 9.93957 11.6379 8.55857 11.6379Z"
        fill="currentColor"
      />
    </svg>
  )
}

/* ─── Step: Organisation ─── */

function StepOrganisation({
  orgName,
  orgLogo,
  onNameChange,
  onLogoChange,
  onLogoFileChange,
}: {
  orgName: string
  orgLogo: string | null
  onNameChange: (name: string) => void
  onLogoChange: (logo: string | null) => void
  onLogoFileChange: (file: File) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">
          Créer votre organisation
        </h3>
        <p className="m-0 text-sm text-text-secondary">
          Donnez un nom à votre organisation et ajoutez un logo pour personnaliser votre espace.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Nom de l&apos;organisation
        </label>
        <Input
          size="large"
          placeholder="Ex: Ma Boutique Abidjan"
          value={orgName}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <Upload.Dragger
        showUploadList={false}
        accept="image/png, image/jpeg, image/svg+xml, image/webp"
        beforeUpload={(file) => {
          onLogoFileChange(file)
          const reader = new FileReader()
          reader.onload = (e) => onLogoChange(e.target?.result as string)
          reader.readAsDataURL(file)
          return false
        }}
      >
        {orgLogo ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <img
              src={orgLogo}
              alt="Logo"
              className="h-16 w-16 rounded-full object-cover shadow-card"
            />
            <p className="m-0 text-xs text-text-soft">Cliquer pour changer le logo</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadImageIcon />
            <p className="m-0 text-sm font-medium text-text-primary">
              Cliquer pour ajouter votre logo
            </p>
            <p className="m-0 text-xs text-text-soft">PNG, JPG, SVG ou WEBP (max. 2 Mo)</p>
          </div>
        )}
      </Upload.Dragger>
    </div>
  )
}

/* ─── Step: Features ─── */

function StepFeatures({
  selectedFeatures,
  onToggle,
}: {
  selectedFeatures: Record<FeatureType, Set<string>>
  onToggle: (feature: FeatureType, platformId: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">Choix des plateformes</h3>
        <p className="m-0 text-sm text-text-secondary">
          Comment souhaitez-vous voir l&apos;IA intervenir à votre place ?
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {FEATURE_CATEGORIES.map((category) => {
          const CategoryIcon = category.icon

          return (
            <div key={category.id} className="rounded-xl border border-border-default bg-white p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-subtle">
                  <CategoryIcon size={20} strokeWidth={1} className="text-text-secondary" />
                </div>
                <div>
                  <h4 className="m-0 mb-0.5 text-sm font-semibold text-text-primary">
                    {category.label}
                  </h4>
                  <p className="m-0 text-xs text-text-secondary">{category.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:pl-13">
                {category.platforms.map((platform) => (
                  <Checkbox
                    key={platform.id}
                    checked={selectedFeatures[category.id].has(platform.id)}
                    onChange={() => onToggle(category.id, platform.id)}
                  >
                    <span className="text-sm">{platform.label}</span>
                  </Checkbox>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Step: Connect Platform ─── */

function StepConnectPlatform({
  platform,
  selectedFeatures,
  connectedAccounts,
  connecting,
  onConnect,
}: {
  platform: PlatformConfig
  selectedFeatures: Record<FeatureType, Set<string>>
  connectedAccounts: ConnectedAccount[]
  connecting: boolean
  onConnect: () => void
}) {
  if (!platform) return null

  const branding = getPlatformBranding(platform, selectedFeatures)
  const description = getPlatformStepDescription(platform, selectedFeatures)
  const BrandIcon = branding.icon
  const isConnected = connectedAccounts.length > 0
  // Only WhatsApp connects inline (popup); the others redirect away to OAuth.
  const connectLoading = platform.id === 'whatsapp' && connecting

  if (isConnected) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">
            {getPlatformStepLabel(platform, selectedFeatures)}
          </h3>
          <p className="m-0 text-sm text-text-secondary">
            Vos comptes connectés à {branding.name}.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {connectedAccounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 rounded-xl border border-border-default bg-white p-3"
            >
              {/* Page profile picture, falling back to the platform logo */}
              <Avatar
                size={32}
                shape="square"
                src={account.avatarUrl || undefined}
                icon={<BrandIcon width={16} height={16} />}
                style={{ background: `${branding.color}14`, color: branding.color, flexShrink: 0 }}
              />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text-primary">{account.name}</span>
                {account.description && (
                  <span className="text-xs text-text-soft">{account.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={onConnect}
          icon={<Plus size={16} />}
          loading={connectLoading}
          className="self-start"
        >
          {platform.addMoreLabel}
        </Button>
      </div>
    )
  }

  // Empty state — not yet connected
  return (
    <div className="flex flex-col items-center py-8">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `${branding.color}14`, color: branding.color }}
      >
        <BrandIcon width={32} height={32} />
      </div>

      <div className="mt-4 mb-6 text-center">
        <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">
          {getPlatformStepLabel(platform, selectedFeatures)}
        </h3>
        <p className="m-0 max-w-sm text-sm text-text-secondary">{description}</p>
      </div>

      <Button
        type="primary"
        size="large"
        icon={<Plus size={16} />}
        loading={connectLoading}
        onClick={onConnect}
      >
        {platform.connectButton}
      </Button>
    </div>
  )
}

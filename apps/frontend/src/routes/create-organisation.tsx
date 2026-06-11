import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Steps, message } from 'antd'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
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
import {
  PLATFORMS,
  PROVIDER_BY_PLATFORM,
  formatConnectedPages,
  getConfigIdForPlatform,
  getPlatformStepLabel,
  type ConnectedAccount,
  type FeatureType,
} from '@app/components/organisation/onboarding-config'
import { StepOrganisation } from '@app/components/organisation/step-organisation'
import { StepFeatures } from '@app/components/organisation/step-features'
import { StepConnectPlatform } from '@app/components/organisation/step-connect-platform'

export const Route = createFileRoute('/create-organisation')({
  validateSearch: (search: Record<string, unknown>) => ({
    step: search.step ? Number(search.step) : undefined,
  }),
  component: CreateOrganisationPage,
})

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

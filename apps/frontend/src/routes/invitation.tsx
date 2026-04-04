import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, Card, Form, Typography, Input, message, Result, Avatar } from 'antd'
import { Shield, Send, Building2 } from 'lucide-react'
import { $api } from '@app/lib/api/$api'

const { Title, Text } = Typography

export const Route = createFileRoute('/invitation')({
  component: InvitationPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
  }),
})

type Step = 'welcome' | 'otp' | 'accept' | 'done'

interface InvitationInfo {
  id: string
  organisationId: string
  organisationName: string
  organisationLogo: string | null
  userName: string
  phone: string | null
  userStatus: 'PENDING' | 'VERIFIED'
  role: string
}

function InvitationPage() {
  const { token } = Route.useSearch()
  const [step, setStep] = useState<Step>('welcome')
  const [otpCode, setOtpCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const invitationQuery = $api.useQuery(
    'get',
    '/invitations',
    { params: { query: { token } } },
    { enabled: !!token, retry: false },
  )

  const info = invitationQuery.data as unknown as InvitationInfo | undefined

  const sendOtpMutation = $api.useMutation('post', '/invitations/send-otp')
  const verifyOtpMutation = $api.useMutation('post', '/invitations/verify-otp')
  const acceptMutation = $api.useMutation('post', '/invitations/accept')
  const rejectMutation = $api.useMutation('post', '/invitations/reject')

  const handleSendOtp = async () => {
    try {
      await sendOtpMutation.mutateAsync({
        params: { query: { token } },
      })
      message.success('Code OTP envoyé sur WhatsApp')
      setOtpCode('')
      setStep('otp')
    } catch {
      message.error("Impossible d'envoyer le code OTP")
    }
  }

  const handleVerifyOtp = async () => {
    try {
      const result = await verifyOtpMutation.mutateAsync({
        params: { query: { token } },
        body: { code: otpCode },
      })
      const user = (result as unknown as { user: { firstName: string; lastName: string } })?.user
      if (user) {
        setFirstName(user.firstName || '')
        setLastName(user.lastName || '')
      }
      setStep('accept')
    } catch (err) {
      const apiMessage = (err as { message?: string })?.message
      message.error(apiMessage || 'Code invalide')
    }
  }

  const handleAccept = async () => {
    if (!info) return
    try {
      await acceptMutation.mutateAsync({
        params: { query: { orgId: info.organisationId } },
        body: { firstName, lastName },
      })
      setStep('done')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleReject = async () => {
    if (!info) return
    try {
      await rejectMutation.mutateAsync({
        params: { query: { orgId: info.organisationId } },
      })
      setStep('done')
      message.info('Invitation refusée')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (!token || invitationQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="error"
          title="Invitation introuvable"
          subTitle="Ce lien d'invitation est invalide, expiré ou a déjà été utilisé."
        />
      </div>
    )
  }

  if (invitationQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-text-muted">Chargement...</div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="success"
          title="Terminé"
          subTitle="Vous pouvez maintenant vous connecter."
          extra={
            <Button type="primary" href="/auth/login">
              Se connecter
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar
            size={48}
            src={info?.organisationLogo}
            icon={<Building2 size={24} />}
            style={{ background: '#f0f0f0', color: '#666' }}
          />
          <Title level={4} className="!mb-0">
            {info?.organisationName}
          </Title>

          {step === 'welcome' && (
            <>
              <Text type="secondary">
                Vous avez été invité à rejoindre cette organisation. Vérifiez votre numéro WhatsApp
                pour continuer.
              </Text>
              <div className="flex w-full flex-col gap-3">
                <Input value={info?.phone || ''} disabled addonBefore={<Shield size={16} />} />
                <Button
                  type="primary"
                  icon={<Send size={16} />}
                  onClick={handleSendOtp}
                  loading={sendOtpMutation.isPending}
                  block
                >
                  Vérifier mon numéro
                </Button>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <Text type="secondary">Entrez le code à 6 chiffres envoyé au {info?.phone}.</Text>
              <div className="flex w-full flex-col items-center gap-3">
                <Input.OTP length={6} value={otpCode} onChange={setOtpCode} />
                <Button
                  type="primary"
                  onClick={handleVerifyOtp}
                  loading={verifyOtpMutation.isPending}
                  disabled={otpCode.length < 6}
                  block
                >
                  Vérifier
                </Button>
                <Button type="link" onClick={handleSendOtp} loading={sendOtpMutation.isPending}>
                  Renvoyer le code
                </Button>
              </div>
            </>
          )}

          {step === 'accept' && (
            <>
              <Text type="secondary">
                Confirmez vos informations pour rejoindre l&apos;organisation.
              </Text>
              <div className="flex w-full flex-col gap-3">
                <Input value={info?.phone || ''} disabled addonBefore="Téléphone" />
                <div className="flex gap-3">
                  <Input
                    placeholder="Prénom"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <Input
                    placeholder="Nom"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleReject} loading={rejectMutation.isPending} block>
                    Refuser
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleAccept}
                    loading={acceptMutation.isPending}
                    block
                  >
                    Accepter l&apos;invitation
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

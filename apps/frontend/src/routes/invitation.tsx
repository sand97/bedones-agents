import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, Card, Typography, Input, message, Result, Avatar } from 'antd'
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
  const { t } = useTranslation()
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
        params: {
          query: { token },
          header: { 'accept-language': navigator.language || 'fr' },
        },
      })
      message.success(t('invitation.otp_sent'))
      setOtpCode('')
      setStep('otp')
    } catch {
      message.error(t('invitation.otp_send_error'))
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
      message.error(apiMessage || t('invitation.invalid_code'))
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
      message.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const handleReject = async () => {
    if (!info) return
    try {
      await rejectMutation.mutateAsync({
        params: { query: { orgId: info.organisationId } },
      })
      setStep('done')
      message.info(t('invitation.rejected'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  if (!token || invitationQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="error"
          title={t('invitation.not_found')}
          subTitle={t('invitation.invalid_link')}
        />
      </div>
    )
  }

  if (invitationQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-text-muted">{t('common.loading')}</div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="success"
          title={t('common.done')}
          subTitle={t('invitation.can_login_now')}
          extra={
            <Button type="primary" href="/auth/login">
              {t('auth.submit')}
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
              <Text type="secondary">{t('invitation.welcome_message')}</Text>
              <div className="flex w-full flex-col gap-3">
                <Input value={info?.phone || ''} disabled addonBefore={<Shield size={16} />} />
                <Button
                  type="primary"
                  icon={<Send size={16} />}
                  onClick={handleSendOtp}
                  loading={sendOtpMutation.isPending}
                  block
                >
                  {t('invitation.verify_number')}
                </Button>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <Text type="secondary">{t('invitation.enter_otp', { phone: info?.phone })}</Text>
              <div className="flex w-full flex-col items-center gap-3">
                <Input.OTP length={6} value={otpCode} onChange={setOtpCode} />
                <Button
                  type="primary"
                  onClick={handleVerifyOtp}
                  loading={verifyOtpMutation.isPending}
                  disabled={otpCode.length < 6}
                  block
                >
                  {t('invitation.verify')}
                </Button>
                <Button type="link" onClick={handleSendOtp} loading={sendOtpMutation.isPending}>
                  {t('invitation.resend_code')}
                </Button>
              </div>
            </>
          )}

          {step === 'accept' && (
            <>
              <Text type="secondary">{t('invitation.confirm_info')}</Text>
              <div className="flex w-full flex-col gap-3">
                <Input value={info?.phone || ''} disabled addonBefore={t('invitation.phone')} />
                <div className="flex gap-3">
                  <Input
                    placeholder={t('invitation.first_name')}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <Input
                    placeholder={t('invitation.last_name')}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleReject} loading={rejectMutation.isPending} block>
                    {t('invitation.reject')}
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleAccept}
                    loading={acceptMutation.isPending}
                    block
                  >
                    {t('invitation.accept')}
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

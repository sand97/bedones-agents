import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Switch, Typography } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { Mail, MessageCircle } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/app/$orgSlug/notifications')({
  component: NotificationsPage,
})

interface NotifSetting {
  key: string
  title: string
  description: string
}

const emailSettings: NotifSetting[] = [
  {
    key: 'email_new_message',
    title: 'Nouveaux messages',
    description:
      'Recevoir un email lorsqu\u2019un nouveau message arrive sur vos messageries connectées',
  },
  {
    key: 'email_new_comment',
    title: 'Nouveaux commentaires',
    description:
      'Recevoir un email lorsqu\u2019un nouveau commentaire est publié sur vos réseaux sociaux',
  },
  {
    key: 'email_new_ticket',
    title: 'Nouveaux tickets',
    description: 'Recevoir un email lorsqu\u2019un nouveau ticket de support est créé',
  },
  {
    key: 'email_ticket_update',
    title: 'Mises à jour de tickets',
    description: 'Être notifié par email des changements de statut ou réponses sur vos tickets',
  },
  {
    key: 'email_member_invite',
    title: 'Invitations de membres',
    description: 'Recevoir un email lorsqu\u2019un nouveau membre rejoint votre organisation',
  },
  {
    key: 'email_billing',
    title: 'Facturation et paiements',
    description: 'Recevoir les confirmations de paiement, factures et alertes de renouvellement',
  },
  {
    key: 'email_weekly_report',
    title: 'Rapport hebdomadaire',
    description: 'Recevoir un résumé de l\u2019activité de la semaine chaque lundi matin',
  },
]

const whatsappSettings: NotifSetting[] = [
  {
    key: 'wa_new_message',
    title: 'Nouveaux messages',
    description: 'Recevoir une notification WhatsApp pour chaque nouveau message client',
  },
  {
    key: 'wa_new_comment',
    title: 'Nouveaux commentaires',
    description: 'Recevoir une notification WhatsApp pour les commentaires sur vos publications',
  },
  {
    key: 'wa_ticket_assigned',
    title: 'Tickets assignés',
    description: 'Être notifié sur WhatsApp lorsqu\u2019un ticket vous est assigné',
  },
  {
    key: 'wa_ticket_urgent',
    title: 'Tickets urgents',
    description: 'Recevoir une alerte WhatsApp pour les tickets marqués comme urgents',
  },
  {
    key: 'wa_agent_alert',
    title: 'Alertes de l\u2019agent IA',
    description: 'Être notifié lorsque l\u2019agent IA nécessite une intervention manuelle',
  },
  {
    key: 'wa_daily_summary',
    title: 'Résumé quotidien',
    description: 'Recevoir un résumé de l\u2019activité du jour chaque soir',
  },
]

function NotificationsPage() {
  const [values, setValues] = useState<Record<string, boolean>>({
    email_new_message: true,
    email_new_comment: true,
    email_new_ticket: true,
    email_ticket_update: false,
    email_member_invite: true,
    email_billing: true,
    email_weekly_report: false,
    wa_new_message: true,
    wa_new_comment: false,
    wa_ticket_assigned: true,
    wa_ticket_urgent: true,
    wa_agent_alert: true,
    wa_daily_summary: false,
  })

  const toggle = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const renderSection = (
    icon: React.ReactNode,
    title: string,
    subtitle: string,
    settings: NotifSetting[],
  ) => (
    <section className="notif-section">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
          {icon}
        </div>
        <div>
          <Title level={5} style={{ margin: 0 }}>
            {title}
          </Title>
          <Text type="secondary" className="text-xs">
            {subtitle}
          </Text>
        </div>
      </div>

      <div className="notif-list">
        {settings.map((s, i) => (
          <div key={s.key}>
            <div className="notif-row">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-text-primary">{s.title}</span>
                <span className="text-xs leading-relaxed text-text-secondary">{s.description}</span>
              </div>
              <Switch checked={values[s.key]} onChange={() => toggle(s.key)} size="small" />
            </div>
            {i < settings.length - 1 && <div className="notif-divider" />}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div>
      <DashboardHeader title="Préférences de notification" />

      <div className="p-4 pb-16 lg:p-6 lg:pb-16">
        {renderSection(
          <Mail size={20} strokeWidth={1} className="text-text-secondary" />,
          'Notifications par email',
          'Choisissez les notifications que vous souhaitez recevoir par email',
          emailSettings,
        )}

        <div className="mt-8" />

        {renderSection(
          <MessageCircle size={20} strokeWidth={1} className="text-text-secondary" />,
          'Notifications WhatsApp',
          'Choisissez les notifications que vous souhaitez recevoir sur WhatsApp',
          whatsappSettings,
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Switch, Typography, Modal, Button } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { MessageCircle, Eye } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/app/$orgSlug/notifications')({
  component: NotificationsPage,
})

interface NotifSetting {
  key: string
  title: string
  description: string
}

/* ─── Email notification settings (marketing / info) ─── */
// const emailSettings: NotifSetting[] = [
//   {
//     key: 'email_new_features',
//     title: 'Nouvelles fonctionnalités',
//     description:
//       'Recevoir un email lorsque de nouvelles fonctionnalités sont disponibles sur la plateforme',
//   },
//   {
//     key: 'email_new_offers',
//     title: 'Nouvelles offres',
//     description:
//       'Recevoir un email sur nos offres promotionnelles et nos nouveaux plans tarifaires',
//   },
//   {
//     key: 'email_tutorials',
//     title: 'Tutoriels et guides',
//     description:
//       'Recevoir des tutoriels et guides pour tirer le meilleur parti de Bedones',
//   },
// ]

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

/* ─── Email templates ─── */

interface EmailTemplate {
  key: string
  title: string
  subject: string
  description: string
  html: string
}

const emailTemplates: EmailTemplate[] = [
  {
    key: 'new_features',
    title: 'Nouvelles fonctionnalités',
    subject: '🚀 Découvrez les nouveautés Bedones',
    description: 'Template envoyé lors du lancement de nouvelles fonctionnalités',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid #f0f0f0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #141414;">Bedones</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #141414;">De nouvelles fonctionnalités sont disponibles</h2>
          <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #595959;">
            Nous avons ajouté de nouvelles fonctionnalités pour vous aider à mieux gérer vos réseaux sociaux. Découvrez ce qui a changé et comment en tirer le meilleur parti.
          </p>
          <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #141414;">✨ Quoi de neuf ?</h3>
            <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #595959;">
              <li>Nouvelle fonctionnalité de modération avancée</li>
              <li>Amélioration de l'agent IA</li>
              <li>Nouveau tableau de bord statistiques</li>
            </ul>
          </div>
          <a href="#" style="display: inline-block; padding: 12px 32px; background: #141414; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Découvrir les nouveautés</a>
        </div>
        <div style="padding: 24px 32px; border-top: 1px solid #f0f0f0; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #8c8c8c;">
            Vous recevez cet email car vous êtes inscrit sur Bedones.<br/>
            <a href="#" style="color: #8c8c8c;">Se désabonner</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    key: 'new_offers',
    title: 'Nouvelles offres',
    subject: '🎁 Une offre spéciale vous attend',
    description: 'Template envoyé pour les offres promotionnelles et nouveaux plans',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid #f0f0f0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #141414;">Bedones</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #141414;">Une offre exclusive pour vous</h2>
          <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #595959;">
            Profitez de notre offre limitée pour passer au plan supérieur et débloquer toutes les fonctionnalités de Bedones.
          </p>
          <div style="background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 14px; color: #8c8c8c; text-decoration: line-through;">49€ / mois</p>
            <p style="margin: 0 0 8px; font-size: 32px; font-weight: 700; color: #141414;">29€ <span style="font-size: 14px; font-weight: 400; color: #595959;">/ mois</span></p>
            <p style="margin: 0; font-size: 13px; color: #595959;">Offre valable jusqu'au 30 avril</p>
          </div>
          <a href="#" style="display: inline-block; padding: 12px 32px; background: #141414; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Profiter de l'offre</a>
        </div>
        <div style="padding: 24px 32px; border-top: 1px solid #f0f0f0; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #8c8c8c;">
            Vous recevez cet email car vous êtes inscrit sur Bedones.<br/>
            <a href="#" style="color: #8c8c8c;">Se désabonner</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    key: 'tutorials',
    title: 'Tutoriels et guides',
    subject: '📚 Nouveau tutoriel disponible',
    description: 'Template envoyé pour partager des tutoriels et guides',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid #f0f0f0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #141414;">Bedones</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #141414;">Apprenez à maîtriser Bedones</h2>
          <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #595959;">
            Découvrez notre nouveau guide pour configurer votre agent IA et automatiser la modération de vos commentaires.
          </p>
          <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #141414;">📖 Au programme</h3>
            <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #595959;">
              <li>Connecter vos réseaux sociaux</li>
              <li>Configurer les règles de modération</li>
              <li>Personnaliser les réponses automatiques</li>
              <li>Suivre vos statistiques</li>
            </ol>
          </div>
          <a href="#" style="display: inline-block; padding: 12px 32px; background: #141414; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Lire le tutoriel</a>
        </div>
        <div style="padding: 24px 32px; border-top: 1px solid #f0f0f0; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #8c8c8c;">
            Vous recevez cet email car vous êtes inscrit sur Bedones.<br/>
            <a href="#" style="color: #8c8c8c;">Se désabonner</a>
          </p>
        </div>
      </div>
    `,
  },
]

function NotificationsPage() {
  const [values, setValues] = useState<Record<string, boolean>>({
    // Email (marketing) — commenté pour le moment
    // email_new_features: true,
    // email_new_offers: true,
    // email_tutorials: true,
    wa_new_message: true,
    wa_new_comment: false,
    wa_ticket_assigned: true,
    wa_ticket_urgent: true,
    wa_agent_alert: true,
    wa_daily_summary: false,
  })

  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)

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
        {/* ─── Notifications par email ───
            Section commentée : Cloudflare ne permet pas encore l'envoi d'email
            et Resend est trop coûteux pour le moment. À réactiver quand on aura
            une solution d'envoi viable.

        {renderSection(
          <Mail size={20} strokeWidth={1} className="text-text-secondary" />,
          'Notifications par email',
          'Choisissez les emails que vous souhaitez recevoir',
          emailSettings,
        )}

        <div className="mt-8" />
        ─── Fin section commentée ─── */}

        {renderSection(
          <MessageCircle size={20} strokeWidth={1} className="text-text-secondary" />,
          'Notifications WhatsApp',
          'Choisissez les notifications que vous souhaitez recevoir sur WhatsApp',
          whatsappSettings,
        )}

        {/* ─── Email Templates Preview ─── */}
        <div className="mt-10">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
              <Eye size={20} strokeWidth={1} className="text-text-secondary" />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                Templates d'emails
              </Title>
              <Text type="secondary" className="text-xs">
                Prévisualisez les emails qui seront envoyés à vos utilisateurs
              </Text>
            </div>
          </div>

          <div className="notif-list">
            {emailTemplates.map((tpl, i) => (
              <div key={tpl.key}>
                <div className="notif-row">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium text-text-primary">{tpl.title}</span>
                    <span className="text-xs leading-relaxed text-text-secondary">
                      {tpl.description}
                    </span>
                  </div>
                  <Button size="small" onClick={() => setPreviewTemplate(tpl)}>
                    Prévisualiser
                  </Button>
                </div>
                {i < emailTemplates.length - 1 && <div className="notif-divider" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Template Preview Modal ─── */}
      <Modal
        open={!!previewTemplate}
        onCancel={() => setPreviewTemplate(null)}
        footer={null}
        title={previewTemplate?.subject}
        width={680}
        centered
      >
        {previewTemplate && (
          <div className="mt-4">
            <div className="mb-3 flex items-center gap-2">
              <Text type="secondary" className="text-xs">
                Sujet :
              </Text>
              <Text className="text-sm">{previewTemplate.subject}</Text>
            </div>
            <div
              style={{
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#f5f5f5',
                padding: 16,
              }}
            >
              <div
                dangerouslySetInnerHTML={{ __html: previewTemplate.html }}
                style={{ background: '#ffffff', borderRadius: 4 }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

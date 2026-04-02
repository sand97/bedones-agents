import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Typography, Collapse, Form, Input, Select, Button, Modal, message } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import {
  FileText,
  Shield,
  ShoppingCart,
  ExternalLink,
  HelpCircle,
  Headphones,
  Scale,
  ChevronDown,
  Send,
  MessageSquare,
} from 'lucide-react'

const { Title, Text } = Typography
const { TextArea } = Input

export const Route = createFileRoute('/app/$orgSlug/legal')({
  component: HelpPage,
})

/* ───────── FAQ ───────── */
const faqItems = [
  {
    key: '1',
    label: 'Comment connecter mon compte WhatsApp Business ?',
    children:
      'Rendez-vous dans la section Messageries > WhatsApp, puis cliquez sur "Connecter". Vous serez guidé à travers le processus de vérification Meta Business et la connexion de votre numéro WhatsApp Business.',
  },
  {
    key: '2',
    label: "Comment fonctionne l'agent IA ?",
    children:
      "L'agent IA analyse automatiquement les messages entrants et propose des réponses pertinentes basées sur votre catalogue produit, votre historique de conversations et les règles que vous avez configurées. Vous pouvez l'activer ou le désactiver à tout moment.",
  },
  {
    key: '3',
    label: 'Puis-je gérer plusieurs comptes sociaux ?',
    children:
      'Oui, Bedones vous permet de connecter et gérer simultanément vos comptes WhatsApp, Instagram, Facebook et TikTok depuis une seule interface. Chaque plateforme dispose de sa propre section de messagerie et de commentaires.',
  },
  {
    key: '4',
    label: 'Comment ajouter des membres à mon équipe ?',
    children:
      'Depuis la page Membres, cliquez sur "Ajouter" pour inviter un collaborateur par email. Vous pouvez attribuer différents rôles (Propriétaire, Administrateur, Membre) avec des niveaux d\'accès distincts.',
  },
  {
    key: '5',
    label: 'Comment modifier ou annuler mon abonnement ?',
    children:
      "Rendez-vous dans la section Souscription pour voir votre plan actuel, changer de formule ou gérer vos moyens de paiement. L'annulation prend effet à la fin de la période de facturation en cours.",
  },
  {
    key: '6',
    label: 'Mes données sont-elles sécurisées ?',
    children:
      'Absolument. Toutes les données sont chiffrées en transit et au repos. Nous sommes conformes au RGPD et ne partageons jamais vos données avec des tiers sans votre consentement. Consultez notre politique de confidentialité pour plus de détails.',
  },
]

/* ───────── Legal cards ───────── */
const legalCards = [
  {
    icon: <FileText size={24} strokeWidth={1} />,
    title: 'Mentions légales',
    description:
      'Informations sur l\u2019éditeur, l\u2019hébergement et la propriété intellectuelle de la plateforme Bedones.',
    href: '/legal/mentions',
  },
  {
    icon: <Shield size={24} strokeWidth={1} />,
    title: 'Politique de confidentialité',
    description:
      'Comment nous collectons, utilisons et protégeons vos données personnelles et celles de vos clients.',
    href: '/legal/privacy',
  },
  {
    icon: <ShoppingCart size={24} strokeWidth={1} />,
    title: 'Conditions générales de vente',
    description:
      'Modalités d\u2019abonnement, tarification, engagements et responsabilités liés à l\u2019utilisation du service.',
    href: '/legal/conditions',
  },
]

/* ───────── Support form options ───────── */
const motifOptions = [
  { value: 'bug', label: 'Signaler un bug' },
  { value: 'feature', label: 'Suggestion de fonctionnalité' },
  { value: 'billing', label: 'Facturation / Paiement' },
  { value: 'account', label: 'Mon compte' },
  { value: 'integration', label: 'Intégration / Connexion' },
  { value: 'other', label: 'Autre' },
]

const platformOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'general', label: 'Général / Toutes' },
]

/* ───────── Page ───────── */
function HelpPage() {
  const [form] = Form.useForm()
  const [contactOpen, setContactOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: Record<string, string>) => {
    setSubmitting(true)
    // TODO: integrate real API
    await new Promise((r) => setTimeout(r, 800))
    setSubmitting(false)
    form.resetFields()
    setContactOpen(false)
    message.success('Votre message a bien été envoyé. Nous reviendrons vers vous rapidement.')
    console.log('Support form submitted:', values)
  }

  return (
    <div>
      <DashboardHeader title="Aides et ressources" />

      <div className="p-4 pb-16 lg:p-6 lg:pb-16">
        {/* ── FAQ ── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
              <HelpCircle size={20} strokeWidth={1} className="text-text-secondary" />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                Questions fréquentes
              </Title>
              <Text type="secondary" className="text-xs">
                Trouvez rapidement des réponses à vos questions
              </Text>
            </div>
          </div>

          <Collapse
            accordion
            bordered={false}
            expandIcon={({ isActive }) => (
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                style={{
                  transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            )}
            expandIconPosition="end"
            items={faqItems}
            className="help-faq-collapse"
          />
        </section>

        {/* ── Contacter le support ── */}
        <section className="mb-10">
          <div className="help-support-cta">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle">
              <Headphones size={24} strokeWidth={1} className="text-text-secondary" />
            </div>
            <Title level={5} style={{ margin: '12px 0 4px' }}>
              Vous souhaitez discuter avec nous ?
            </Title>
            <Text type="secondary" className="mb-5 block text-sm leading-relaxed">
              Si vous n&apos;avez pas trouvé la réponse à votre question dans notre FAQ, notre
              équipe est là pour vous aider. Envoyez-nous un message et nous vous répondrons dans
              les plus brefs délais.
            </Text>
            <Button
              type="primary"
              icon={<MessageSquare size={14} strokeWidth={1.5} />}
              onClick={() => setContactOpen(true)}
            >
              Nous contacter
            </Button>
          </div>
        </section>

        {/* ── Modal formulaire de contact ── */}
        <Modal
          open={contactOpen}
          onCancel={() => setContactOpen(false)}
          title="Contacter le support"
          footer={null}
          destroyOnClose
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item
              name="contact"
              label="Email ou numéro de téléphone"
              rules={[{ required: true, message: 'Ce champ est requis' }]}
            >
              <Input placeholder="votre@email.com ou +225 07 00 00 00" />
            </Form.Item>

            <Form.Item
              name="motif"
              label="Motif"
              rules={[{ required: true, message: 'Veuillez sélectionner un motif' }]}
            >
              <Select placeholder="Sélectionner un motif" options={motifOptions} />
            </Form.Item>

            <Form.Item
              name="platform"
              label="Plateforme concernée"
              rules={[{ required: true, message: 'Veuillez sélectionner une plateforme' }]}
            >
              <Select placeholder="Sélectionner une plateforme" options={platformOptions} />
            </Form.Item>

            <Form.Item
              name="description"
              label="Description"
              rules={[{ required: true, message: 'Veuillez décrire votre problème' }]}
            >
              <TextArea
                rows={4}
                placeholder="Décrivez votre problème ou votre demande en détail..."
              />
            </Form.Item>

            <div className="flex justify-end">
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                icon={<Send size={14} strokeWidth={1.5} />}
              >
                Envoyer
              </Button>
            </div>
          </Form>
        </Modal>

        {/* ── Informations légales ── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
              <Scale size={20} strokeWidth={1} className="text-text-secondary" />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                Informations légales
              </Title>
              <Text type="secondary" className="text-xs">
                Consultez les documents juridiques relatifs à l&apos;utilisation de Bedones
              </Text>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {legalCards.map((card) => (
              <a
                key={card.href}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="legal-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle text-text-secondary">
                    {card.icon}
                  </div>
                  <ExternalLink size={14} className="text-text-muted" />
                </div>
                <div className="mt-4">
                  <span className="text-sm font-semibold text-text-primary">{card.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                    {card.description}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Form, Input, Modal, Select, Spin, message } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, HelpCircle, Send } from 'lucide-react'
import { featuresConfig, type Feature } from '@app/data/features'
import { $api } from '@app/lib/api/$api'
import { CookieConsentModal } from '@app/components/auth/cookie-consent-modal'
import { navigateAfterAuth } from '@app/components/auth/post-auth-navigation'
import { WhatsAppLoginCard } from '@app/components/auth/whatsapp-login-card'
import { EmailLoginCard } from '@app/components/auth/email-login-card'

// Affichage des blocs d'aide (Messagerie, Commentaires, Agents) sous le formulaire.
// Désactivés par défaut — définir VITE_LOGIN_TOOLTIP_VISIBLE=true pour les afficher.
const LOGIN_TOOLTIP_VISIBLE = import.meta.env.VITE_LOGIN_TOOLTIP_VISIBLE === 'true'

type LoginMethod = 'whatsapp' | 'email'

interface LoginSearch {
  method?: LoginMethod
  country?: string
  phone?: string
  /** Full URL to return to after login — used by the MCP OAuth connector flow. */
  return_to?: string
}

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const method = search.method === 'email' ? 'email' : undefined
    return {
      method,
      country: typeof search.country === 'string' ? search.country : undefined,
      phone: typeof search.phone === 'string' ? search.phone : undefined,
      return_to: typeof search.return_to === 'string' ? search.return_to : undefined,
    }
  },
})

function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = Route.useSearch()

  // Si une session est déjà active, on redirige l'utilisateur sans afficher le
  // formulaire (dashboard, organisations ou onboarding selon son état — voir
  // resolvePostAuthRoute). `retry: false` : un 401 (non connecté) doit basculer
  // immédiatement sur le formulaire, sans réessais inutiles.
  const meQuery = $api.useQuery('get', '/auth/me', {}, { retry: false })

  useEffect(() => {
    if (meQuery.data) navigateAfterAuth(navigate, meQuery.data, search.return_to)
  }, [meQuery.data, navigate, search.return_to])

  const method: LoginMethod = search.method === 'email' ? 'email' : 'whatsapp'

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [cookieConsentOpen, setCookieConsentOpen] = useState(() => {
    return !document.cookie.split('; ').some((c) => c.startsWith('cookie_consent='))
  })

  // Tant que la vérification de session est en cours — ou qu'elle a réussi et
  // qu'on s'apprête à rediriger — on affiche un loader plutôt que le formulaire.
  if (meQuery.isLoading || meQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-12">
      <div className="relative z-1 flex w-full max-w-md flex-col items-center gap-8 mt-[12vh]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <span className="text-lg font-semibold">Bedones</span>
        </div>

        {/* Card du formulaire + grille de lignes centrée dessus, opacité décroissante vers l'extérieur */}
        <div className="relative w-full">
          <div className="login-grid-lines" />
          <div className="relative z-1">
            {method === 'email' ? (
              <EmailLoginCard navigate={navigate} returnTo={search.return_to} t={t} />
            ) : (
              <WhatsAppLoginCard
                initialCountry={search.country}
                initialPhone={search.phone}
                navigate={navigate}
                returnTo={search.return_to}
                t={t}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="default"
            icon={<HelpCircle size={16} />}
            size="large"
            style={{ height: 44 }}
            onClick={() => setSupportOpen(true)}
          >
            Aide
          </Button>
          <Button
            type="default"
            icon={<BookOpen size={16} />}
            href="/blog"
            size="large"
            style={{ height: 44 }}
          >
            Conseils pour votre business
          </Button>
        </div>
      </div>

      {/* Features Section — masquée par défaut, activable via VITE_LOGIN_TOOLTIP_VISIBLE */}
      {LOGIN_TOOLTIP_VISIBLE && (
        <div className="relative z-1 mt-16 flex flex-wrap items-start justify-center gap-14">
          {Object.entries(featuresConfig).map(([key, category]) => (
            <div key={key} className="flex flex-col items-center gap-2 rounded-panel p-4">
              <p className="mb-1 text-lg text-text-secondary">{category.title}</p>
              <div className="flex flex-col items-center gap-2">
                {category.features.map((feature) => {
                  const FeatureIcon = feature.icon

                  return (
                    <button
                      key={feature.title}
                      type="button"
                      onClick={() => setSelectedFeature(feature)}
                      className="flex h-11 cursor-pointer items-center gap-2.5 rounded-pill border border-transparent bg-white px-6 shadow-pill transition-colors hover:border-black"
                    >
                      <FeatureIcon />
                      <span className="whitespace-nowrap text-base text-black">
                        {feature.title}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Feature detail modal */}
      <Modal
        open={selectedFeature !== null}
        onCancel={() => setSelectedFeature(null)}
        closeIcon={null}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedFeature(null)}>
            Fermer
          </Button>,
        ]}
        title={
          selectedFeature && (
            <div className="flex items-center gap-2">
              <selectedFeature.icon />
              <span>{selectedFeature.title}</span>
            </div>
          )
        }
      >
        {selectedFeature && (
          <p className="text-base text-text-secondary">{selectedFeature.description}</p>
        )}
      </Modal>

      {/* Contact support modal */}
      <Modal
        open={supportOpen}
        onCancel={() => setSupportOpen(false)}
        title="Contacter le support"
        footer={null}
        destroyOnHidden
      >
        <Form
          form={supportForm}
          layout="vertical"
          onFinish={async () => {
            setSubmitting(true)
            await new Promise((r) => setTimeout(r, 800))
            setSubmitting(false)
            supportForm.resetFields()
            setSupportOpen(false)
            message.success(
              'Votre message a bien été envoyé. Nous reviendrons vers vous rapidement.',
            )
          }}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label="Votre adresse email"
            rules={[{ required: true, message: 'Veuillez entrer votre email' }]}
          >
            <Input placeholder="email@exemple.com" />
          </Form.Item>

          <Form.Item
            name="motif"
            label="Motif"
            rules={[{ required: true, message: 'Veuillez sélectionner un motif' }]}
          >
            <Select
              placeholder="Sélectionnez un motif"
              options={[
                { value: 'bug', label: 'Signaler un bug' },
                { value: 'account', label: 'Problème de compte' },
                { value: 'billing', label: 'Facturation' },
                { value: 'other', label: 'Autre' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Veuillez décrire votre problème' }]}
          >
            <Input.TextArea rows={4} placeholder="Décrivez votre problème ou votre question..." />
          </Form.Item>

          <div className="flex justify-end">
            <Button type="primary" htmlType="submit" loading={submitting} icon={<Send size={14} />}>
              Envoyer
            </Button>
          </div>
        </Form>
      </Modal>

      <CookieConsentModal open={cookieConsentOpen} onClose={() => setCookieConsentOpen(false)} />
    </div>
  )
}

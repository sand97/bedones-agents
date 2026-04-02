import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Card, Divider, Input, Modal, Typography } from 'antd'
import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@app/components/icons/social-icons'
import { featuresConfig, type Feature } from '@app/data/features'

const { Title, Text } = Typography

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)

  const handleLogin = () => {
    navigate({ to: '/app/$orgSlug/dashboard', params: { orgSlug: 'demo-org' } })
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 mt-[12vh]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <span className="text-lg font-semibold">Bedones</span>
        </div>

        {/* Login Card — Email / Password */}
        <Card className="w-full" styles={{ body: { padding: 32 } }}>
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <Title level={4} style={{ marginBottom: 4 }}>
                Centralisez vos interactions sociales
              </Title>
              <Text type="secondary">Connectez-vous pour commencer</Text>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Input
                size="large"
                placeholder="Adresse email"
                prefix={<Mail size={16} className="text-text-soft" />}
                style={{ height: 48 }}
              />
              <Input.Password
                size="large"
                placeholder="Mot de passe"
                prefix={<Lock size={16} className="text-text-soft" />}
                style={{ height: 48 }}
              />
              <Button
                type="primary"
                size="large"
                block
                onClick={handleLogin}
                style={{ height: 48 }}
              >
                Se connecter
              </Button>
            </div>

            <Divider plain style={{ margin: 0 }}>
              <Text type="secondary" className="text-xs">
                ou
              </Text>
            </Divider>

            <div className="flex w-full flex-col gap-3">
              <Button
                size="large"
                block
                className="btn-social"
                onClick={handleLogin}
                icon={<FacebookIcon width={18} height={18} />}
                style={{
                  background: '#1877f2',
                  borderColor: '#1877f2',
                  color: '#fff',
                  height: 48,
                }}
              >
                Continuer avec Facebook
              </Button>

              <Button
                size="large"
                block
                className="btn-social"
                onClick={handleLogin}
                icon={<InstagramIcon width={18} height={18} />}
                style={{
                  background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
                  borderColor: 'transparent',
                  color: '#fff',
                  height: 48,
                }}
              >
                Continuer avec Instagram
              </Button>
            </div>

            <Text type="secondary" className="text-center text-xs">
              En continuant, vous acceptez nos{' '}
              <a href="/auth/terms" className="link-underline-hover text-text-primary">
                conditions d&apos;utilisation
              </a>{' '}
              et notre{' '}
              <a href="/auth/privacy" className="link-underline-hover text-text-primary">
                politique de confidentialite
              </a>
              .
            </Text>
          </div>
        </Card>

        {/* Social-only login Card (commented out for Facebook validation) */}
        {/*
        <Card className="w-full" styles={{ body: { padding: 32 } }}>
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <Title level={4} style={{ marginBottom: 4 }}>
                Centralisez vos interactions sociales
              </Title>
              <Text type="secondary">Connectez-vous pour commencer</Text>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button
                size="large"
                block
                className="btn-social"
                onClick={handleLogin}
                icon={<FacebookIcon width={18} height={18} />}
                style={{
                  background: '#1877f2',
                  borderColor: '#1877f2',
                  color: '#fff',
                  height: 48,
                }}
              >
                Continuer avec Facebook
              </Button>

              <Button
                size="large"
                block
                className="btn-social"
                onClick={handleLogin}
                icon={<InstagramIcon width={18} height={18} />}
                style={{
                  background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
                  borderColor: 'transparent',
                  color: '#fff',
                  height: 48,
                }}
              >
                Continuer avec Instagram
              </Button>

              <Button
                size="large"
                block
                className="btn-social"
                onClick={handleLogin}
                icon={<TikTokIcon width={18} height={18} />}
                style={{
                  background: '#000000',
                  borderColor: '#000000',
                  color: '#fff',
                  height: 48,
                }}
              >
                Continuer avec TikTok
              </Button>
            </div>

            <Text type="secondary" className="text-center text-xs">
              En continuant, vous acceptez nos{' '}
              <a href="/auth/terms" className="link-underline-hover text-text-primary">
                conditions d&apos;utilisation
              </a>{' '}
              et notre{' '}
              <a href="/auth/privacy" className="link-underline-hover text-text-primary">
                politique de confidentialite
              </a>
              .
            </Text>
          </div>
        </Card>
        */}
      </div>

      {/* Features Section */}
      <div className="mt-16 flex flex-wrap items-start justify-center gap-14">
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
                    <span className="whitespace-nowrap text-base text-black">{feature.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

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
    </div>
  )
}

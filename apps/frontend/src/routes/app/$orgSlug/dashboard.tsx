import { createFileRoute } from '@tanstack/react-router'
import { Button, Card, Typography } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { Plug, ArrowRight } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/app/$orgSlug/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div>
      <DashboardHeader title="Dashboard" />
      <div className="p-6">
        <Card>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-subtle">
              <Plug size={24} className="text-text-muted" />
            </div>
            <Title level={4} style={{ margin: 0 }}>
              Bienvenue sur Bedones
            </Title>
            <Text type="secondary" className="max-w-md">
              Connectez vos reseaux sociaux pour commencer a centraliser vos interactions et
              convertir vos prospects.
            </Text>
            <Button type="primary" size="large" icon={<ArrowRight size={16} />} iconPosition="end">
              Connecter un reseau social
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

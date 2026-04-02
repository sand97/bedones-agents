import { Empty, Button } from 'antd'
import { AlertCircle } from 'lucide-react'

interface AgentErrorProps {
  onRetry: () => void
}

export function AgentError({ onRetry }: AgentErrorProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Empty
        image={<AlertCircle size={48} className="text-text-muted" />}
        description={
          <div className="mt-2">
            <div className="text-sm font-medium text-text-primary">Erreur de chargement</div>
            <div className="mt-1 text-xs text-text-muted">
              Impossible de récupérer le contexte de l'agent. Veuillez réessayer.
            </div>
            <Button className="mt-4" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        }
      />
    </div>
  )
}

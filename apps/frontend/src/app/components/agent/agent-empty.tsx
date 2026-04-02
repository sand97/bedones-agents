import { Empty, Button } from 'antd'
import { Sparkles } from 'lucide-react'

interface AgentEmptyProps {
  onStart: () => void
}

export function AgentEmpty({ onStart }: AgentEmptyProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Empty
        image={<Sparkles size={48} strokeWidth={1.5} className="text-text-muted" />}
        description={
          <div className="mt-2">
            <div className="text-sm font-medium text-text-primary">Configurez votre agent IA</div>
            <div className="mt-1 text-xs text-text-muted">
              Expliquez à l'agent comment fonctionne votre entreprise et comment répondre aux
              messages et commentaires de vos clients
            </div>
            <Button type="primary" className="mt-4" onClick={onStart}>
              Commencer
            </Button>
          </div>
        }
      />
    </div>
  )
}

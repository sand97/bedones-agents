import { SocialSetup } from '@app/components/social/social-setup'
import { ShoppingBag } from 'lucide-react'

interface CatalogEmptyProps {
  onConnect: () => void
}

export function CatalogEmpty({ onConnect }: CatalogEmptyProps) {
  return (
    <SocialSetup
      icon={<ShoppingBag size={36} strokeWidth={1.5} />}
      color="#111b21"
      title="Connectez votre catalogue"
      description="Importez vos articles depuis votre boutique en ligne ou ajoutez-les manuellement pour que votre agent IA puisse les proposer à vos clients."
      buttonLabel="Connecter un catalogue"
      onConnect={onConnect}
    />
  )
}

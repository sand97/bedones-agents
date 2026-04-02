import {
  ClockCircleOutlined,
  CommentOutlined,
  CustomerServiceOutlined,
  EyeOutlined,
  GlobalOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyOutlined,
  SendOutlined,
  ShoppingOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

export interface Feature {
  title: string
  description: string
  icon: ComponentType
}

export interface FeatureCategory {
  title: string
  features: Feature[]
}

export const featuresConfig: Record<string, FeatureCategory> = {
  messagerie: {
    title: 'Messagerie',
    features: [
      {
        title: 'Reponses automatiques',
        description:
          "L'IA repond instantanement aux messages recus sur WhatsApp, Instagram et Messenger en se basant sur vos instructions et vos produits.",
        icon: SendOutlined,
      },
      {
        title: 'Prise de commande',
        description:
          "Vos clients passent commande directement depuis la conversation. L'agent les guide du choix produit jusqu'a la confirmation.",
        icon: ShoppingOutlined,
      },
      {
        title: 'Suivi des conversations',
        description:
          "Historique complet de chaque echange. Reprenez le fil avec n'importe quel client sans perdre le contexte.",
        icon: ClockCircleOutlined,
      },
      {
        title: 'Notifications en temps reel',
        description:
          'Soyez alerte a chaque nouveau message pour ne jamais laisser un client sans reponse.',
        icon: ThunderboltOutlined,
      },
    ],
  },
  commentaires: {
    title: 'Commentaires',
    features: [
      {
        title: 'Monitoring en temps reel',
        description:
          'Surveillez tous les commentaires sur vos publications Facebook, Instagram et TikTok. Aucune interaction ne vous echappe.',
        icon: EyeOutlined,
      },
      {
        title: 'Liaison posts — catalogue',
        description:
          'Associez vos publications a vos produits. Les clients qui commentent recoivent automatiquement les informations produit.',
        icon: LinkOutlined,
      },
      {
        title: 'Moderation automatique',
        description:
          'Filtrez le spam et les contenus inappropries automatiquement pour proteger votre image de marque.',
        icon: SafetyOutlined,
      },
      {
        title: 'Reponses aux commentaires',
        description:
          'Configurez des reponses automatiques selon vos regles. Engagez votre communaute meme en votre absence.',
        icon: CommentOutlined,
      },
    ],
  },
  agents: {
    title: 'Agents',
    features: [
      {
        title: 'Reponses intelligentes',
        description:
          "L'agent comprend le contexte de chaque conversation et fournit des reponses personnalisees a vos clients.",
        icon: RobotOutlined,
      },
      {
        title: 'Gestion des commandes',
        description:
          "Cycle complet de commande gere par l'IA : decouverte produit, negociation et confirmation.",
        icon: TagsOutlined,
      },
      {
        title: 'Negociations selon vos regles',
        description:
          "Definissez vos marges et conditions. L'agent negocie les prix automatiquement dans le cadre que vous fixez.",
        icon: CustomerServiceOutlined,
      },
      {
        title: 'Actions autonomes',
        description:
          "Relances, classifications, mises a jour de statut — l'agent execute des actions selon vos regles sans intervention.",
        icon: ThunderboltOutlined,
      },
      {
        title: 'Disponible 24h/24 et 7j/7',
        description:
          'Votre agent ne dort jamais. Vos clients obtiennent des reponses a toute heure, week-ends et jours feries inclus.',
        icon: GlobalOutlined,
      },
    ],
  },
}

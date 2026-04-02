import dayjs from 'dayjs'

/* ── Types ── */

export type AgentPageState = 'empty' | 'loading' | 'recap' | 'chat' | 'error'

export type AgentMessageType = 'text' | 'mcq' | 'scq'
export type AgentMessageFrom = 'agent' | 'user'

export interface AgentChoiceOption {
  id: string
  label: string
}

export interface AgentMessage {
  id: string
  type: AgentMessageType
  from: AgentMessageFrom
  text?: string
  timestamp: string
  options?: AgentChoiceOption[]
}

/* ── Mock context (Markdown) ── */

export const MOCK_AGENT_CONTEXT = `# Contexte de l'entreprise

Nom : BoutiqueMode CM
Secteur : Vente de vêtements et accessoires en ligne
Localisation : Douala, Cameroun

## Produits principaux

- Robes et ensembles pour femmes
- T-shirts et chemises pour hommes
- Accessoires (sacs, bijoux, ceintures)
- Chaussures (hommes et femmes)

## Politique de livraison

- Livraison gratuite à Douala pour les commandes de plus de 15 000 FCFA
- Livraison en 24-48h à Douala
- Livraison en 3-5 jours pour les autres villes du Cameroun
- Frais de livraison : 2 000 FCFA (Douala) / 3 500 FCFA (autres villes)

## Politique de retour

- Retours acceptés sous 7 jours après réception
- L'article doit être dans son état d'origine avec étiquettes
- Échange ou avoir uniquement, pas de remboursement

## Ton de communication

- Toujours saluer le client chaleureusement
- Utiliser "vous" par défaut
- Répondre en français, sauf si le client écrit en anglais
- Proposer des alternatives si un article est en rupture de stock
- Toujours remercier le client à la fin de l'échange`

/* ── Mock messages ── */

const today = dayjs().format('YYYY-MM-DD')

export const MOCK_AGENT_MESSAGES: AgentMessage[] = [
  {
    id: 'msg-1',
    type: 'text',
    from: 'agent',
    text: 'Bonjour ! Je suis votre assistant IA. Je vais vous aider à configurer la façon dont je dois interagir avec vos clients. Commençons par votre entreprise. Quel est le nom de votre entreprise et que vendez-vous ?',
    timestamp: `${today}T09:00:00`,
  },
  {
    id: 'msg-2',
    type: 'text',
    from: 'user',
    text: "On s'appelle BoutiqueMode CM, on vend des vêtements et accessoires en ligne depuis Douala.",
    timestamp: `${today}T09:01:00`,
  },
  {
    id: 'msg-3',
    type: 'text',
    from: 'agent',
    text: 'Parfait ! BoutiqueMode CM, vente de vêtements et accessoires à Douala. Maintenant, parlons de vos politiques. Comment fonctionne votre livraison ?',
    timestamp: `${today}T09:01:30`,
  },
  {
    id: 'msg-4',
    type: 'text',
    from: 'user',
    text: "Livraison gratuite à Douala au-dessus de 15 000 FCFA, sinon c'est 2 000 FCFA. Pour les autres villes c'est 3 500 FCFA. Délai 24-48h Douala, 3-5 jours ailleurs.",
    timestamp: `${today}T09:03:00`,
  },
  {
    id: 'msg-5',
    type: 'text',
    from: 'agent',
    text: "C'est noté pour la livraison ! Maintenant, quelle est votre politique de retour et d'échange ?",
    timestamp: `${today}T09:03:30`,
  },
  {
    id: 'msg-6',
    type: 'text',
    from: 'user',
    text: "Les retours sont acceptés sous 7 jours. L'article doit être dans son état d'origine avec les étiquettes. On fait des échanges ou des avoirs, pas de remboursement.",
    timestamp: `${today}T09:04:00`,
  },
  {
    id: 'msg-7',
    type: 'text',
    from: 'agent',
    text: 'Très bien. Et en termes de ton, comment souhaitez-vous que je communique avec vos clients ? Plutôt formel, amical, ou un mélange des deux ?',
    timestamp: `${today}T09:04:30`,
  },
  {
    id: 'msg-8',
    type: 'text',
    from: 'user',
    text: 'Chaleureux et professionnel. Toujours vouvoyer le client, être poli, et proposer des alternatives si un article est en rupture.',
    timestamp: `${today}T09:05:00`,
  },
  {
    id: 'msg-9',
    type: 'text',
    from: 'agent',
    text: "Parfait ! Ton chaleureux et professionnel, vouvoiement, et suggestions d'alternatives. Je note aussi de toujours saluer et remercier le client.",
    timestamp: `${today}T09:05:30`,
  },
  {
    id: 'msg-10',
    type: 'text',
    from: 'user',
    text: 'Oui exactement. Et on répond en français sauf si le client écrit en anglais.',
    timestamp: `${today}T09:06:00`,
  },
  {
    id: 'msg-11',
    type: 'text',
    from: 'agent',
    text: 'Compris ! Français par défaut, anglais si le client le souhaite. Passons maintenant aux canaux de communication.',
    timestamp: `${today}T09:06:30`,
  },
]

export const MOCK_MCQ_MESSAGE: AgentMessage = {
  id: 'msg-mcq',
  type: 'mcq',
  from: 'agent',
  text: 'Sur quels canaux souhaitez-vous que je réponde aux clients ?',
  timestamp: `${today}T09:04:00`,
  options: [
    { id: 'opt-wa', label: 'WhatsApp' },
    { id: 'opt-ig', label: 'Instagram DM' },
    { id: 'opt-fb', label: 'Facebook Messenger' },
    { id: 'opt-cm', label: 'Commentaires Facebook' },
    { id: 'opt-tt', label: 'Commentaires TikTok' },
  ],
}

export const MOCK_SCQ_MESSAGE: AgentMessage = {
  id: 'msg-scq',
  type: 'scq',
  from: 'agent',
  text: 'Dans quelle langue dois-je principalement répondre aux clients ?',
  timestamp: `${today}T09:05:00`,
  options: [
    { id: 'lang-fr', label: 'Français uniquement' },
    { id: 'lang-en', label: 'Anglais uniquement' },
    { id: 'lang-both', label: 'Les deux selon le client' },
  ],
}

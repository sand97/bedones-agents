export interface Contact {
  id: string
  name: string
  phone: string
  avatarUrl?: string
}

export type MessageType =
  | 'text'
  | 'audio'
  | 'video'
  | 'image'
  | 'file'
  | 'catalog'
  | 'catalog_message'
  | 'button'

export type MessageStatus = 'sending' | 'sent' | 'error'

export interface ReplyContext {
  id: string
  text: string
  from: 'customer' | 'business'
}

export interface CatalogItem {
  title: string
  description: string
  price: string
  imageUrl: string
}

export interface MessageButton {
  id: string
  label: string
}

export interface Message {
  id: string
  type: MessageType
  from: 'customer' | 'business'
  text?: string
  timestamp: string
  isRead: boolean

  // Optimistic messaging
  localId?: string
  status?: MessageStatus

  // WhatsApp delivery status
  deliveryStatus?: 'sent' | 'delivered' | 'read'

  // Context reply
  replyTo?: ReplyContext

  // Audio
  audioUrl?: string
  audioDuration?: number // seconds

  // Video
  videoUrl?: string
  videoThumbnail?: string

  // Image
  imageUrl?: string
  imageCaption?: string

  // File / generic media
  mediaUrl?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number

  // Catalog
  catalogItem?: CatalogItem

  // Buttons
  buttons?: MessageButton[]
  buttonHeader?: string

  // Reactions
  reactions?: { senderId: string; emoji: string }[]
}

export interface Label {
  id: string
  name: string
  color: string
}

export const AVAILABLE_LABELS: Label[] = [
  { id: 'lbl-1', name: 'Nouveau', color: '#22c55e' },
  { id: 'lbl-2', name: 'À livrer', color: '#f59e0b' },
  { id: 'lbl-3', name: 'Ancien client', color: '#6366f1' },
  { id: 'lbl-4', name: 'VIP', color: '#ec4899' },
  { id: 'lbl-5', name: 'En attente', color: '#ef4444' },
  { id: 'lbl-6', name: 'Réclamation', color: '#f97316' },
]

/* ── Tickets ── */

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'cancelled'

export const TICKET_STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#3b82f6' },
  in_progress: { label: 'En cours', color: '#f59e0b' },
  waiting: { label: 'En attente', color: '#8b5cf6' },
  resolved: { label: 'Résolu', color: '#22c55e' },
  cancelled: { label: 'Annulé', color: '#ef4444' },
}

export interface TicketActivityDiff {
  field: 'description'
  before: string
  after: string
}

export interface TicketActivity {
  id: string
  type: 'status_change' | 'description_change' | 'created'
  timestamp: string
  author: string // e.g. 'Agent IA', 'Amina Diallo'
  // status change
  fromStatus?: TicketStatus
  toStatus?: TicketStatus
  // description change
  diff?: TicketActivityDiff
}

export interface TicketItem {
  id: string
  title: string
  description: string
  imageUrl: string
  unitPrice: number
  quantity: number
  currency: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  createdAt: string
  activity: TicketActivity[]
  items: TicketItem[]
}

export type SocialNetwork = 'whatsapp' | 'instagram' | 'messenger' | 'facebook' | 'tiktok'

export const SOCIAL_NETWORK_CONFIG: Record<SocialNetwork, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'var(--color-brand-whatsapp)' },
  instagram: { label: 'Instagram', color: 'var(--color-brand-instagram)' },
  messenger: { label: 'Messenger', color: 'var(--color-brand-messenger)' },
  facebook: { label: 'Facebook', color: 'var(--color-brand-facebook)' },
  tiktok: { label: 'TikTok', color: 'var(--color-brand-tiktok)' },
}

export interface TicketListEntry {
  id: string
  title: string
  description: string
  status: TicketStatus
  createdAt: string
  itemCount: number
  totalAmount: number
  currency: string
  contact: {
    name: string
    identifier: string // phone, pseudo, etc.
  }
  socialNetwork: SocialNetwork
}

export interface Conversation {
  id: string
  contact: Contact
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  labels: Label[]
  tickets: Ticket[]
  messages: Message[]
}

const now = new Date()
const today = (h: number, m: number) => {
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const yesterday = (h: number, m: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const daysAgo = (days: number, h: number, m: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    contact: {
      id: 'c1',
      name: 'Amina Diallo',
      phone: '+237 691 234 567',
      avatarUrl: 'https://i.pravatar.cc/40?u=amina',
    },
    lastMessage: "D'accord, je passe en boutique demain !",
    lastMessageTime: today(11, 45),
    unreadCount: 3,
    labels: [AVAILABLE_LABELS[0], AVAILABLE_LABELS[3]],
    tickets: [
      {
        id: 'tkt-1',
        title: 'Commande Robe Wax Bleu — Taille M',
        description:
          'Robe Wax "Soleil d\'Afrique" en bleu, taille M. Retrait en boutique Douala. Ceinture assortie demandée. Total : 35 000 FCFA + 5 000 FCFA ceinture = 40 000 FCFA.',
        status: 'in_progress',
        createdAt: yesterday(15, 25),
        items: [
          {
            id: 'item-1',
            title: 'Robe Wax "Soleil d\'Afrique"',
            description: 'Robe évasée en tissu wax premium, coupe ajustée. Taille M, coloris bleu.',
            imageUrl: 'https://picsum.photos/seed/catalog-dress/200/200',
            unitPrice: 35000,
            quantity: 1,
            currency: 'FCFA',
          },
          {
            id: 'item-2',
            title: 'Ceinture Wax Assortie',
            description: 'Ceinture artisanale en tissu wax coordonné, boucle dorée.',
            imageUrl: 'https://picsum.photos/seed/belt-wax/200/200',
            unitPrice: 5000,
            quantity: 1,
            currency: 'FCFA',
          },
        ],
        activity: [
          {
            id: 'act-1',
            type: 'created',
            timestamp: yesterday(15, 25),
            author: 'Agent IA',
          },
          {
            id: 'act-2',
            type: 'status_change',
            timestamp: yesterday(15, 30),
            author: 'Agent IA',
            fromStatus: 'open',
            toStatus: 'in_progress',
          },
          {
            id: 'act-3',
            type: 'description_change',
            timestamp: today(9, 5),
            author: 'Agent IA',
            diff: {
              field: 'description',
              before:
                'Robe Wax "Soleil d\'Afrique" en bleu, taille M. Retrait en boutique Douala. Total : 35 000 FCFA.',
              after:
                'Robe Wax "Soleil d\'Afrique" en bleu, taille M. Retrait en boutique Douala. Ceinture assortie demandée. Total : 35 000 FCFA + 5 000 FCFA ceinture = 40 000 FCFA.',
            },
          },
        ],
      },
    ],
    messages: [
      {
        id: 'm1-1',
        type: 'text',
        from: 'customer',
        text: "Bonjour ! J'ai vu votre nouvelle collection sur Facebook",
        timestamp: yesterday(14, 30),
        isRead: true,
      },
      {
        id: 'm1-2',
        type: 'text',
        from: 'business',
        text: 'Bonjour Amina ! Merci pour votre intérêt. Que souhaitez-vous savoir ?',
        timestamp: yesterday(14, 35),
        isRead: true,
      },
      {
        id: 'm1-3',
        type: 'image',
        from: 'customer',
        imageUrl: 'https://picsum.photos/seed/wax-dress/400/500',
        imageCaption: "C'est cette robe qui m'intéresse, elle existe en bleu ?",
        timestamp: yesterday(14, 40),
        isRead: true,
      },
      {
        id: 'm1-4',
        type: 'text',
        from: 'business',
        text: 'Oui bien sûr ! Nous avons cette robe en bleu, vert et rouge. Voici notre catalogue :',
        timestamp: yesterday(15, 0),
        isRead: true,
      },
      {
        id: 'm1-5',
        type: 'catalog',
        from: 'business',
        catalogItem: {
          title: 'Robe Wax "Soleil d\'Afrique"',
          description: 'Robe évasée en tissu wax premium, coupe ajustée. Tailles S à XXL.',
          price: '35 000 FCFA',
          imageUrl: 'https://picsum.photos/seed/catalog-dress/200/200',
        },
        timestamp: yesterday(15, 1),
        isRead: true,
      },
      {
        id: 'm1-6',
        type: 'text',
        from: 'customer',
        text: 'Super ! Vous livrez à Yaoundé ?',
        timestamp: yesterday(15, 10),
        isRead: true,
        replyTo: {
          id: 'm1-5',
          text: 'Robe Wax "Soleil d\'Afrique" — 35 000 FCFA',
          from: 'business',
        },
      },
      {
        id: 'm1-7',
        type: 'button',
        from: 'business',
        buttonHeader: 'Options de livraison disponibles :',
        text: 'Nous livrons dans tout le Cameroun ! Choisissez votre option :',
        buttons: [
          { id: 'b1', label: 'Livraison standard (48h)' },
          { id: 'b2', label: 'Livraison express (24h)' },
          { id: 'b3', label: 'Retrait en boutique' },
        ],
        timestamp: yesterday(15, 15),
        isRead: true,
      },
      {
        id: 'm1-8',
        type: 'text',
        from: 'customer',
        text: 'Retrait en boutique',
        timestamp: yesterday(15, 20),
        isRead: true,
      },
      {
        id: 'm1-9',
        type: 'audio',
        from: 'business',
        audioUrl: '/audio/sample.mp3',
        audioDuration: 15,
        timestamp: today(9, 0),
        isRead: true,
      },
      {
        id: 'm1-10',
        type: 'text',
        from: 'customer',
        text: 'Merci pour le message vocal ! Quel est le prix total avec la ceinture ?',
        timestamp: today(10, 30),
        isRead: false,
        replyTo: {
          id: 'm1-9',
          text: 'Message vocal (0:15)',
          from: 'business',
        },
      },
      {
        id: 'm1-11',
        type: 'text',
        from: 'customer',
        text: 'Et vous avez des accessoires assortis ?',
        timestamp: today(10, 32),
        isRead: false,
      },
      {
        id: 'm1-12',
        type: 'text',
        from: 'customer',
        text: "D'accord, je passe en boutique demain !",
        timestamp: today(11, 45),
        isRead: false,
      },
    ],
  },
  {
    id: 'conv-2',
    contact: {
      id: 'c2',
      name: 'Paul Kamga',
      phone: '+237 670 987 654',
      avatarUrl: 'https://i.pravatar.cc/40?u=paul',
    },
    lastMessage: 'Votre commande #1234 est en cours de livraison',
    lastMessageTime: today(8, 30),
    unreadCount: 0,
    labels: [AVAILABLE_LABELS[1]],
    tickets: [
      {
        id: 'tkt-2',
        title: 'Commande #1234 — Ensemble Homme',
        description:
          'Ensemble homme tissu pagne, taille L. Livraison standard Yaoundé. Suivi : CM-2026-8847.',
        status: 'resolved',
        createdAt: daysAgo(3, 10, 0),
        items: [
          {
            id: 'item-3',
            title: 'Ensemble Homme Pagne',
            description: 'Ensemble chemise + pantalon en tissu pagne, taille L.',
            imageUrl: 'https://picsum.photos/seed/ensemble-homme/200/200',
            unitPrice: 45000,
            quantity: 1,
            currency: 'FCFA',
          },
        ],
        activity: [
          {
            id: 'act-4',
            type: 'created',
            timestamp: daysAgo(3, 10, 0),
            author: 'Agent IA',
          },
          {
            id: 'act-5',
            type: 'status_change',
            timestamp: daysAgo(2, 14, 0),
            author: 'Agent IA',
            fromStatus: 'open',
            toStatus: 'in_progress',
          },
          {
            id: 'act-6',
            type: 'status_change',
            timestamp: today(8, 30),
            author: 'Agent IA',
            fromStatus: 'in_progress',
            toStatus: 'resolved',
          },
        ],
      },
    ],
    messages: [
      {
        id: 'm2-1',
        type: 'text',
        from: 'customer',
        text: 'Bonjour, ma commande #1234 est où ?',
        timestamp: yesterday(10, 0),
        isRead: true,
      },
      {
        id: 'm2-2',
        type: 'text',
        from: 'business',
        text: 'Bonjour Paul ! Laissez-moi vérifier le statut de votre commande.',
        timestamp: yesterday(10, 5),
        isRead: true,
      },
      {
        id: 'm2-3',
        type: 'text',
        from: 'business',
        text: 'Votre colis a été expédié hier. Voici le numéro de suivi : CM-2026-8847',
        timestamp: yesterday(10, 10),
        isRead: true,
      },
      {
        id: 'm2-4',
        type: 'button',
        from: 'business',
        text: 'Souhaitez-vous suivre votre colis ?',
        buttons: [
          { id: 'b1', label: 'Suivre mon colis' },
          { id: 'b2', label: 'Contacter le livreur' },
        ],
        timestamp: yesterday(10, 11),
        isRead: true,
      },
      {
        id: 'm2-5',
        type: 'text',
        from: 'customer',
        text: 'Suivre mon colis',
        timestamp: yesterday(10, 15),
        isRead: true,
      },
      {
        id: 'm2-6',
        type: 'text',
        from: 'business',
        text: "Votre commande #1234 est en cours de livraison. Le livreur arrivera entre 14h et 16h aujourd'hui.",
        timestamp: today(8, 30),
        isRead: true,
      },
    ],
  },
  {
    id: 'conv-3',
    contact: {
      id: 'c3',
      name: 'Fatou Bamba',
      phone: '+237 655 111 222',
      avatarUrl: 'https://i.pravatar.cc/40?u=fatou',
    },
    lastMessage: 'Voici la vidéo de notre défilé',
    lastMessageTime: daysAgo(2, 16, 0),
    unreadCount: 1,
    labels: [],
    tickets: [],
    messages: [
      {
        id: 'm3-1',
        type: 'text',
        from: 'customer',
        text: 'Salut ! Vous avez des vidéos du défilé de samedi ?',
        timestamp: daysAgo(2, 14, 0),
        isRead: true,
      },
      {
        id: 'm3-2',
        type: 'video',
        from: 'business',
        text: 'Voici la vidéo de notre défilé',
        videoUrl: '/videos/sample.mp4',
        videoThumbnail: 'https://picsum.photos/seed/defile/400/300',
        timestamp: daysAgo(2, 16, 0),
        isRead: true,
      },
      {
        id: 'm3-3',
        type: 'audio',
        from: 'customer',
        audioUrl: '/audio/fatou.mp3',
        audioDuration: 8,
        timestamp: daysAgo(1, 9, 0),
        isRead: false,
      },
    ],
  },
  {
    id: 'conv-4',
    contact: {
      id: 'c4',
      name: 'Jean-Pierre Essono',
      phone: '+237 699 333 444',
      avatarUrl: 'https://i.pravatar.cc/40?u=jp',
    },
    lastMessage: 'Merci, à bientôt !',
    lastMessageTime: daysAgo(3, 18, 0),
    unreadCount: 0,
    labels: [AVAILABLE_LABELS[2]],
    tickets: [],
    messages: [
      {
        id: 'm4-1',
        type: 'text',
        from: 'customer',
        text: 'Bonjour, vous faites des costumes sur mesure ?',
        timestamp: daysAgo(3, 15, 0),
        isRead: true,
      },
      {
        id: 'm4-2',
        type: 'text',
        from: 'business',
        text: 'Bonjour Jean-Pierre ! Oui, nous proposons un service de couture sur mesure. Vous pouvez passer en boutique pour une prise de mesures.',
        timestamp: daysAgo(3, 15, 30),
        isRead: true,
      },
      {
        id: 'm4-3',
        type: 'image',
        from: 'business',
        imageUrl: 'https://picsum.photos/seed/costume/400/400',
        imageCaption: 'Voici quelques exemples de nos réalisations récentes.',
        timestamp: daysAgo(3, 15, 31),
        isRead: true,
      },
      {
        id: 'm4-4',
        type: 'text',
        from: 'customer',
        text: 'Merci, à bientôt !',
        timestamp: daysAgo(3, 18, 0),
        isRead: true,
      },
    ],
  },
  {
    id: 'conv-5',
    contact: {
      id: 'c5',
      name: 'Christelle Abega',
      phone: '+237 677 555 666',
    },
    lastMessage: "J'aimerais commander 3 ensembles pour un mariage",
    lastMessageTime: today(13, 0),
    unreadCount: 1,
    labels: [AVAILABLE_LABELS[0]],
    tickets: [],
    messages: [
      {
        id: 'm5-1',
        type: 'text',
        from: 'customer',
        text: "Bonjour ! J'aimerais commander 3 ensembles pour un mariage. Vous faites des prix de groupe ?",
        timestamp: today(13, 0),
        isRead: false,
      },
    ],
  },
  {
    id: 'conv-6',
    contact: {
      id: 'c6',
      name: 'Sandra Eyene',
      phone: '+237 650 777 888',
      avatarUrl: 'https://i.pravatar.cc/40?u=sandra',
    },
    lastMessage: "Le sac est en stock, je vous l'emballe !",
    lastMessageTime: daysAgo(5, 11, 0),
    unreadCount: 0,
    labels: [AVAILABLE_LABELS[2], AVAILABLE_LABELS[1]],
    tickets: [],
    messages: [
      {
        id: 'm6-1',
        type: 'text',
        from: 'customer',
        text: 'Le sac en cuir tressé marron est encore disponible ?',
        timestamp: daysAgo(5, 10, 0),
        isRead: true,
      },
      {
        id: 'm6-2',
        type: 'catalog',
        from: 'business',
        catalogItem: {
          title: 'Sac Cuir Tressé "Sahel"',
          description: 'Sac à main en cuir tressé artisanal, doublure coton, fermeture éclair.',
          price: '28 000 FCFA',
          imageUrl: 'https://picsum.photos/seed/bag-sahel/200/200',
        },
        timestamp: daysAgo(5, 10, 30),
        isRead: true,
      },
      {
        id: 'm6-3',
        type: 'text',
        from: 'business',
        text: "Le sac est en stock, je vous l'emballe !",
        timestamp: daysAgo(5, 11, 0),
        isRead: true,
      },
    ],
  },
]

/* ── Flat ticket list for the Tickets page ── */

export const MOCK_TICKET_LIST: TicketListEntry[] = [
  {
    id: 'tkt-1',
    title: 'Commande Robe Wax Bleu — Taille M',
    description:
      'Robe Wax "Soleil d\'Afrique" en bleu, taille M. Retrait en boutique Douala. Ceinture assortie demandée.',
    status: 'in_progress',
    createdAt: yesterday(15, 25),
    itemCount: 2,
    totalAmount: 40000,
    currency: 'FCFA',
    contact: { name: 'Amina Diallo', identifier: '+237 691 234 567' },
    socialNetwork: 'whatsapp',
  },
  {
    id: 'tkt-2',
    title: 'Commande #1234 — Ensemble Homme',
    description: 'Ensemble homme tissu pagne, taille L. Livraison standard Yaoundé.',
    status: 'resolved',
    createdAt: daysAgo(3, 10, 0),
    itemCount: 1,
    totalAmount: 45000,
    currency: 'FCFA',
    contact: { name: 'Paul Kamga', identifier: '+237 670 987 654' },
    socialNetwork: 'whatsapp',
  },
  {
    id: 'tkt-3',
    title: 'Retour sac cuir — Défaut fermeture',
    description: 'Sac cuir tressé "Sahel" retourné pour défaut de fermeture éclair.',
    status: 'open',
    createdAt: daysAgo(1, 9, 30),
    itemCount: 1,
    totalAmount: 28000,
    currency: 'FCFA',
    contact: { name: 'Sandra Eyene', identifier: '+237 650 777 888' },
    socialNetwork: 'instagram',
  },
  {
    id: 'tkt-4',
    title: 'Commande mariage — 3 ensembles',
    description: '3 ensembles assortis pour cérémonie de mariage, tailles variées.',
    status: 'waiting',
    createdAt: today(13, 15),
    itemCount: 3,
    totalAmount: 135000,
    currency: 'FCFA',
    contact: { name: 'Christelle Abega', identifier: '@christelle_ab' },
    socialNetwork: 'instagram',
  },
  {
    id: 'tkt-5',
    title: 'Commande sandales cuir',
    description: 'Paire de sandales cuir artisanal, pointures 38 et 42.',
    status: 'open',
    createdAt: daysAgo(2, 11, 0),
    itemCount: 2,
    totalAmount: 52000,
    currency: 'FCFA',
    contact: { name: 'Fatou Bamba', identifier: '+237 655 111 222' },
    socialNetwork: 'messenger',
  },
  {
    id: 'tkt-6',
    title: 'Costume sur mesure — Tissu Bazin',
    description: 'Costume 3 pièces en Bazin riche avec broderie artisanale, taille sur mesure.',
    status: 'in_progress',
    createdAt: daysAgo(4, 16, 0),
    itemCount: 1,
    totalAmount: 75000,
    currency: 'FCFA',
    contact: { name: 'Jean-Pierre Essono', identifier: '+237 699 333 444' },
    socialNetwork: 'whatsapp',
  },
  {
    id: 'tkt-7',
    title: 'Annulation — Robe taille incorrecte',
    description: 'Robe commandée en taille S au lieu de M, annulation demandée par la cliente.',
    status: 'cancelled',
    createdAt: daysAgo(6, 14, 0),
    itemCount: 1,
    totalAmount: 35000,
    currency: 'FCFA',
    contact: { name: 'Marie Ondo', identifier: '@marie.ondo' },
    socialNetwork: 'facebook',
  },
  {
    id: 'tkt-8',
    title: 'Lot bijoux artisanaux — Promo',
    description: "Lot promotionnel : collier, bracelet et boucles d'oreilles en perles et laiton.",
    status: 'resolved',
    createdAt: daysAgo(7, 10, 0),
    itemCount: 5,
    totalAmount: 62000,
    currency: 'FCFA',
    contact: { name: 'Aïcha Moussa', identifier: '@aicha_style' },
    socialNetwork: 'tiktok',
  },
  {
    id: 'tkt-9',
    title: 'Commande pochette événement',
    description: 'Pochette de soirée en tissu brodé, finitions dorées pour un gala.',
    status: 'open',
    createdAt: daysAgo(1, 17, 30),
    itemCount: 1,
    totalAmount: 18000,
    currency: 'FCFA',
    contact: { name: 'Hervé Ngono', identifier: '+237 677 444 555' },
    socialNetwork: 'whatsapp',
  },
  {
    id: 'tkt-10',
    title: 'Échange taille — Chemise Ankara',
    description: 'Échange de taille XL vers L pour chemise Ankara manches courtes.',
    status: 'waiting',
    createdAt: daysAgo(2, 8, 45),
    itemCount: 1,
    totalAmount: 22000,
    currency: 'FCFA',
    contact: { name: 'Diane Fokam', identifier: '@diane_fkm' },
    socialNetwork: 'instagram',
  },
]

/* ── Ticket detail map (flat lookup for the drawer) ── */

const TICKET_DETAILS_FROM_CONVERSATIONS: Record<string, Ticket> = {}
for (const conv of MOCK_CONVERSATIONS) {
  for (const ticket of conv.tickets) {
    TICKET_DETAILS_FROM_CONVERSATIONS[ticket.id] = ticket
  }
}

export function getTicketDetail(entry: TicketListEntry): Ticket {
  const existing = TICKET_DETAILS_FROM_CONVERSATIONS[entry.id]
  if (existing) return existing

  return {
    id: entry.id,
    title: entry.title,
    description: `${entry.title}. ${entry.itemCount} article${entry.itemCount > 1 ? 's' : ''} — ${entry.totalAmount.toLocaleString('fr-FR')} ${entry.currency}.`,
    status: entry.status,
    createdAt: entry.createdAt,
    items: Array.from({ length: entry.itemCount }, (_, i) => ({
      id: `${entry.id}-item-${i + 1}`,
      title: `Article ${i + 1}`,
      description: 'Article de la commande',
      imageUrl: `https://picsum.photos/seed/${entry.id}-${i}/200/200`,
      unitPrice: Math.round(entry.totalAmount / entry.itemCount),
      quantity: 1,
      currency: entry.currency,
    })),
    activity: [
      {
        id: `${entry.id}-act-1`,
        type: 'created',
        timestamp: entry.createdAt,
        author: 'Agent IA',
      },
    ],
  }
}

/* ── Catalog ── */

export type CatalogArticleStatus = 'published' | 'draft' | 'archived'

export const CATALOG_STATUS_CONFIG: Record<
  CatalogArticleStatus,
  { labelKey: string; color: string }
> = {
  published: { labelKey: 'catalog.status_published', color: '#22c55e' },
  draft: { labelKey: 'catalog.status_draft', color: '#f59e0b' },
  archived: { labelKey: 'catalog.status_archived', color: '#ef4444' },
}

export interface CatalogArticle {
  id: string
  contentId?: string
  name: string
  description: string
  imageUrl: string
  price: number
  currency: string
  category: string
  status: CatalogArticleStatus
  stock: number
  collection?: string
  createdAt: string
}

export interface Promotion {
  id: string
  name: string
  type: 'percent' | 'fixed'
  value: number
  productIds?: string[]
}

export const MOCK_PROMOTIONS: Promotion[] = [
  { id: 'promo-1', name: "Soldes d'été -20%", type: 'percent', value: 20 },
  { id: 'promo-2', name: 'Fidélité -10%', type: 'percent', value: 10 },
  { id: 'promo-3', name: 'Code BIENVENUE -15%', type: 'percent', value: 15 },
  { id: 'promo-4', name: 'Remise VIP -5 000 FCFA', type: 'fixed', value: 5000 },
  { id: 'promo-5', name: 'Flash Sale -30%', type: 'percent', value: 30 },
  { id: 'promo-6', name: 'Offre parrainage -2 500 FCFA', type: 'fixed', value: 2500 },
]

/* ── Promotions (full model) ── */

export type PromotionStatus = 'active' | 'scheduled' | 'expired'

export const PROMOTION_STATUS_CONFIG: Record<PromotionStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: '#22c55e' },
  scheduled: { label: 'Programmée', color: '#3b82f6' },
  expired: { label: 'Expirée', color: '#ef4444' },
}

export type PromotionEligibility = 'all' | 'specific'

export interface PromotionFull {
  id: string
  name: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  currency: string
  status: PromotionStatus
  stackable: boolean
  eligibility: PromotionEligibility
  eligibleProductIds: string[]
  startDate: string
  endDate: string
  createdAt: string
}

export const MOCK_PROMOTIONS_FULL: PromotionFull[] = [
  {
    id: 'promo-1',
    name: "Soldes d'été",
    code: 'SOLDES20',
    type: 'percent',
    value: 20,
    currency: 'FCFA',
    status: 'active',
    stackable: false,
    eligibility: 'all',
    eligibleProductIds: [],
    startDate: daysAgo(10, 0, 0),
    endDate: daysAgo(-20, 0, 0),
    createdAt: daysAgo(12, 10, 0),
  },
  {
    id: 'promo-2',
    name: 'Fidélité -10%',
    code: 'FIDELITE10',
    type: 'percent',
    value: 10,
    currency: 'FCFA',
    status: 'active',
    stackable: true,
    eligibility: 'all',
    eligibleProductIds: [],
    startDate: daysAgo(30, 0, 0),
    endDate: daysAgo(-60, 0, 0),
    createdAt: daysAgo(32, 9, 0),
  },
  {
    id: 'promo-3',
    name: 'Code BIENVENUE',
    code: 'BIENVENUE15',
    type: 'percent',
    value: 15,
    currency: 'FCFA',
    status: 'active',
    stackable: false,
    eligibility: 'all',
    eligibleProductIds: [],
    startDate: daysAgo(60, 0, 0),
    endDate: daysAgo(-30, 0, 0),
    createdAt: daysAgo(62, 8, 0),
  },
  {
    id: 'promo-4',
    name: 'Remise VIP',
    code: 'VIP5000',
    type: 'fixed',
    value: 5000,
    currency: 'FCFA',
    status: 'active',
    stackable: true,
    eligibility: 'specific',
    eligibleProductIds: ['art-1', 'art-2', 'art-9'],
    startDate: daysAgo(15, 0, 0),
    endDate: daysAgo(-45, 0, 0),
    createdAt: daysAgo(16, 14, 0),
  },
  {
    id: 'promo-5',
    name: 'Flash Sale -30%',
    code: 'FLASH30',
    type: 'percent',
    value: 30,
    currency: 'FCFA',
    status: 'expired',
    stackable: false,
    eligibility: 'specific',
    eligibleProductIds: ['art-3', 'art-4', 'art-7', 'art-8', 'art-10'],
    startDate: daysAgo(14, 0, 0),
    endDate: daysAgo(12, 0, 0),
    createdAt: daysAgo(15, 11, 0),
  },
  {
    id: 'promo-6',
    name: 'Offre parrainage',
    code: 'PARRAIN2500',
    type: 'fixed',
    value: 2500,
    currency: 'FCFA',
    status: 'active',
    stackable: true,
    eligibility: 'all',
    eligibleProductIds: [],
    startDate: daysAgo(20, 0, 0),
    endDate: daysAgo(-40, 0, 0),
    createdAt: daysAgo(22, 10, 0),
  },
  {
    id: 'promo-7',
    name: 'Promo Rentrée',
    code: 'RENTREE25',
    type: 'percent',
    value: 25,
    currency: 'FCFA',
    status: 'scheduled',
    stackable: false,
    eligibility: 'specific',
    eligibleProductIds: ['art-2', 'art-9'],
    startDate: daysAgo(-5, 0, 0),
    endDate: daysAgo(-35, 0, 0),
    createdAt: daysAgo(1, 16, 0),
  },
  {
    id: 'promo-8',
    name: 'Fête des mères',
    code: 'MAMAN15',
    type: 'percent',
    value: 15,
    currency: 'FCFA',
    status: 'scheduled',
    stackable: true,
    eligibility: 'specific',
    eligibleProductIds: ['art-1', 'art-3', 'art-7', 'art-8', 'art-10'],
    startDate: daysAgo(-10, 0, 0),
    endDate: daysAgo(-25, 0, 0),
    createdAt: today(9, 0),
  },
  {
    id: 'promo-9',
    name: 'Soldes Janvier',
    code: 'JANV40',
    type: 'percent',
    value: 40,
    currency: 'FCFA',
    status: 'expired',
    stackable: false,
    eligibility: 'all',
    eligibleProductIds: [],
    startDate: daysAgo(90, 0, 0),
    endDate: daysAgo(60, 0, 0),
    createdAt: daysAgo(92, 10, 0),
  },
  {
    id: 'promo-10',
    name: 'Remise Bijoux',
    code: 'BIJOUX3000',
    type: 'fixed',
    value: 3000,
    currency: 'FCFA',
    status: 'expired',
    stackable: false,
    eligibility: 'specific',
    eligibleProductIds: ['art-8'],
    startDate: daysAgo(45, 0, 0),
    endDate: daysAgo(30, 0, 0),
    createdAt: daysAgo(46, 15, 0),
  },
]

export const MOCK_CATALOG_ARTICLES: CatalogArticle[] = [
  {
    id: 'art-1',
    name: 'Robe Wax "Soleil d\'Afrique"',
    description: 'Robe évasée en tissu wax premium, coupe ajustée. Tailles S à XXL.',
    imageUrl: 'https://picsum.photos/seed/catalog-dress/200/200',
    price: 35000,
    currency: 'FCFA',
    category: 'Robes',
    status: 'published',
    stock: 12,
    createdAt: daysAgo(30, 10, 0),
  },
  {
    id: 'art-2',
    name: 'Ensemble Homme Pagne',
    description: 'Ensemble chemise + pantalon en tissu pagne, taille L.',
    imageUrl: 'https://picsum.photos/seed/ensemble-homme/200/200',
    price: 45000,
    currency: 'FCFA',
    category: 'Ensembles',
    status: 'published',
    stock: 8,
    createdAt: daysAgo(25, 14, 0),
  },
  {
    id: 'art-3',
    name: 'Sac Cuir Tressé "Sahel"',
    description: 'Sac à main en cuir tressé artisanal, doublure coton, fermeture éclair.',
    imageUrl: 'https://picsum.photos/seed/bag-sahel/200/200',
    price: 28000,
    currency: 'FCFA',
    category: 'Accessoires',
    status: 'published',
    stock: 5,
    createdAt: daysAgo(20, 9, 0),
  },
  {
    id: 'art-4',
    name: 'Ceinture Wax Assortie',
    description: 'Ceinture artisanale en tissu wax coordonné, boucle dorée.',
    imageUrl: 'https://picsum.photos/seed/belt-wax/200/200',
    price: 5000,
    currency: 'FCFA',
    category: 'Accessoires',
    status: 'published',
    stock: 20,
    createdAt: daysAgo(18, 11, 0),
  },
  {
    id: 'art-5',
    name: 'Chemise Ankara Homme',
    description: 'Chemise manches courtes en tissu Ankara, coupe moderne.',
    imageUrl: 'https://picsum.photos/seed/chemise-ankara/200/200',
    price: 22000,
    currency: 'FCFA',
    category: 'Chemises',
    status: 'archived',
    stock: 0,
    createdAt: daysAgo(15, 16, 0),
  },
  {
    id: 'art-6',
    name: 'Sandales Cuir Artisanal',
    description: 'Sandales en cuir véritable, semelle cousue main. Pointures 36-44.',
    imageUrl: 'https://picsum.photos/seed/sandales-cuir/200/200',
    price: 26000,
    currency: 'FCFA',
    category: 'Chaussures',
    status: 'published',
    stock: 6,
    createdAt: daysAgo(12, 10, 0),
  },
  {
    id: 'art-7',
    name: 'Pochette Événement Dorée',
    description: 'Pochette de soirée en tissu brodé, finitions dorées.',
    imageUrl: 'https://picsum.photos/seed/pochette-doree/200/200',
    price: 18000,
    currency: 'FCFA',
    category: 'Accessoires',
    status: 'draft',
    stock: 3,
    createdAt: daysAgo(10, 14, 0),
  },
  {
    id: 'art-8',
    name: 'Lot Bijoux Artisanaux',
    description: "Collier + bracelet + boucles d'oreilles en perles et laiton.",
    imageUrl: 'https://picsum.photos/seed/bijoux-lot/200/200',
    price: 15000,
    currency: 'FCFA',
    category: 'Bijoux',
    status: 'published',
    stock: 15,
    createdAt: daysAgo(8, 9, 30),
  },
  {
    id: 'art-9',
    name: 'Costume Bazin Brodé',
    description: 'Costume 3 pièces en tissu Bazin riche, broderie artisanale.',
    imageUrl: 'https://picsum.photos/seed/costume-bazin/200/200',
    price: 75000,
    currency: 'FCFA',
    category: 'Ensembles',
    status: 'published',
    stock: 2,
    createdAt: daysAgo(5, 11, 0),
  },
  {
    id: 'art-10',
    name: 'Foulard Soie Imprimé',
    description: 'Foulard en soie naturelle, motifs africains contemporains.',
    imageUrl: 'https://picsum.photos/seed/foulard-soie/200/200',
    price: 12000,
    currency: 'FCFA',
    category: 'Accessoires',
    status: 'draft',
    stock: 10,
    createdAt: daysAgo(3, 15, 0),
  },
]

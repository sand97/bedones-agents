export interface PostAuthor {
  id: string
  name: string
  avatarUrl?: string
}

export type CommentStatus = 'visible' | 'hidden' | 'deleted'

export interface Comment {
  id: string
  parentId?: string // if set, this is a reply to another comment (thread)
  author?: PostAuthor // undefined = page response (IA)
  text: string
  imageUrl?: string
  timestamp: string // ISO string
  isRead: boolean
  isPageReply: boolean
  status?: CommentStatus // defaults to 'visible'
  statusReason?: string // reason for hidden/deleted
}

export interface Post {
  id: string
  imageUrl?: string // undefined = no image
  content?: string // undefined = no text
  totalComments: number
  unreadComments: number
  comments: Comment[]
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

export const MOCK_POSTS: Post[] = [
  {
    id: 'post-1',
    imageUrl: 'https://picsum.photos/seed/mboa1/400/400',
    content:
      'Nouvelle collection printemps 2026 disponible en boutique et en ligne ! Découvrez nos pièces exclusives inspirées des tissus wax.',
    totalComments: 8,
    unreadComments: 3,
    comments: [
      {
        id: 'c1-1',
        author: { id: 'u1', name: 'Amina Diallo', avatarUrl: 'https://i.pravatar.cc/40?u=amina' },
        text: 'Magnifique collection ! Les couleurs sont incroyables 😍',
        timestamp: yesterday(14, 30),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c1-2',
        parentId: 'c1-1',
        text: "Merci beaucoup Amina ! Nous sommes ravis que ça vous plaise. N'hésitez pas à passer en boutique pour essayer.",
        timestamp: yesterday(15, 10),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c1-2b',
        parentId: 'c1-1',
        author: { id: 'u1', name: 'Amina Diallo', avatarUrl: 'https://i.pravatar.cc/40?u=amina' },
        text: 'Merci ! Je passerai ce week-end alors 😊',
        timestamp: yesterday(15, 25),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c1-2c',
        parentId: 'c1-1',
        text: "Parfait, on vous attend ! N'oubliez pas qu'on a -15% sur la nouvelle collection ce week-end.",
        timestamp: yesterday(15, 40),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c1-3',
        author: { id: 'u2', name: 'Paul Kamga', avatarUrl: 'https://i.pravatar.cc/40?u=paul' },
        text: 'Vous livrez à Yaoundé ?',
        timestamp: yesterday(16, 45),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c1-4',
        parentId: 'c1-3',
        text: 'Oui bien sûr ! Livraison gratuite à partir de 25 000 FCFA.',
        timestamp: yesterday(17, 20),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c1-5',
        author: { id: 'u3', name: 'Fatou Bamba', avatarUrl: 'https://i.pravatar.cc/40?u=fatou' },
        text: 'La robe en wax bleu est sublime ! Quelles tailles sont disponibles ?',
        timestamp: today(9, 15),
        isRead: false,
        isPageReply: false,
      },
      {
        id: 'c1-6',
        author: {
          id: 'u4',
          name: 'Cédric Nkoulou',
          avatarUrl: 'https://i.pravatar.cc/40?u=cedric',
        },
        text: "Quel est le prix de l'ensemble homme sur la 3ème photo ?",
        timestamp: today(10, 30),
        isRead: false,
        isPageReply: false,
      },
      {
        id: 'c1-7',
        author: { id: 'u1', name: 'Amina Diallo', avatarUrl: 'https://i.pravatar.cc/40?u=amina' },
        text: "Je suis passée en boutique, j'ai pris la robe verte ! Merci pour les conseils 🙏",
        timestamp: today(11, 45),
        isRead: false,
        isPageReply: false,
      },
    ],
  },
  {
    id: 'post-2',
    imageUrl: 'https://picsum.photos/seed/mboa2/400/400',
    content:
      'Notre atelier en pleine préparation pour le défilé de mode de Douala ce week-end. Restez connectés !',
    totalComments: 4,
    unreadComments: 2,
    comments: [
      {
        id: 'c2-1',
        author: { id: 'u5', name: 'Marie Nguemo', avatarUrl: 'https://i.pravatar.cc/40?u=marie' },
        text: "Trop hâte de voir ça ! C'est à quelle heure ?",
        timestamp: daysAgo(2, 18, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c2-2',
        parentId: 'c2-1',
        text: "Le défilé commence à 19h au Palais des Congrès. L'entrée est libre !",
        timestamp: daysAgo(2, 18, 30),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c2-3',
        author: {
          id: 'u6',
          name: 'Jean-Pierre Essono',
          avatarUrl: 'https://i.pravatar.cc/40?u=jp',
        },
        text: 'Bravo pour tout le travail ! On voit la passion 💪',
        timestamp: today(8, 0),
        isRead: false,
        isPageReply: false,
      },
      {
        id: 'c2-4',
        author: {
          id: 'u7',
          name: 'Aïssatou Sow',
          avatarUrl: 'https://i.pravatar.cc/40?u=aissatou',
        },
        text: "Est-ce qu'il y aura une vente directe au défilé ?",
        timestamp: today(9, 45),
        isRead: false,
        isPageReply: false,
      },
    ],
  },
  {
    id: 'post-3',
    imageUrl: 'https://picsum.photos/seed/mboa3/400/400',
    content:
      'Merci à tous nos clients fidèles ! Nous venons de franchir le cap des 10 000 abonnés 🎉',
    totalComments: 12,
    unreadComments: 0,
    comments: [
      {
        id: 'c3-1',
        author: {
          id: 'u8',
          name: 'Olivier Mbarga',
          avatarUrl: 'https://i.pravatar.cc/40?u=olivier',
        },
        text: 'Félicitations ! Vous le méritez amplement 👏',
        timestamp: daysAgo(5, 10, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c3-2',
        parentId: 'c3-1',
        text: "Merci Olivier, c'est grâce à vous tous ! 🙏",
        timestamp: daysAgo(5, 10, 30),
        isRead: true,
        isPageReply: true,
      },
    ],
  },
  {
    id: 'post-4',
    imageUrl: 'https://picsum.photos/seed/mboa4/400/400',
    content:
      'Nos accessoires en cuir tressé, fabriqués à la main par nos artisans locaux. Chaque pièce est unique.',
    totalComments: 6,
    unreadComments: 0,
    comments: [
      {
        id: 'c4-1',
        author: { id: 'u9', name: 'Sandra Eyene', avatarUrl: 'https://i.pravatar.cc/40?u=sandra' },
        text: "J'adore le sac marron ! Comment le commander ?",
        timestamp: daysAgo(7, 14, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c4-2',
        parentId: 'c4-1',
        text: 'Bonjour Sandra ! Vous pouvez commander directement sur notre site mboafashion.com ou nous écrire en message privé.',
        timestamp: daysAgo(7, 14, 45),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c4-3',
        author: { id: 'u10', name: 'Alain Fotso', avatarUrl: 'https://i.pravatar.cc/40?u=alain' },
        text: "C'est du faux cuir ou du vrai ?",
        timestamp: daysAgo(6, 9, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c4-3r',
        parentId: 'c4-3',
        text: '',
        timestamp: daysAgo(6, 9, 15),
        isRead: true,
        isPageReply: true,
        status: 'hidden',
        statusReason: 'Question potentiellement négative',
      },
      {
        id: 'c4-4',
        author: { id: 'u11', name: 'Spam Bot 3000' },
        text: 'Achetez des followers pas cher sur www.spam-link.com !!!',
        timestamp: daysAgo(6, 11, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c4-4r',
        parentId: 'c4-4',
        text: '',
        timestamp: daysAgo(6, 11, 5),
        isRead: true,
        isPageReply: true,
        status: 'deleted',
        statusReason: 'Spam détecté automatiquement',
      },
    ],
  },
  {
    id: 'post-5',
    content: 'Qui est disponible pour un shooting photo ce samedi ? Envoyez-nous un message !',
    totalComments: 3,
    unreadComments: 1,
    comments: [
      {
        id: 'c5-1',
        author: {
          id: 'u12',
          name: 'Christelle Abega',
          avatarUrl: 'https://i.pravatar.cc/40?u=christelle',
        },
        text: "Moi je suis dispo ! C'est où exactement ?",
        timestamp: today(7, 30),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c5-2',
        parentId: 'c5-1',
        text: "Super Christelle ! Rendez-vous à notre boutique de Douala à 10h. On vous enverra l'adresse exacte en MP.",
        timestamp: today(8, 0),
        isRead: true,
        isPageReply: true,
      },
      {
        id: 'c5-3',
        author: { id: 'u13', name: 'Kevin Tchato', avatarUrl: 'https://i.pravatar.cc/40?u=kevin' },
        text: 'Je suis partant aussi ! 📸',
        timestamp: today(12, 15),
        isRead: false,
        isPageReply: false,
      },
    ],
  },
  {
    id: 'post-6',
    imageUrl: 'https://picsum.photos/seed/mboa6/400/400',
    totalComments: 2,
    unreadComments: 0,
    comments: [
      {
        id: 'c6-1',
        author: { id: 'u14', name: 'Diane Essomba', avatarUrl: 'https://i.pravatar.cc/40?u=diane' },
        text: 'Wow cette photo est magnifique ! 😍 Vous avez un super photographe.',
        timestamp: daysAgo(3, 16, 0),
        isRead: true,
        isPageReply: false,
      },
      {
        id: 'c6-2',
        parentId: 'c6-1',
        text: 'Merci Diane ! Notre photographe sera ravi de lire ça 📷',
        timestamp: daysAgo(3, 16, 30),
        isRead: true,
        isPageReply: true,
      },
    ],
  },
]

// Blog articles — raw MD imports parsed at build time
import pourquoiAutomatiserWhatsapp from './pourquoi-automatiser-whatsapp.md?raw'
import gererCommandesInstagram from './gerer-commandes-instagram.md?raw'
import organiserSonBusiness from './organiser-son-business-en-ligne.md?raw'
import repondreCommentairesFacebook from './repondre-commentaires-facebook.md?raw'
import accompagnementGratuit from './accompagnement-gratuit-bedones.md?raw'
import gagnerTempsEntrepreneur from './gagner-temps-entrepreneur-afrique.md?raw'
import volDeLeads from './vol-de-leads-commentaires.md?raw'
import agentComprendProduits from './agent-comprend-vos-produits.md?raw'
import agentAccepteFeedback from './agent-accepte-feedback.md?raw'
import ressourcesInterconnectees from './ressources-interconnectees.md?raw'
import commentAugmenterVentes from './comment-augmenter-mes-ventes-en-ligne.md?raw'
import fideliserClients from './fideliser-clients-petit-commerce.md?raw'
import automatiserMessages from './automatiser-messages-whatsapp-instagram-tiktok.md?raw'
import lierCatalogueTiktokWa from './lier-catalogue-tiktok-whatsapp.md?raw'
import accepterMobileMoney from './accepter-mobile-money-boutique-en-ligne.md?raw'
import repondreRapidement from './repondre-rapidement-clients-whatsapp.md?raw'
import recupererPaniersAbandonnes from './recuperer-paniers-abandonnes-whatsapp.md?raw'
import vendreSurInstagram from './vendre-sur-instagram-sans-site-web.md?raw'
import gererPicCommandes from './gerer-pic-commandes-promotion.md?raw'
import chatbotVsAgent from './chatbot-vs-agent-ia-commerce.md?raw'
import serviceClient24h from './service-client-24h-petite-equipe.md?raw'
import automatisationMobileMoneyAfrique from './automatisation-vente-mobile-money-afrique.md?raw'
import gererAvecChatgptClaude from './gerer-commentaires-messages-chatgpt-claude.md?raw'
import commentFonctionneMcp from './comment-fonctionne-mcp-bedones.md?raw'
import iaCameroun from './repondre-clients-ia-chatgpt-claude-cameroun.md?raw'
import iaCoteDivoire from './repondre-clients-ia-chatgpt-claude-cote-divoire.md?raw'

export interface BlogArticle {
  title: string
  slug: string
  excerpt: string
  date: string
  readTime: string
  category: string
  content: string
  /** SVG illustration path (if exists in /public/blog/) */
  image: string
  /** Color background class used when no illustration exists */
  coverColor: string
  /** SEO-optimized meta description (falls back to excerpt) */
  metaDescription: string
  /** Comma-separated SEO keywords */
  keywords: string
}

// Deterministic mapping category → background color class
const CATEGORY_COLORS: Record<string, string> = {
  'WhatsApp Business': 'mk-cover-mint',
  WhatsApp: 'mk-cover-mint',
  Instagram: 'mk-cover-rose',
  TikTok: 'mk-cover-stone',
  Facebook: 'mk-cover-sky',
  'Mobile Money': 'mk-cover-peach',
  Automatisation: 'mk-cover-lavender',
  Ventes: 'mk-cover-coral',
  Fidélisation: 'mk-cover-cream',
  'Service Client': 'mk-cover-sand',
  Catalogue: 'mk-cover-green',
  IA: 'mk-cover-lavender',
  'Agent IA': 'mk-cover-lavender',
  'Étude de cas': 'mk-cover-green',
  Accompagnement: 'mk-cover-sand',
  Productivité: 'mk-cover-cream',
  Organisation: 'mk-cover-sky',
  'Multi-plateforme': 'mk-cover-lavender',
  Protection: 'mk-cover-rose',
}

function parseFrontmatter(raw: string): BlogArticle {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error('Invalid frontmatter')

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, '')
    meta[key] = value
  }

  const category = meta.category || 'Automatisation'
  const coverColor = CATEGORY_COLORS[category] || 'mk-cover-lavender'

  return {
    title: meta.title,
    slug: meta.slug,
    excerpt: meta.excerpt,
    date: meta.date,
    readTime: meta.readTime || '3 min',
    category,
    content: match[2].trim(),
    image: `/blog/${meta.slug}.svg`,
    coverColor,
    metaDescription: meta.metaDescription || meta.excerpt,
    keywords: meta.keywords || '',
  }
}

export const blogArticles: BlogArticle[] = [
  parseFrontmatter(pourquoiAutomatiserWhatsapp),
  parseFrontmatter(gererCommandesInstagram),
  parseFrontmatter(organiserSonBusiness),
  parseFrontmatter(repondreCommentairesFacebook),
  parseFrontmatter(accompagnementGratuit),
  parseFrontmatter(gagnerTempsEntrepreneur),
  parseFrontmatter(volDeLeads),
  parseFrontmatter(agentComprendProduits),
  parseFrontmatter(agentAccepteFeedback),
  parseFrontmatter(ressourcesInterconnectees),
  parseFrontmatter(commentAugmenterVentes),
  parseFrontmatter(fideliserClients),
  parseFrontmatter(automatiserMessages),
  parseFrontmatter(lierCatalogueTiktokWa),
  parseFrontmatter(accepterMobileMoney),
  parseFrontmatter(repondreRapidement),
  parseFrontmatter(recupererPaniersAbandonnes),
  parseFrontmatter(vendreSurInstagram),
  parseFrontmatter(gererPicCommandes),
  parseFrontmatter(chatbotVsAgent),
  parseFrontmatter(serviceClient24h),
  parseFrontmatter(automatisationMobileMoneyAfrique),
  parseFrontmatter(gererAvecChatgptClaude),
  parseFrontmatter(commentFonctionneMcp),
  parseFrontmatter(iaCameroun),
  parseFrontmatter(iaCoteDivoire),
].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return blogArticles.find((a) => a.slug === slug)
}

/** Aggregated counts by category, sorted by count desc */
export function getCategoryCounts(): { category: string; count: number }[] {
  const map = new Map<string, number>()
  for (const a of blogArticles) {
    map.set(a.category, (map.get(a.category) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

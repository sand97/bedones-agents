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

export interface BlogArticle {
  title: string
  slug: string
  excerpt: string
  date: string
  readTime: string
  category: string
  content: string
  image: string
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

  return {
    title: meta.title,
    slug: meta.slug,
    excerpt: meta.excerpt,
    date: meta.date,
    readTime: meta.readTime,
    category: meta.category,
    content: match[2].trim(),
    image: `/blog/${meta.slug}.svg`,
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
].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return blogArticles.find((a) => a.slug === slug)
}

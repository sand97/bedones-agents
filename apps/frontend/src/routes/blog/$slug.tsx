import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import { MarketingNav } from '@app/components/marketing/marketing-nav'
import { MarketingFooter } from '@app/components/marketing/marketing-footer'
import { getArticleBySlug, blogArticles } from '@app/data/blog'
import type { BlogArticle } from '@app/data/blog'
import type { ReactNode } from 'react'

const SITE_URL = 'https://moderator.bedones.com'

export const Route = createFileRoute('/blog/$slug')({
  head: ({ params }) => {
    const article = getArticleBySlug(params.slug)
    if (!article) {
      return {
        meta: [
          { title: 'Article introuvable — Blog Bedones' },
          { name: 'robots', content: 'noindex' },
        ],
      }
    }
    const url = `${SITE_URL}/blog/${article.slug}`
    const imageUrl = `${SITE_URL}/blog/${article.slug}.svg`
    return {
      meta: [
        { title: `${article.title} — Bedones` },
        { name: 'description', content: article.metaDescription },
        { name: 'keywords', content: article.keywords },
        { name: 'author', content: 'Bedones' },
        { property: 'og:title', content: article.title },
        { property: 'og:description', content: article.metaDescription },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        { property: 'og:image', content: imageUrl },
        { property: 'og:locale', content: 'fr_FR' },
        { property: 'article:published_time', content: article.date },
        { property: 'article:section', content: article.category },
        { property: 'article:tag', content: article.keywords },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: article.title },
        { name: 'twitter:description', content: article.metaDescription },
        { name: 'twitter:image', content: imageUrl },
        { name: 'robots', content: 'index, follow' },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: BlogArticlePage,
})

/** Markdown → JSX: handles ##, ###, -, **bold**, [link](url) and paragraphs */
function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n')
  const elements: ReactNode[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let key = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (!text) return
    elements.push(<p key={key++}>{renderInline(text)}</p>)
  }

  const flushList = () => {
    if (!list.length) return
    elements.push(
      <ul key={key++}>
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flushList()
      flushParagraph()
      elements.push(<h2 key={key++}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      flushList()
      flushParagraph()
      elements.push(<h3 key={key++}>{line.slice(4)}</h3>)
    } else if (line.startsWith('- ')) {
      flushParagraph()
      list.push(line.slice(2))
    } else if (/^\d+\.\s/.test(line)) {
      flushParagraph()
      list.push(line.replace(/^\d+\.\s/, ''))
    } else if (line.trim() === '') {
      flushList()
      flushParagraph()
    } else {
      if (list.length > 0) flushList()
      paragraph.push(line)
    }
  }
  flushList()
  flushParagraph()
  return elements
}

function renderInline(text: string): ReactNode[] {
  // Handle **bold** first, then [link](url)
  const parts: ReactNode[] = []
  const buf = text
  let key = 0
  // bold
  const boldRegex = /\*\*(.*?)\*\*/g
  const segments: ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = boldRegex.exec(buf)) !== null) {
    if (m.index > lastIdx) segments.push(buf.slice(lastIdx, m.index))
    segments.push(<strong key={`b${key++}`}>{m[1]}</strong>)
    lastIdx = boldRegex.lastIndex
  }
  if (lastIdx < buf.length) segments.push(buf.slice(lastIdx))

  // Now process inline links inside string segments
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  for (const seg of segments) {
    if (typeof seg !== 'string') {
      parts.push(seg)
      continue
    }
    let li = 0
    let lm: RegExpExecArray | null
    while ((lm = linkRegex.exec(seg)) !== null) {
      if (lm.index > li) parts.push(seg.slice(li, lm.index))
      parts.push(
        <a key={`l${key++}`} href={lm[2]} target="_blank" rel="noopener noreferrer">
          {lm[1]}
        </a>,
      )
      li = linkRegex.lastIndex
    }
    if (li < seg.length) parts.push(seg.slice(li))
  }
  return parts
}

function buildJsonLd(article: BlogArticle) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.metaDescription,
    image: `${SITE_URL}/blog/${article.slug}.svg`,
    datePublished: article.date,
    dateModified: article.date,
    keywords: article.keywords,
    articleSection: article.category,
    author: { '@type': 'Organization', name: 'Bedones', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Bedones',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
    },
    mainEntityOfPage: `${SITE_URL}/blog/${article.slug}`,
  }
}

function BlogArticlePage() {
  const { slug } = Route.useParams()
  const article = getArticleBySlug(slug)

  if (!article) {
    return (
      <div className="mk">
        <MarketingNav current="blog" />
        <section className="mk-article">
          <div className="mk-container">
            <Link to="/blog" className="mk-article-back">
              <ArrowLeft size={16} />
              <span>Retour au blog</span>
            </Link>
            <div className="mk-article-head">
              <h1>Article introuvable</h1>
              <p>Cet article n&apos;existe pas ou a été supprimé.</p>
            </div>
          </div>
        </section>
        <MarketingFooter />
      </div>
    )
  }

  const suggested = blogArticles.filter((a) => a.slug !== slug).slice(0, 3)
  const jsonLd = buildJsonLd(article)

  return (
    <div className="mk">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav current="blog" />

      <section className="mk-article">
        <div className="mk-container">
          <Link to="/blog" className="mk-article-back">
            <ArrowLeft size={16} />
            <span>Retour au blog</span>
          </Link>

          <header className="mk-article-head">
            <div className="mk-card-meta">
              <span className="swatch" />
              {article.category}
              <span className="sep">·</span>
              <span
                className="read-time"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Clock size={13} />
                {article.readTime}
              </span>
            </div>
            <h1>{article.title}</h1>
            <p className="date">
              {new Date(article.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </header>

          <div
            className={`mk-article-cover ${article.coverColor}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <CoverIllustration category={article.category} />
          </div>

          <article className="mk-article-body">{renderMarkdown(article.content)}</article>

          <div className="mk-article-cta">
            <h3>Prêt(e) à automatiser vos ventes ?</h3>
            <p>
              Créez votre agent IA Bedones en moins de 10 minutes. Gratuit, sans carte bancaire.
            </p>
            <Link to="/auth/login" className="mk-btn mk-btn-white">
              Démarrer gratuitement
              <ArrowRight size={16} />
            </Link>
          </div>

          {suggested.length > 0 && (
            <section className="mk-article-related">
              <h3>À lire aussi</h3>
              <div className="mk-blog-grid">
                {suggested.map((a) => (
                  <Link key={a.slug} to="/blog/$slug" params={{ slug: a.slug }} className="mk-card">
                    <div
                      className={`mk-card-cover ${a.coverColor}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <CoverIllustration category={a.category} small />
                    </div>
                    <div className="mk-card-body">
                      <div className="mk-card-meta">
                        <span className="swatch" />
                        {a.category}
                      </div>
                      <h3 className="mk-card-title">{a.title}</h3>
                      <div className="mk-card-foot">
                        <span className="read-time">
                          <Clock size={12} />
                          {a.readTime}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

function CoverIllustration({ category, small }: { category: string; small?: boolean }) {
  const c = category.toLowerCase()
  const size = small ? { width: '55%', height: '55%' } : { width: '50%', height: '50%' }
  const props = { className: 'illu', style: size }
  if (c.includes('whatsapp')) {
    return (
      <svg
        {...props}
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="36" y="34" width="60" height="72" rx="8" fill="#fff" />
        <rect x="104" y="34" width="60" height="72" rx="8" fill="#fff" />
        <path d="M50 56 h32 M50 70 h22 M118 56 h32 M118 70 h22" />
        <circle cx="66" cy="92" r="6" fill="#25D366" />
        <circle cx="134" cy="92" r="6" fill="#25D366" />
      </svg>
    )
  }
  if (c.includes('instagram')) {
    return (
      <svg
        {...props}
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="30" y="22" width="140" height="96" rx="16" fill="#fff" />
        <path d="M50 50 h100 M50 68 h80 M50 86 h60" />
        <circle cx="156" cy="36" r="10" fill="#E1306C" stroke="#E1306C" />
      </svg>
    )
  }
  if (c.includes('tiktok')) {
    return (
      <svg
        {...props}
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="60" y="20" width="80" height="100" rx="12" fill="#fff" />
        <circle cx="100" cy="58" r="14" fill="#111" />
        <circle cx="158" cy="28" r="8" fill="#FF0050" />
        <circle cx="148" cy="28" r="8" fill="#00F2EA" opacity="0.85" />
      </svg>
    )
  }
  if (c.includes('mobile money')) {
    return (
      <svg
        {...props}
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="80" cy="70" r="32" fill="#F7931A" stroke="#F7931A" />
        <circle cx="130" cy="70" r="32" fill="#FFCC00" stroke="#111" />
      </svg>
    )
  }
  return (
    <svg
      {...props}
      viewBox="0 0 200 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="22" y="22" width="120" height="84" rx="20" fill="#fff" />
      <path d="M40 50 h80 M40 66 h60 M40 82 h44" />
      <circle cx="158" cy="38" r="26" fill="currentColor" />
    </svg>
  )
}

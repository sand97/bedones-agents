import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { MarketingNav } from '@app/components/marketing/marketing-nav'
import { MarketingFooter } from '@app/components/marketing/marketing-footer'
import { blogArticles, getCategoryCounts, type BlogArticle } from '@app/data/blog'

const SITE_URL = 'https://bedones.com'
const TITLE = "Blog Bedones — Vendre, automatiser et grandir avec l'IA"
const DESCRIPTION =
  'Guides, études de cas et conseils pour automatiser vos ventes sur WhatsApp, Instagram, TikTok et Facebook. Ressources pratiques pour entrepreneurs en ligne.'

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Blog Bedones',
  url: `${SITE_URL}/blog`,
  description: DESCRIPTION,
  publisher: {
    '@type': 'Organization',
    name: 'Bedones',
    url: SITE_URL,
  },
}

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      {
        name: 'keywords',
        content:
          'blog automatisation, IA vente en ligne, WhatsApp Business, Instagram commerce, TikTok shop, Mobile Money, service client',
      },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE_URL}/blog` },
      { property: 'og:image', content: `${SITE_URL}/og-blog.png` },
      { property: 'og:locale', content: 'fr_FR' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'robots', content: 'index, follow' },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/blog` }],
  }),
  component: BlogListPage,
})

function ArticleCard({
  article,
  variant,
  showExcerpt = true,
}: {
  article: BlogArticle
  variant?: 'featured-main' | 'grid'
  showExcerpt?: boolean
}) {
  const className = variant === 'featured-main' ? 'mk-card mk-featured-main' : 'mk-card'
  return (
    <Link to="/blog/$slug" params={{ slug: article.slug }} className={className}>
      <div className={`mk-card-cover ${article.coverColor}`}>
        {variant === 'featured-main' && <span className="mk-featured-tag">À la une</span>}
        <CardIllustration category={article.category} />
      </div>
      <div className="mk-card-body">
        <div className="mk-card-meta">
          <span className="swatch" />
          {article.category}
          <span className="sep">·</span>
          {new Date(article.date).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </div>
        <h2 className="mk-card-title">{article.title}</h2>
        {showExcerpt && <p className="mk-card-excerpt">{article.excerpt}</p>}
        <div className="mk-card-foot">
          <span className="read-time">
            <ClockIcon />
            {article.readTime}
          </span>
        </div>
      </div>
    </Link>
  )
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function CardIllustration({ category }: { category: string }) {
  // Generic illustrations per category — kept simple, monochrome, lightweight
  const c = category.toLowerCase()
  if (c.includes('whatsapp')) {
    return (
      <svg
        className="illu"
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
        className="illu"
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
        className="illu"
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="60" y="20" width="80" height="100" rx="12" fill="#fff" />
        <circle cx="100" cy="58" r="14" fill="#111" />
        <path d="M86 86 h28 M86 98 h18" />
        <circle cx="158" cy="28" r="8" fill="#FF0050" stroke="#FF0050" />
        <circle cx="148" cy="28" r="8" fill="#00F2EA" stroke="#00F2EA" opacity="0.85" />
      </svg>
    )
  }
  if (c.includes('mobile money') || c.includes('paiement')) {
    return (
      <svg
        className="illu"
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
  if (c.includes('facebook')) {
    return (
      <svg
        className="illu"
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="30" y="22" width="140" height="96" rx="14" fill="#fff" />
        <circle cx="156" cy="36" r="10" fill="#1877F2" stroke="#1877F2" />
        <path d="M50 60 h90 M50 78 h70 M50 96 h50" />
      </svg>
    )
  }
  if (c.includes('ia') || c.includes('agent') || c.includes('automatisation')) {
    return (
      <svg
        className="illu"
        viewBox="0 0 200 140"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M100 28 c -22 0 -36 16 -36 34 c 0 14 8 22 8 30 v 8 h 56 v -8 c 0 -8 8 -16 8 -30 c 0 -18 -14 -34 -36 -34 z"
          fill="#fff"
        />
        <path d="M82 80 h36 M86 100 h28" />
        <circle cx="90" cy="56" r="3" fill="currentColor" />
        <circle cx="110" cy="56" r="3" fill="currentColor" />
      </svg>
    )
  }
  // Default: chat bubble + spark
  return (
    <svg
      className="illu"
      viewBox="0 0 200 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="22" y="22" width="120" height="84" rx="20" fill="#fff" />
      <path d="M40 50 h80 M40 66 h60 M40 82 h44" />
      <path d="M58 106 l-10 18 22 -10 z" fill="#fff" />
      <circle cx="158" cy="38" r="26" fill="currentColor" />
    </svg>
  )
}

// Static list of category filters
const CATEGORIES = [
  'WhatsApp Business',
  'Instagram',
  'TikTok',
  'Facebook',
  'Mobile Money',
  'Automatisation',
  'Ventes',
  'Service Client',
  'Fidélisation',
  'IA',
  'Étude de cas',
]

function BlogListPage() {
  const [activeCat, setActiveCat] = useState<string>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return blogArticles.filter((a) => {
      const catOK = activeCat === 'all' || a.category === activeCat
      if (!catOK) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.keywords.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      )
    })
  }, [activeCat, query])

  const [featured, ...rest] = filtered
  const sideFeatured = rest.slice(0, 2)
  const gridArticles = rest.slice(2)

  const counts = useMemo(() => getCategoryCounts(), [])

  return (
    <div className="mk">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <MarketingNav current="blog" />

      <section className="mk-blog-header">
        <div className="mk-container mk-blog-header-inner">
          <div>
            <span className="mk-eyebrow-tag">
              <span className="dot" />
              BEDONES RESSOURCES
            </span>
            <h1>Vendre, automatiser et grandir avec l&apos;IA.</h1>
            <p className="sub">
              Guides, études de cas et coulisses produit pour les entrepreneurs qui font tourner
              leur business sur WhatsApp, Instagram et TikTok.
            </p>
          </div>
          <div className="mk-search-card">
            <label htmlFor="q">Trouver un article</label>
            <div className="mk-search-bar">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="q"
                type="text"
                placeholder="WhatsApp, Mobile Money, automatisation…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mk-search-meta">
              <span>
                <strong>{blogArticles.length} articles</strong> publiés
              </span>
              <span>Mis à jour régulièrement</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="mk-cat-rail" aria-label="Catégories">
        <div className="mk-container mk-cat-rail-inner">
          <button
            className={`mk-cat-pill${activeCat === 'all' ? ' active' : ''}`}
            onClick={() => setActiveCat('all')}
          >
            <span className="swatch" />
            Tous
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`mk-cat-pill${activeCat === cat ? ' active' : ''}`}
              onClick={() => setActiveCat(cat)}
            >
              <span className="swatch" />
              {cat}
            </button>
          ))}
        </div>
      </nav>

      {featured && (
        <section className="mk-featured">
          <div className="mk-container mk-featured-grid">
            <ArticleCard article={featured} variant="featured-main" />
            {sideFeatured.length > 0 && (
              <div className="mk-featured-side">
                {sideFeatured.map((a) => (
                  <ArticleCard key={a.slug} article={a} showExcerpt={false} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mk-grid-section">
        <div className="mk-container">
          <div className="mk-grid-head">
            <h2>Tous les articles</h2>
            <div className="filter-meta">
              {activeCat === 'all' ? 'Tous' : activeCat} · {filtered.length} résultat
              {filtered.length > 1 ? 's' : ''}
            </div>
          </div>
          {gridArticles.length > 0 ? (
            <div className="mk-blog-grid">
              {gridArticles.map((a) => (
                <ArticleCard key={a.slug} article={a} variant="grid" />
              ))}
            </div>
          ) : (
            filtered.length === 0 && (
              <div
                style={{
                  padding: '60px 0',
                  textAlign: 'center',
                  color: 'var(--mk-text-soft)',
                }}
              >
                Aucun article ne correspond à votre recherche.
              </div>
            )
          )}
        </div>
      </section>

      <section className="mk-feature-band">
        <div className="mk-container mk-feature-band-grid">
          <div className="mk-topics">
            <h2>Explorez par thème</h2>
            <p>
              {blogArticles.length} articles répartis sur les sujets qui font tourner les business
              en ligne.
            </p>
            <div className="mk-topics-list">
              {counts.map(({ category, count }) => (
                <button key={category} className="mk-topic" onClick={() => setActiveCat(category)}>
                  {category} <span className="n">{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mk-newsletter">
            <span className="mk-newsletter-eyebrow">Newsletter Bedones</span>
            <h3>Un article, chaque mardi, dans votre boîte.</h3>
            <p>
              Le meilleur de nos guides, études et nouveautés produit — résumés en 3 minutes de
              lecture. Pas de spam, jamais.
            </p>
            <form
              className="mk-newsletter-form"
              onSubmit={(e) => {
                e.preventDefault()
                const btn = e.currentTarget.querySelector('button')
                if (btn) btn.textContent = 'Inscrit ✓'
              }}
            >
              <input type="email" placeholder="vous@entreprise.com" required />
              <button type="submit">S&apos;abonner</button>
            </form>
            <div className="smallprint">2 100+ entrepreneurs nous lisent déjà.</div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

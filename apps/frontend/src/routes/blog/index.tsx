import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { MarketingNav } from '@app/components/marketing/marketing-nav'
import { MarketingFooter } from '@app/components/marketing/marketing-footer'
import { blogArticles, getCategoryCounts, type BlogArticle } from '@app/data/blog'
import { MK_CONTAINER } from '@app/components/marketing/mk'

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
  const isFeaturedMain = variant === 'featured-main'
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: article.slug }}
      className={[
        // .mk-card base
        'bg-white border border-[var(--mk-border)] rounded-[20px] overflow-hidden flex flex-col',
        'transition-[border-color,transform] duration-150',
        'hover:border-[rgba(17,27,33,0.4)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* .mk-card-cover */}
      <div
        className={[
          'relative overflow-hidden flex items-center justify-center',
          isFeaturedMain ? 'aspect-[16/8]' : 'aspect-[16/9]',
          article.coverColor,
        ].join(' ')}
      >
        {isFeaturedMain && (
          // .mk-featured-tag
          <span className="inline-flex items-center gap-1.5 bg-[var(--mk-text)] text-white text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-[6px] rounded-[999px] absolute top-[18px] left-[18px] z-[2] before:content-[''] before:w-[5px] before:h-[5px] before:rounded-[999px] before:bg-white">
            À la une
          </span>
        )}
        <CardIllustration category={article.category} isFeaturedMain={isFeaturedMain} />
      </div>

      {/* .mk-card-body */}
      <div
        className={[
          'flex flex-col flex-1 gap-[14px]',
          isFeaturedMain ? 'px-[30px] pt-7 pb-[30px] gap-4' : 'px-[22px] pt-[22px] pb-6',
        ].join(' ')}
      >
        {/* .mk-card-meta */}
        <div className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-muted)]">
          <span className="w-1.5 h-1.5 rounded-[999px] bg-[var(--mk-text)]" />
          {article.category}
          <span className="text-[var(--mk-border)]">·</span>
          {new Date(article.date).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </div>

        {/* .mk-card-title */}
        <h2
          className={[
            'font-[family-name:var(--mk-font-display)] font-bold leading-[1.18] tracking-[-0.025em] text-[var(--mk-text)]',
            isFeaturedMain ? 'text-[32px] leading-[1.1] max-w-[620px]' : 'text-[22px]',
          ].join(' ')}
        >
          {article.title}
        </h2>

        {showExcerpt && (
          <p
            className={[
              'text-[var(--mk-text-muted)] m-0 leading-[1.55]',
              isFeaturedMain ? 'text-base max-w-[580px]' : 'text-[14.5px]',
            ].join(' ')}
          >
            {article.excerpt}
          </p>
        )}

        {/* .mk-card-foot */}
        <div className="mt-auto pt-1 flex items-center gap-[10px] text-[13px] text-[var(--mk-text-muted)]">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--mk-text-soft)] ml-auto">
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
      className="w-[13px] h-[13px]"
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

function CardIllustration({
  category,
  isFeaturedMain,
}: {
  category: string
  isFeaturedMain?: boolean
}) {
  // Sizing: featured-main shows larger illustration
  const sizeClass = isFeaturedMain ? 'w-[42%] h-[78%]' : 'w-[65%] h-[65%]'
  const c = category.toLowerCase()
  const commonProps = {
    className: `${sizeClass} text-[var(--mk-text)] block max-w-full`,
    viewBox: '0 0 200 140' as const,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (c.includes('whatsapp')) {
    return (
      <svg {...commonProps}>
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
      <svg {...commonProps}>
        <rect x="30" y="22" width="140" height="96" rx="16" fill="#fff" />
        <path d="M50 50 h100 M50 68 h80 M50 86 h60" />
        <circle cx="156" cy="36" r="10" fill="#E1306C" stroke="#E1306C" />
      </svg>
    )
  }
  if (c.includes('tiktok')) {
    return (
      <svg {...commonProps}>
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
      <svg {...commonProps}>
        <circle cx="80" cy="70" r="32" fill="#F7931A" stroke="#F7931A" />
        <circle cx="130" cy="70" r="32" fill="#FFCC00" stroke="#111" />
      </svg>
    )
  }
  if (c.includes('facebook')) {
    return (
      <svg {...commonProps}>
        <rect x="30" y="22" width="140" height="96" rx="14" fill="#fff" />
        <circle cx="156" cy="36" r="10" fill="#1877F2" stroke="#1877F2" />
        <path d="M50 60 h90 M50 78 h70 M50 96 h50" />
      </svg>
    )
  }
  if (c.includes('ia') || c.includes('agent') || c.includes('automatisation')) {
    return (
      <svg {...commonProps}>
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
    <svg {...commonProps}>
      <rect x="22" y="22" width="120" height="84" rx="20" fill="#fff" />
      <path d="M40 50 h80 M40 66 h60 M40 82 h44" />
      <path d="M58 106 l-10 18 22 -10 z" fill="#fff" />
      <circle cx="158" cy="38" r="26" fill="currentColor" />
    </svg>
  )
}

// Static list of category filters with brand color codes (matches .mk-cat-pill.<code>)
const CATEGORIES: { label: string; code: string }[] = [
  { label: 'WhatsApp Business', code: 'wa' },
  { label: 'Instagram', code: 'ig' },
  { label: 'TikTok', code: 'tt' },
  { label: 'Facebook', code: 'fb' },
  { label: 'Mobile Money', code: 'mm' },
  { label: 'Automatisation', code: 'ai' },
  { label: 'IA', code: 'ai' },
  { label: 'Ventes', code: 'pd' },
  { label: 'Service Client', code: 'cs' },
  { label: 'Fidélisation', code: 'pd' },
  { label: 'Étude de cas', code: 'cs' },
]

// Swatch colors per category code
const SWATCH_COLORS: Record<string, string> = {
  wa: 'var(--color-brand-whatsapp)',
  ig: 'var(--color-brand-instagram)',
  fb: 'var(--color-brand-facebook)',
  tt: 'var(--color-brand-tiktok)',
  mm: '#f7931a',
  cs: '#6ba9d4',
  ai: '#8b5cf6',
  pd: '#98c97e',
}

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

      {/* .mk-blog-header */}
      <section className="py-16 pb-10 relative border-b border-[var(--mk-border)] max-[720px]:pt-12 max-[720px]:pb-8">
        {/* .mk-blog-header-inner */}
        <div
          className={`${MK_CONTAINER} grid [grid-template-columns:1.4fr_1fr] gap-[60px] items-end max-[1024px]:[grid-template-columns:1fr] max-[1024px]:gap-8`}
        >
          <div>
            {/* .mk-eyebrow-tag */}
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase text-[var(--mk-text-muted)] mb-[18px]">
              <span className="w-1.5 h-1.5 rounded-[999px] bg-[var(--mk-text)]" />
              BEDONES RESSOURCES
            </span>
            <h1 className="text-[clamp(40px,5.4vw,68px)] tracking-[-0.04em] leading-[1] m-0 mb-[18px] max-w-[640px] font-[family-name:var(--mk-font-display)] font-bold">
              Vendre, automatiser et grandir avec l&apos;IA.
            </h1>
            <p className="text-[17px] text-[var(--mk-text-muted)] max-w-[460px] m-0">
              Guides, études de cas et coulisses produit pour les entrepreneurs qui font tourner
              leur business sur WhatsApp, Instagram et TikTok.
            </p>
          </div>

          {/* .mk-search-card */}
          <div className="bg-white border border-[var(--mk-border)] rounded-2xl p-[22px] [box-shadow:var(--mk-shadow-soft)]">
            <label
              htmlFor="q"
              className="block text-xs font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)] mb-[10px]"
            >
              Trouver un article
            </label>
            {/* .mk-search-bar */}
            <div className="flex items-center gap-2 bg-[var(--mk-surface-tinted)] rounded-xl px-[14px] h-12 transition-[background,box-shadow] duration-150 focus-within:bg-white focus-within:[box-shadow:0_0_0_2px_var(--mk-text)]">
              <svg
                className="w-[18px] h-[18px] text-[var(--mk-text-soft)] flex-shrink-0"
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
                className="flex-1 min-w-0 h-full border-0 outline-none bg-transparent text-[15px] text-[var(--mk-text)] placeholder:text-[var(--mk-text-soft)]"
              />
            </div>
            {/* .mk-search-meta */}
            <div className="mt-[14px] text-[13px] text-[var(--mk-text-soft)] flex justify-between flex-wrap gap-2">
              <span>
                <strong className="text-[var(--mk-text)] font-semibold">
                  {blogArticles.length} articles
                </strong>{' '}
                publiés
              </span>
              <span>Mis à jour régulièrement</span>
            </div>
          </div>
        </div>
      </section>

      {/* .mk-cat-rail */}
      <nav
        className="py-[22px] border-b border-[var(--mk-border)] bg-[var(--mk-bg)] sticky top-[72px] z-40 backdrop-blur-[8px] max-[720px]:top-16 max-[720px]:py-4"
        aria-label="Catégories"
      >
        <div
          className={`${MK_CONTAINER} flex items-center gap-[10px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          <button
            className={[
              'flex-shrink-0 inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[999px] border text-[14px] font-medium text-[var(--mk-text)] transition-all duration-150 cursor-pointer',
              activeCat === 'all'
                ? 'bg-[var(--mk-text)] text-white border-[var(--mk-text)]'
                : 'bg-white border-[var(--mk-border)] hover:bg-[var(--mk-surface-tinted)] hover:border-[var(--mk-text)]',
            ].join(' ')}
            onClick={() => setActiveCat('all')}
          >
            <span
              className="w-2 h-2 rounded-[999px]"
              style={{ background: activeCat === 'all' ? '#fff' : 'var(--mk-text)' }}
            />
            Tous
          </button>
          {CATEGORIES.map(({ label, code }) => {
            const isActive = activeCat === label
            return (
              <button
                key={label}
                className={[
                  'flex-shrink-0 inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[999px] border text-[14px] font-medium text-[var(--mk-text)] transition-all duration-150 cursor-pointer',
                  isActive
                    ? 'bg-[var(--mk-text)] text-white border-[var(--mk-text)]'
                    : 'bg-white border-[var(--mk-border)] hover:bg-[var(--mk-surface-tinted)] hover:border-[var(--mk-text)]',
                ].join(' ')}
                onClick={() => setActiveCat(label)}
              >
                <span
                  className="w-2 h-2 rounded-[999px]"
                  style={{
                    background: isActive ? '#fff' : SWATCH_COLORS[code] || 'var(--mk-text)',
                    border: code === 'tt' && !isActive ? '1.5px solid #fff' : undefined,
                    boxShadow:
                      code === 'tt' && !isActive ? '0 0 0 1px var(--mk-border)' : undefined,
                  }}
                />
                {label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* .mk-featured */}
      {featured && (
        <section className="py-12 pb-8">
          {/* .mk-featured-grid */}
          <div
            className={`${MK_CONTAINER} grid [grid-template-columns:1.6fr_1fr] gap-8 items-stretch max-[1024px]:[grid-template-columns:1fr]`}
          >
            <ArticleCard article={featured} variant="featured-main" />
            {sideFeatured.length > 0 && (
              <div className="grid [grid-template-rows:1fr_1fr] gap-6 max-[1024px]:[grid-template-rows:auto] max-[1024px]:[grid-template-columns:1fr_1fr] max-[720px]:[grid-template-columns:1fr]">
                {sideFeatured.map((a) => (
                  <Link
                    key={a.slug}
                    to="/blog/$slug"
                    params={{ slug: a.slug }}
                    className="bg-white border border-[var(--mk-border)] rounded-[20px] overflow-hidden flex flex-row items-stretch transition-[border-color] duration-150 hover:border-[rgba(17,27,33,0.4)] max-[720px]:flex-col"
                  >
                    {/* cover — fixed width on desktop, full width on mobile */}
                    <div
                      className={`relative overflow-hidden flex items-center justify-center w-[200px] flex-shrink-0 aspect-auto max-[720px]:w-full max-[720px]:aspect-[16/9] ${a.coverColor}`}
                    >
                      <CardIllustration category={a.category} />
                    </div>
                    <div className="flex flex-col flex-1 gap-[10px] px-[22px] pt-5 pb-[22px]">
                      <div className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-muted)]">
                        <span className="w-1.5 h-1.5 rounded-[999px] bg-[var(--mk-text)]" />
                        {a.category}
                        <span className="text-[var(--mk-border)]">·</span>
                        {new Date(a.date).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <h2 className="font-[family-name:var(--mk-font-display)] font-bold text-[17px] leading-[1.22] tracking-[-0.025em] text-[var(--mk-text)]">
                        {a.title}
                      </h2>
                      <p className="text-[13.5px] text-[var(--mk-text-muted)] m-0 leading-[1.5] line-clamp-2">
                        {a.excerpt}
                      </p>
                      <div className="mt-auto pt-1 flex items-center gap-[10px] text-[13px] text-[var(--mk-text-muted)]">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--mk-text-soft)] ml-auto">
                          <ClockIcon />
                          {a.readTime}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* .mk-grid-section */}
      {(gridArticles.length > 0 || filtered.length === 0) && (
        <section className="py-8 pb-[60px]">
          <div className={MK_CONTAINER}>
            {gridArticles.length > 0 && (
              <div className="flex items-end justify-between gap-5 mb-7">
                <h2 className="text-[clamp(24px,2.6vw,32px)] tracking-[-0.025em] font-[family-name:var(--mk-font-display)] font-bold m-0">
                  Tous les articles
                </h2>
                <div className="text-[13px] text-[var(--mk-text-soft)]">
                  {activeCat === 'all' ? 'Tous' : activeCat} · {filtered.length} résultat
                  {filtered.length > 1 ? 's' : ''}
                </div>
              </div>
            )}
            {gridArticles.length > 0 ? (
              <div className="grid [grid-template-columns:repeat(3,1fr)] gap-y-8 gap-x-7 max-[1024px]:[grid-template-columns:repeat(2,1fr)] max-[720px]:[grid-template-columns:1fr]">
                {gridArticles.map((a) => (
                  <ArticleCard key={a.slug} article={a} variant="grid" />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '60px 0',
                  textAlign: 'center',
                  color: 'var(--mk-text-soft)',
                }}
              >
                Aucun article ne correspond à votre recherche.
              </div>
            )}
          </div>
        </section>
      )}

      {/* .mk-feature-band */}
      <section className="bg-[var(--mk-surface-tinted)] border-t border-b border-[var(--mk-border)] py-20">
        {/* .mk-feature-band-grid */}
        <div
          className={`${MK_CONTAINER} grid [grid-template-columns:1fr_1fr] gap-14 items-start max-[1024px]:[grid-template-columns:1fr] max-[1024px]:gap-10`}
        >
          {/* .mk-topics */}
          <div>
            <h2 className="text-[clamp(26px,3vw,36px)] mb-[10px] font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em]">
              Explorez par thème
            </h2>
            <p className="text-[var(--mk-text-muted)] m-0 mb-6 text-[15.5px]">
              {blogArticles.length} articles répartis sur les sujets qui font tourner les business
              en ligne.
            </p>
            {/* .mk-topics-list */}
            <div className="flex flex-wrap gap-2">
              {counts.map(({ category, count }) => (
                <button
                  key={category}
                  className="inline-flex items-center gap-2 bg-white border border-[var(--mk-border)] rounded-[999px] px-[14px] py-2 text-[13.5px] font-medium text-[var(--mk-text)] transition-all duration-150 hover:border-[var(--mk-text)] hover:bg-[var(--mk-bg)]"
                  onClick={() => setActiveCat(category)}
                >
                  {category}{' '}
                  <span className="text-[var(--mk-text-soft)] text-xs font-normal">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* .mk-newsletter */}
          <div className="bg-[var(--mk-text)] text-white rounded-[24px] px-8 pt-9 pb-8 relative overflow-hidden">
            {/* ::before grid overlay */}
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
                WebkitMaskImage:
                  'radial-gradient(ellipse 80% 80% at 80% 0%, #000 30%, transparent 80%)',
                maskImage: 'radial-gradient(ellipse 80% 80% at 80% 0%, #000 30%, transparent 80%)',
              }}
              aria-hidden="true"
            />
            {/* .mk-newsletter-eyebrow */}
            <span className="relative inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.16em] uppercase text-[rgba(255,255,255,0.75)] mb-[14px] before:content-[''] before:w-1.5 before:h-1.5 before:rounded-[999px] before:bg-[var(--color-brand-whatsapp)]">
              Newsletter Bedones
            </span>
            <h3 className="relative text-[clamp(24px,2.6vw,30px)] m-0 mb-[10px] text-white tracking-[-0.025em] font-[family-name:var(--mk-font-display)] font-bold">
              Un article, chaque mardi, dans votre boîte.
            </h3>
            <p className="relative text-[rgba(255,255,255,0.7)] text-[14.5px] m-0 mb-[22px] max-w-[420px]">
              Le meilleur de nos guides, études et nouveautés produit — résumés en 3 minutes de
              lecture. Pas de spam, jamais.
            </p>
            {/* .mk-newsletter-form */}
            <form
              className="relative flex gap-2 bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.16)] rounded-[999px] p-[5px]"
              onSubmit={(e) => {
                e.preventDefault()
                const btn = e.currentTarget.querySelector('button')
                if (btn) btn.textContent = 'Inscrit ✓'
              }}
            >
              <input
                type="email"
                placeholder="vous@entreprise.com"
                required
                className="flex-1 min-w-0 border-0 outline-none bg-transparent h-11 px-4 text-white text-[14.5px] font-[family-name:var(--mk-font-body)] placeholder:text-[rgba(255,255,255,0.5)]"
              />
              <button
                type="submit"
                className="h-11 px-[18px] bg-white text-[var(--mk-text)] rounded-[999px] text-[14px] font-semibold"
              >
                S&apos;abonner
              </button>
            </form>
            <div className="relative mt-[14px] text-xs text-[rgba(255,255,255,0.5)]">
              2 100+ entrepreneurs nous lisent déjà.
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

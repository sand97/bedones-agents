import { createFileRoute } from '@tanstack/react-router'
import { Typography, Tag, Button } from 'antd'
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import { getArticleBySlug, blogArticles } from '@app/data/blog'

const { Title, Text } = Typography

export const Route = createFileRoute('/blog/$slug')({
  head: ({ params }) => {
    const article = getArticleBySlug(params.slug)
    if (!article) return {}
    const url = `https://app.bedones.com/blog/${article.slug}`
    const imageUrl = `https://app.bedones.com/blog/${article.slug}.svg`
    return {
      meta: [
        { title: `${article.title} — Blog Bedones` },
        { name: 'description', content: article.excerpt },
        { property: 'og:title', content: article.title },
        { property: 'og:description', content: article.excerpt },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        { property: 'og:image', content: imageUrl },
        { property: 'article:published_time', content: article.date },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: article.title },
        { name: 'twitter:description', content: article.excerpt },
        { name: 'twitter:image', content: imageUrl },
        { name: 'robots', content: 'index, follow' },
      ],
    }
  },
  component: BlogArticlePage,
})

/** Minimal MD→JSX: handles ##, -, **bold**, and paragraphs */
function renderMarkdown(md: string) {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let buffer: string[] = []
  let listBuffer: string[] = []
  let key = 0

  const flushParagraph = () => {
    if (buffer.length === 0) return
    const text = buffer.join(' ')
    buffer = []
    if (!text.trim()) return
    elements.push(
      <p key={key++} className="mb-4 leading-relaxed text-text-secondary">
        {renderInline(text)}
      </p>,
    )
  }

  const flushList = () => {
    if (listBuffer.length === 0) return
    elements.push(
      <ul
        key={key++}
        className="mb-4 flex flex-col gap-1 pl-5 text-text-secondary"
        style={{ listStyleType: 'disc' }}
      >
        {listBuffer.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flushList()
      flushParagraph()
      elements.push(
        <Title key={key++} level={5} className="mt-8 first:mt-0" style={{ marginBottom: 8 }}>
          {line.slice(3)}
        </Title>,
      )
    } else if (line.startsWith('- ')) {
      flushParagraph()
      listBuffer.push(line.slice(2))
    } else if (/^\d+\.\s/.test(line)) {
      flushParagraph()
      listBuffer.push(line.replace(/^\d+\.\s/, ''))
    } else if (line.trim() === '') {
      flushList()
      flushParagraph()
    } else {
      if (listBuffer.length > 0) {
        flushList()
      }
      buffer.push(line)
    }
  }
  flushList()
  flushParagraph()

  return elements
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-text-primary">
        {match[1]}
      </strong>,
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

function BlogArticlePage() {
  const { slug } = Route.useParams()
  const article = getArticleBySlug(slug)

  if (!article) {
    return (
      <div className="blog-public">
        <div className="blog-public__container">
          <a href="/blog" className="legal-public__back">
            <ArrowLeft size={16} />
            <span>Retour au blog</span>
          </a>
          <Title level={3}>Article introuvable</Title>
          <Text type="secondary">Cet article n&apos;existe pas ou a été supprimé.</Text>
        </div>
      </div>
    )
  }

  // Structured data for SEO (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    image: `https://app.bedones.com/blog/${article.slug}.svg`,
    datePublished: article.date,
    author: { '@type': 'Organization', name: 'Bedones', url: 'https://bedones.com' },
    publisher: {
      '@type': 'Organization',
      name: 'Bedones',
      url: 'https://bedones.com',
    },
    mainEntityOfPage: `https://app.bedones.com/blog/${article.slug}`,
  }

  // Suggested articles (exclude current, take 3)
  const suggested = blogArticles.filter((a) => a.slug !== slug).slice(0, 3)

  return (
    <div className="blog-public">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="blog-public__container">
        <a href="/blog" className="legal-public__back">
          <ArrowLeft size={16} />
          <span>Retour au blog</span>
        </a>

        <div className="blog-public__header">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-bold text-white">B</span>
            </div>
            <span className="text-lg font-semibold">Bedones</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Tag color="default">{article.category}</Tag>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock size={12} />
              {article.readTime}
            </span>
            <Text type="secondary" className="text-xs">
              {new Date(article.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </div>
          <Title level={2} style={{ margin: 0, marginTop: 12 }}>
            {article.title}
          </Title>
        </div>

        {/* Article illustration */}
        <div className="blog-article__image">
          <img src={article.image} alt={article.title} width={800} height={450} loading="eager" />
        </div>

        <article className="legal-public__content">{renderMarkdown(article.content)}</article>

        <div className="blog-cta-footer">
          <Title level={5} style={{ margin: 0, marginBottom: 8 }}>
            Prêt(e) à gagner du temps ?
          </Title>
          <Text type="secondary" className="mb-4 block text-sm">
            Créez votre compte Bedones et laissez-nous vous accompagner gratuitement.
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRight size={16} />}
            iconPosition="end"
            href="/"
          >
            Commencer maintenant
          </Button>
        </div>

        {/* Suggested articles */}
        {suggested.length > 0 && (
          <section className="mt-10">
            <Title level={5} style={{ marginBottom: 16 }}>
              À lire aussi
            </Title>
            <div className="blog-grid">
              {suggested.map((a) => (
                <a key={a.slug} href={`/blog/${a.slug}`} className="blog-card">
                  <div className="blog-card__image">
                    <img src={a.image} alt={a.title} loading="lazy" width={800} height={450} />
                  </div>
                  <div className="blog-card__body">
                    <Tag color="default" className="blog-card__tag mb-2">
                      {a.category}
                    </Tag>
                    <Title level={5} style={{ margin: 0, fontSize: 13 }}>
                      {a.title}
                    </Title>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { Typography, Tag } from 'antd'
import { ArrowLeft, ArrowRight, Clock, BookOpen } from 'lucide-react'
import { blogArticles } from '@app/data/blog'

const { Title, Text } = Typography

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: [
      { title: 'Blog Bedones — Conseils automatisation business en Afrique' },
      {
        name: 'description',
        content:
          'Conseils pratiques pour automatiser vos ventes sur WhatsApp, Instagram et Facebook. Ressources gratuites pour entrepreneurs africains.',
      },
      { property: 'og:title', content: 'Blog Bedones — Automatisez votre business en Afrique' },
      {
        property: 'og:description',
        content:
          'Conseils pratiques pour automatiser vos ventes sur WhatsApp, Instagram et Facebook.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://app.bedones.com/blog' },
      {
        property: 'og:image',
        content: 'https://app.bedones.com/blog/pourquoi-automatiser-whatsapp.svg',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'robots', content: 'index, follow' },
    ],
  }),
  component: BlogListPage,
})

function BlogListPage() {
  return (
    <div className="blog-public">
      <div className="blog-public__container blog-public__container--wide">
        <a href="/" className="legal-public__back">
          <ArrowLeft size={16} />
          <span>Retour</span>
        </a>

        <div className="blog-public__header">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-bold text-white">B</span>
            </div>
            <span className="text-lg font-semibold">Bedones</span>
          </div>
          <Title level={2} style={{ margin: 0, marginTop: 16 }}>
            Blog
          </Title>
          <Text type="secondary">
            Conseils pratiques pour automatiser et développer votre business en ligne en Afrique
          </Text>
        </div>

        <div className="blog-grid">
          {blogArticles.map((article) => (
            <a key={article.slug} href={`/blog/${article.slug}`} className="blog-card">
              <div className="blog-card__image">
                <img
                  src={article.image}
                  alt={article.title}
                  loading="lazy"
                  width={800}
                  height={450}
                />
              </div>
              <div className="blog-card__body">
                <div className="flex items-center gap-3 mb-2">
                  <Tag color="default" className="blog-card__tag">
                    {article.category}
                  </Tag>
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Clock size={12} />
                    {article.readTime}
                  </span>
                </div>
                <Title level={5} style={{ margin: 0, marginBottom: 6, fontSize: 14 }}>
                  {article.title}
                </Title>
                <Text type="secondary" className="text-xs leading-relaxed">
                  {article.excerpt}
                </Text>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-text-primary">
                  <BookOpen size={12} />
                  <span>Lire</span>
                  <ArrowRight size={12} />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

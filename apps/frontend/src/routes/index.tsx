import { createFileRoute } from '@tanstack/react-router'
import { MarketingNav } from '@app/components/marketing/marketing-nav'
import { MarketingFooter } from '@app/components/marketing/marketing-footer'
import { Hero } from '@app/components/marketing/hero'
import { Showcase } from '@app/components/marketing/showcase'
import { Features } from '@app/components/marketing/features'
import { HowItWorks, StatsAndTestimonial, FinalCTA } from '@app/components/marketing/how-stats-cta'
import { useScrollReveal } from '@app/components/marketing/use-scroll-reveal'

const SITE_URL = 'https://moderator.bedones.com'
const TITLE = "Bedones Moderator — L'IA qui répond à vos clients sur WhatsApp, Instagram, TikTok"
const DESCRIPTION =
  "L'assistant IA qui répond à vos clients 24h/24 sur WhatsApp, Instagram, TikTok, Facebook et Messenger. Apprend de votre catalogue, comprend Mobile Money, automatise vos ventes."

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Bedones Moderator',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description: DESCRIPTION,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '127',
  },
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      {
        name: 'keywords',
        content:
          'IA service client, automatisation WhatsApp, agent IA, chatbot WhatsApp Business, Instagram DM, TikTok, Mobile Money, catalogue WhatsApp, vente en ligne',
      },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:image', content: `${SITE_URL}/og-home.jpg` },
      { property: 'og:locale', content: 'fr_FR' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: `${SITE_URL}/og-home.jpg` },
      { name: 'robots', content: 'index, follow' },
    ],
    links: [{ rel: 'canonical', href: SITE_URL }],
  }),
  component: HomePage,
})

function HomePage() {
  useScrollReveal()
  return (
    <div className="mk">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <MarketingNav current="home" />
      <Hero />
      <Showcase />
      <Features />
      <HowItWorks />
      <StatsAndTestimonial />
      <FinalCTA />
      <MarketingFooter />
    </div>
  )
}

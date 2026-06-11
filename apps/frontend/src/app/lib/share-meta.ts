/**
 * Construit les meta tags Open Graph / Twitter Card d'une page partageable.
 *
 * Les pages du dashboard sont rendues côté client et protégées par auth, mais
 * TanStack Start rend quand même le `<head>` côté serveur. Les crawlers sociaux
 * (WhatsApp, Messenger, Facebook, Slack, LinkedIn, Twitter/X) n'exécutent pas le
 * JS et n'atteignent donc jamais la redirection vers le login : ce sont ces
 * balises SSR qu'ils lisent pour fabriquer l'aperçu du lien.
 *
 * À utiliser dans l'option `head` d'une route :
 *   head: () => buildShareMeta({ title, description, image: '/og/catalog.png' })
 */

const SITE_URL = 'https://moderator.bedones.com'

export interface ShareMetaInput {
  /** Titre de l'aperçu — ex. « Voir le catalogue ». */
  title: string
  /** Description de l'aperçu — ex. « Cliquez pour voir les produits de ce catalogue ». */
  description: string
  /** Chemin (ou URL absolue) d'une image raster 1200×630 — ex. « /og/catalog.png ». */
  image: string
  /** Texte alternatif de l'image. Par défaut : le titre. */
  imageAlt?: string
}

export function buildShareMeta({ title, description, image, imageAlt }: ShareMetaInput) {
  const imageUrl = image.startsWith('http') ? image : `${SITE_URL}${image}`
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      // Pages privées : aperçus riches pour les crawlers sociaux, mais hors
      // index des moteurs de recherche (le noindex n'empêche pas le scraping OG).
      { name: 'robots', content: 'noindex, nofollow' },
      // Open Graph — Facebook, WhatsApp, Messenger, LinkedIn, Slack…
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Bedones' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: imageUrl },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: imageAlt ?? title },
      { property: 'og:locale', content: 'fr_FR' },
      // Twitter / X
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: imageAlt ?? title },
    ],
  }
}

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr.json'
import en from './locales/en.json'

export type AppLocale = 'fr' | 'en'

const STORAGE_KEY = 'bedones-locale'

const isClient = typeof window !== 'undefined'

function getInitialLocale(): AppLocale {
  if (!isClient) return 'fr'

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'fr') return stored

  const browserLang = navigator.language?.split('-')[0]
  return browserLang === 'en' ? 'en' : 'fr'
}

export function persistLocale(locale: AppLocale) {
  if (isClient) localStorage.setItem(STORAGE_KEY, locale)
}

/**
 * Best-effort sync of the locale to the authenticated user. Silently swallows
 * 401s (caller may not be logged in) and network errors. Backend reads
 * `User.locale` to localise outbound WhatsApp templates etc.
 */
export function persistLocaleToServer(locale: AppLocale): void {
  if (!isClient) return
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.test'
  fetch(`${apiUrl}/auth/me/locale`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  }).catch(() => {})
}

export function getStoredLocale(): AppLocale {
  if (!isClient) return 'fr'

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'fr') return stored
  const browserLang = navigator.language?.split('-')[0]
  return browserLang === 'en' ? 'en' : 'fr'
}

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: getInitialLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

/**
 * Lazy-load the `categories` namespace (Google Product Categories).
 * Translations are split into their own chunk to keep the main bundle lean.
 * Safe to call multiple times — the promise is cached and resolves immediately
 * if the bundle is already present.
 */
let categoriesPromise: Promise<void> | null = null
export function loadCategoriesNamespace(): Promise<void> {
  if (i18n.hasResourceBundle('fr', 'categories') && i18n.hasResourceBundle('en', 'categories')) {
    return Promise.resolve()
  }
  if (categoriesPromise) return categoriesPromise
  categoriesPromise = Promise.all([
    import('./locales/categories.fr.json'),
    import('./locales/categories.en.json'),
  ]).then(([frCat, enCat]) => {
    i18n.addResourceBundle('fr', 'categories', frCat.default, true, true)
    i18n.addResourceBundle('en', 'categories', enCat.default, true, true)
  })
  return categoriesPromise
}

export default i18n

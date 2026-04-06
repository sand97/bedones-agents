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

export default i18n

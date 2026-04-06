import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '@app/i18n'
import { persistLocale } from '@app/i18n'

interface LocaleContextType {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  toggleLocale: () => void
}

const LocaleContext = createContext<LocaleContextType | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const locale = (i18n.language as AppLocale) || 'fr'

  const setLocale = useCallback(
    (newLocale: AppLocale) => {
      i18n.changeLanguage(newLocale)
      persistLocale(newLocale)
      if (typeof document !== 'undefined') document.documentElement.lang = newLocale
    },
    [i18n],
  )

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'fr' ? 'en' : 'fr')
  }, [locale, setLocale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}

import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import 'dayjs/locale/en'
import { getStoredLocale } from '@app/i18n'

if (typeof window !== 'undefined') {
  dayjs.locale(getStoredLocale())
}

/** Call this when the user changes locale to sync dayjs */
export function syncDayjsLocale(locale: 'fr' | 'en') {
  dayjs.locale(locale)
}

export function formatPrice(price: number, currency: string) {
  const locale = getStoredLocale()
  return `${price.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} ${currency}`
}

export function formatDate(date: string) {
  const d = dayjs(date)
  const month = d.format('MMMM')
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d.format('D')} ${capitalMonth} ${d.format('YYYY')}`
}

export function formatDateTime(date: string) {
  const d = dayjs(date)
  const locale = getStoredLocale()
  const month = d.format('MMMM')
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
  const separator = locale === 'fr' ? 'à' : 'at'
  return `${d.format('D')} ${capitalMonth} ${d.format('YYYY')} ${separator} ${d.format('HH:mm')}`
}

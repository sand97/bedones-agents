import dayjs from 'dayjs'
import 'dayjs/locale/fr'

dayjs.locale('fr')

export function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export function formatDate(date: string) {
  const d = dayjs(date)
  const month = d.format('MMMM')
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d.format('D')} ${capitalMonth} ${d.format('YYYY')}`
}

export function formatDateTime(date: string) {
  const d = dayjs(date)
  const month = d.format('MMMM')
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d.format('D')} ${capitalMonth} ${d.format('YYYY')} à ${d.format('HH:mm')}`
}

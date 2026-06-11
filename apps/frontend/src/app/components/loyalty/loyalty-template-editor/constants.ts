import type { ButtonType } from '../loyalty-template-preview'

export const MAX_BUTTONS = 10
export const MAX_BUTTON_TEXT = 25
export const MAX_HEADER_TEXT = 60
export const MAX_FOOTER_TEXT = 60
const PRODUCT_TEMPLATE_BUTTON_TYPES: ButtonType[] = ['CATALOG', 'MPM']

export interface ButtonDraft {
  type: ButtonType
  text: string
  url?: string
  phoneNumber?: string
}

export function isProductTemplateButton(type: ButtonType) {
  return PRODUCT_TEMPLATE_BUTTON_TYPES.includes(type)
}

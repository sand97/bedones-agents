import { useTranslation } from 'react-i18next'
import { Reply, ExternalLink, Phone, ShoppingBag } from 'lucide-react'
import { interpolateExamples } from './loyalty-template-variables'

export type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO'

export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG' | 'MPM'

export interface PreviewButton {
  type: ButtonType
  text: string
  /** URL when type === 'URL' */
  url?: string
  /** Phone number when type === 'PHONE_NUMBER' */
  phoneNumber?: string
}

interface Props {
  headerType: HeaderType
  headerText?: string
  headerMediaUrl?: string
  body: string
  footerText?: string
  buttons: PreviewButton[]
}

export function getTemplateButtonText(type: ButtonType, text?: string) {
  if (type === 'CATALOG') return 'View catalog'
  if (type === 'MPM') return 'View items'
  return text ?? ''
}

/**
 * Renders a WhatsApp-style message bubble showing what a real customer
 * would receive. Variable tokens in the body are replaced with their
 * example value via `interpolateExamples`.
 */
export function LoyaltyTemplatePreview({
  headerType,
  headerText,
  headerMediaUrl,
  body,
  footerText,
  buttons,
}: Props) {
  const { t } = useTranslation()
  const renderedBody = interpolateExamples(body || '')
  const renderedHeader = headerType === 'TEXT' ? interpolateExamples(headerText || '') : headerText

  return (
    <div
      className="flex w-full min-h-[200px] justify-center rounded-[12px] p-[16px_12px]"
      style={{
        background:
          "#ece5dd url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='1' fill='%23d4cdc4'/></svg>\")",
      }}
    >
      <div className="flex w-full max-w-[280px] flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
        {headerType === 'IMAGE' && headerMediaUrl && (
          <img src={headerMediaUrl} alt="header" className="h-[160px] w-full bg-[#f0f0f0] object-cover" />
        )}
        {headerType === 'VIDEO' && headerMediaUrl && (
          <video
            src={headerMediaUrl}
            className="h-[160px] w-full bg-[#f0f0f0] object-cover"
            controls
            preload="metadata"
          />
        )}
        {headerType === 'IMAGE' && !headerMediaUrl && (
          <div className="flex h-[160px] w-full items-center justify-center bg-[#f0f0f0] text-xs text-text-muted">
            {t('chat.image')}
          </div>
        )}
        {headerType === 'VIDEO' && !headerMediaUrl && (
          <div className="flex h-[160px] w-full items-center justify-center bg-[#f0f0f0] text-xs text-text-muted">
            {t('chat.video')}
          </div>
        )}

        <div className="flex flex-col gap-[4px] p-[8px_10px_6px]">
          {headerType === 'TEXT' && renderedHeader && (
            <div className="text-[0.875rem] font-semibold text-text-primary">{renderedHeader}</div>
          )}
          {renderedBody && <div className="break-words whitespace-pre-wrap text-[0.875rem] text-text-primary">{renderedBody}</div>}
          <div className="mt-[2px] flex items-end justify-between gap-[8px]">
            {footerText && <span className="min-w-0 flex-1 break-words text-[0.75rem] text-text-muted">{footerText}</span>}
            <span className="shrink-0 self-end text-[0.625rem] text-text-muted">12:18</span>
          </div>
        </div>

        {buttons.length > 0 && (
          <div className="flex flex-col border-t border-[#e5e5e5]">
            {buttons.map((btn, i) => {
              const Icon =
                btn.type === 'URL'
                  ? ExternalLink
                  : btn.type === 'PHONE_NUMBER'
                    ? Phone
                    : btn.type === 'CATALOG' || btn.type === 'MPM'
                      ? ShoppingBag
                      : Reply
              return (
                <div
                  key={i}
                  className={`flex items-center justify-center gap-[6px] p-[8px] text-[0.8125rem] font-medium text-[#00a884]${i > 0 ? ' border-t border-[#f0f0f0]' : ''}`}
                >
                  <Icon size={14} />
                  <span>{getTemplateButtonText(btn.type, btn.text) || '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

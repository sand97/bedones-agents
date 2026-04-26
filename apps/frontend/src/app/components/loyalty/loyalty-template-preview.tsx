import { Reply, ExternalLink, Phone } from 'lucide-react'
import { interpolateExamples } from './loyalty-template-variables'

export type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO'

export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'

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
  const renderedBody = interpolateExamples(body || '')
  const renderedHeader = headerType === 'TEXT' ? interpolateExamples(headerText || '') : headerText

  return (
    <div className="loyalty-preview">
      <div className="loyalty-preview__bubble">
        {headerType === 'IMAGE' && headerMediaUrl && (
          <img src={headerMediaUrl} alt="header" className="loyalty-preview__media" />
        )}
        {headerType === 'VIDEO' && headerMediaUrl && (
          <video
            src={headerMediaUrl}
            className="loyalty-preview__media"
            controls
            preload="metadata"
          />
        )}
        {headerType === 'IMAGE' && !headerMediaUrl && (
          <div className="loyalty-preview__media loyalty-preview__media--placeholder">Image</div>
        )}
        {headerType === 'VIDEO' && !headerMediaUrl && (
          <div className="loyalty-preview__media loyalty-preview__media--placeholder">Vidéo</div>
        )}

        <div className="loyalty-preview__content">
          {headerType === 'TEXT' && renderedHeader && (
            <div className="loyalty-preview__header-text">{renderedHeader}</div>
          )}
          {renderedBody && <div className="loyalty-preview__body">{renderedBody}</div>}
          {footerText && <div className="loyalty-preview__footer">{footerText}</div>}
          <div className="loyalty-preview__time">12:18</div>
        </div>

        {buttons.length > 0 && (
          <div className="loyalty-preview__buttons">
            {buttons.map((btn, i) => {
              const Icon =
                btn.type === 'URL' ? ExternalLink : btn.type === 'PHONE_NUMBER' ? Phone : Reply
              return (
                <div key={i} className="loyalty-preview__button">
                  <Icon size={14} />
                  <span>{btn.text || '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

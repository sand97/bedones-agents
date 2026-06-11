import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CommerceGlyph, Icon, WhatsAppGlyph } from './icons'
import { NS } from './shared'

/* ──────────────────────────── Illustrations ──────────────────────────── */

function FlowNode({
  kind,
  label,
  sub,
  dim,
}: {
  kind: 'wa' | 'cm'
  label: string
  sub: string
  dim?: boolean
}) {
  return (
    <div className={'mc-node' + (dim ? ' is-dim' : '')}>
      <div className="mc-node-icon">
        {kind === 'wa' ? <WhatsAppGlyph size={26} /> : <CommerceGlyph size={26} />}
      </div>
      <div className="mc-node-label">{label}</div>
      <div className="mc-node-sub">{sub}</div>
    </div>
  )
}

export function FlowDiagram() {
  const { t } = useTranslation()
  return (
    <div className="mc-flow">
      <FlowNode kind="wa" label={t(NS + 'wa_business')} sub={t(NS + 'wa_current')} dim />
      <div className="mc-flow-arrow">
        <span className="mc-flow-track" />
        <Icon name="arrowRight" size={18} />
      </div>
      <FlowNode kind="cm" label={t(NS + 'commerce_manager')} sub={t(NS + 'meta_official')} />
    </div>
  )
}

export function TransferDiagram({ number, catalog }: { number: string; catalog: string }) {
  const { t } = useTranslation()
  const thumbs = Array.from({ length: 6 })
  return (
    <div className="mc-transfer">
      <div className="mc-tcard">
        <div className="mc-tcard-hd">
          <WhatsAppGlyph size={18} />
          <div className="mc-tcard-hd-tx">
            <div className="mc-tcard-t">{t(NS + 'wa_business')}</div>
            <div className="mc-tcard-num">{number}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb" />
          ))}
        </div>
        <div className="mc-tcard-ft">{t(NS + 'wa_catalog_label')}</div>
      </div>

      <div className="mc-transfer-arrow">
        <span className="mc-transfer-dot" />
        <span className="mc-transfer-dot d2" />
        <Icon name="arrowRight" size={18} />
      </div>

      <div className="mc-tcard is-dest">
        <div className="mc-tcard-hd">
          <CommerceGlyph size={18} />
          <div className="mc-tcard-hd-tx">
            <div className="mc-tcard-t">{t(NS + 'commerce_manager')}</div>
            <div className="mc-tcard-num">{catalog}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb ghost" />
          ))}
        </div>
        <div className="mc-tcard-ft">{t(NS + 'meta_official')}</div>
      </div>
    </div>
  )
}

export function LinkVisual({ state }: { state: 'progress' | 'success' | 'fail' }) {
  return (
    <div className={'mc-linkviz is-' + state}>
      <div className="mc-linkviz-node">
        <WhatsAppGlyph size={24} />
      </div>
      <div className="mc-linkviz-spine">
        <span className="mc-linkviz-pulse" />
        <div className="mc-linkviz-badge">
          {state === 'progress' && <span className="mc-spin" />}
          {state === 'success' && <Icon name="check" size={16} />}
          {state === 'fail' && <Icon name="x" size={16} />}
        </div>
      </div>
      <div className="mc-linkviz-node">
        <CommerceGlyph size={24} />
      </div>
    </div>
  )
}

export function BenefitCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: string
  title: string
  body: string
  tone?: string
}) {
  return (
    <div className="mc-benefit">
      <div className={'mc-benefit-ic' + (tone ? ' mc-tone-' + tone : '')}>
        <Icon name={icon} size={18} />
      </div>
      <div className="mc-benefit-tx">
        <div className="mc-benefit-t">{title}</div>
        <div className="mc-benefit-b">{body}</div>
      </div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mc-note">
      <Icon name="shield" size={15} />
      <span>{children}</span>
    </div>
  )
}

export function RadioCard({
  selected,
  onSelect,
  icon,
  title,
  body,
  children,
  tone,
}: {
  selected: boolean
  onSelect: () => void
  icon: string
  title: string
  body: string
  children?: ReactNode
  tone?: string
}) {
  return (
    <div
      className={'mc-optcard' + (selected ? ' is-selected' : '')}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="mc-optcard-row">
        <span className={'mc-radio' + (selected ? ' is-on' : '')} />
        <div className={'mc-choice-ic' + (tone ? ' mc-tone-' + tone : '')}>
          <Icon name={icon} size={18} />
        </div>
        <div className="mc-choice-tx">
          <div className="mc-choice-t">{title}</div>
          <div className="mc-choice-b">{body}</div>
        </div>
      </div>
      {children && (
        <div className="mc-optcard-extra" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="mc-stepper">
      <div className="sp-seg">
        {Array.from({ length: total }).map((_, i) => {
          const n = i + 1
          return <span key={n} className={n < current ? 'done' : n === current ? 'active' : ''} />
        })}
      </div>
    </div>
  )
}

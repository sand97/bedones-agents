import { Fragment, type ReactNode } from 'react'

/**
 * Render a tiny markdown subset used by agent-written ticket descriptions:
 * `**bold**`, `- ` bullets (with indentation) and line breaks. Dependency-free
 * on purpose — we only need these few constructs, also reused by notifications.
 */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    return bold ? <strong key={i}>{bold[1]}</strong> : <Fragment key={i}>{part}</Fragment>
  })
}

/**
 * Inline variant of {@link MarkdownLite}: renders the same `**bold**` subset
 * but collapses every line break into a single space so the content stays on a
 * single line. Used by truncated previews (table cells, list cards) where the
 * markdown markers should be interpreted but newlines must not break the layout.
 */
export function MarkdownLiteInline({ text, className }: { text: string; className?: string }) {
  const inline = text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  return <span className={className}>{renderInline(inline)}</span>
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        if (line.trim() === '') return <div key={i} className="h-1.5" />
        const leading = line.length - line.trimStart().length
        const body = line.trimStart()
        const indent = Math.floor(leading / 2) * 12
        if (body.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2" style={{ marginLeft: indent }}>
              <span className="select-none text-text-muted">•</span>
              <span className="min-w-0 flex-1">{renderInline(body.slice(2))}</span>
            </div>
          )
        }
        return (
          <div key={i} style={{ marginLeft: indent }}>
            {renderInline(body)}
          </div>
        )
      })}
    </div>
  )
}

import { useMemo } from 'react'
import type { ReactNode } from 'react'

interface MarkdownContentProps {
  content: string
  className?: string
}

/**
 * Minimal markdown-to-JSX renderer. Handles headings (#, ##, ###), unordered
 * lists (-), and inline **bold**. Inlined to avoid a heavyweight dep — extend
 * with more constructs as features need them.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const result: ReactNode[] = []
    let listItems: string[] = []
    let key = 0

    const flushList = () => {
      if (listItems.length === 0) return
      result.push(
        <ul
          key={key++}
          className="m-0 mb-3 list-disc pl-5 text-sm leading-relaxed text-text-primary"
        >
          {listItems.map((item, i) => (
            <li key={i} className="mb-1">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      )
      listItems = []
    }

    const renderInline = (text: string): ReactNode => {
      const parts = text.split(/(\*\*[^*]+\*\*)/)
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        return part
      })
    }

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed === '') {
        flushList()
        continue
      }

      if (trimmed.startsWith('# ')) {
        flushList()
        result.push(
          <h2
            key={key++}
            className="m-0 mb-2 mt-4 text-base font-semibold text-text-primary first:mt-0"
          >
            {trimmed.slice(2)}
          </h2>,
        )
      } else if (trimmed.startsWith('## ')) {
        flushList()
        result.push(
          <h3
            key={key++}
            className="m-0 mb-2 mt-3 text-sm font-semibold text-text-primary first:mt-0"
          >
            {trimmed.slice(3)}
          </h3>,
        )
      } else if (trimmed.startsWith('### ')) {
        flushList()
        result.push(
          <h4
            key={key++}
            className="m-0 mb-1 mt-3 text-sm font-semibold text-text-primary first:mt-0"
          >
            {trimmed.slice(4)}
          </h4>,
        )
      } else if (trimmed.startsWith('- ')) {
        listItems.push(trimmed.slice(2))
      } else {
        flushList()
        result.push(
          <p key={key++} className="m-0 mb-2 text-sm leading-relaxed text-text-primary">
            {renderInline(trimmed)}
          </p>,
        )
      }
    }

    flushList()
    return result
  }, [content])

  return <div className={className}>{elements}</div>
}

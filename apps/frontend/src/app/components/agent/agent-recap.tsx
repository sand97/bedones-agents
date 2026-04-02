import { useMemo } from 'react'
import { Button } from 'antd'
import { Pencil } from 'lucide-react'

interface AgentRecapProps {
  context: string
  onEdit: () => void
}

/** Lightweight markdown-to-JSX renderer (handles #, ##, ###, -, **, no deps) */
function MarkdownContent({ content }: { content: string }) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const result: React.ReactNode[] = []
    let listItems: string[] = []
    let key = 0

    const flushList = () => {
      if (listItems.length === 0) return
      result.push(
        <ul
          key={key++}
          className="m-0 mb-4 list-disc pl-5 text-sm leading-relaxed text-text-primary"
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

    const renderInline = (text: string): React.ReactNode => {
      // Handle **bold**
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
            className="m-0 mb-3 mt-6 text-lg font-semibold text-text-primary first:mt-0"
          >
            {trimmed.slice(2)}
          </h2>,
        )
      } else if (trimmed.startsWith('## ')) {
        flushList()
        result.push(
          <h3 key={key++} className="m-0 mb-2 mt-5 text-base font-semibold text-text-primary">
            {trimmed.slice(3)}
          </h3>,
        )
      } else if (trimmed.startsWith('### ')) {
        flushList()
        result.push(
          <h4 key={key++} className="m-0 mb-2 mt-4 text-sm font-semibold text-text-primary">
            {trimmed.slice(4)}
          </h4>,
        )
      } else if (trimmed.startsWith('- ')) {
        listItems.push(trimmed.slice(2))
      } else {
        flushList()
        result.push(
          <p key={key++} className="m-0 mb-3 text-sm leading-relaxed text-text-primary">
            {renderInline(trimmed)}
          </p>,
        )
      }
    }

    flushList()
    return result
  }, [content])

  return <>{elements}</>
}

export function AgentRecap({ context, onEdit }: AgentRecapProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <MarkdownContent content={context} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
        <div className="flex justify-end">
          <Button type="primary" icon={<Pencil size={14} />} onClick={onEdit}>
            Modifier le contexte
          </Button>
        </div>
      </div>
    </div>
  )
}

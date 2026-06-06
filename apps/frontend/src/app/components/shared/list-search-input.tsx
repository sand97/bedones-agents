import { useEffect, useRef } from 'react'
import { Button, Input, Progress } from 'antd'
import type { InputRef } from 'antd'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ListSearchInputProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  /** Shows a thin indeterminate "LinearProgress" bar under the input while a search is in flight. */
  searching?: boolean
  placeholder?: string
}

/**
 * Inline search row that appears between a list's filter bar and the list
 * itself. It auto-focuses on mount, exposes a close button, and renders a
 * thin progress bar underneath while a search is running.
 *
 * Shared by the chat (conversations) and comments (posts) interfaces.
 */
export function ListSearchInput({
  value,
  onChange,
  onClose,
  searching = false,
  placeholder,
}: ListSearchInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="list-search border-b border-border-subtle">
      <div className="flex items-center gap-1.5 px-4 py-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
          placeholder={placeholder}
          prefix={<Search size={14} className="text-text-muted" />}
          allowClear
          size="small"
        />
        <Button
          type="text"
          size="small"
          icon={<X size={16} />}
          onClick={onClose}
          aria-label={t('common.close')}
        />
      </div>
      {searching && (
        <Progress
          percent={100}
          status="active"
          showInfo={false}
          strokeLinecap="square"
          strokeColor="#111b21"
          size={[undefined as unknown as number, 2]}
          className="list-search__progress"
        />
      )}
    </div>
  )
}

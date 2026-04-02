import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Checkbox, Input, Radio } from 'antd'
import type { AgentChoiceOption } from './mock-data'

interface AgentChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  pendingOptions?: {
    type: 'mcq' | 'scq'
    text?: string
    options: AgentChoiceOption[]
  } | null
  onOptionSelect?: (optionIds: string[]) => void
}

/* ── Main input with integrated choice picker ── */

export function AgentChatInput({
  onSend,
  disabled,
  pendingOptions,
  onOptionSelect,
}: AgentChatInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [answered, setAnswered] = useState(false)
  const isMCQ = pendingOptions?.type === 'mcq'

  const handleSend = () => {
    if (disabled) return

    // If user typed something, send that (custom response)
    if (inputValue.trim()) {
      onSend(inputValue.trim())
      setInputValue('')
      setSelected([])
      setAnswered(true)
      onOptionSelect?.([])
      return
    }

    // Otherwise send selected options if any
    if (selected.length > 0 && pendingOptions) {
      const labels = pendingOptions.options
        .filter((o) => selected.includes(o.id))
        .map((o) => o.label)
      onSend(labels.join(', '))
      setAnswered(true)
      onOptionSelect?.(selected)
      return
    }
  }

  const handleToggle = (id: string) => {
    if (answered) return

    if (isMCQ) {
      // MCQ: toggle multiple
      setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
    } else {
      // SCQ: select one (replace)
      setSelected((prev) => (prev.includes(id) ? [] : [id]))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = !disabled && (inputValue.trim().length > 0 || selected.length > 0)

  return (
    <div className="flex-shrink-0 border-t border-border-subtle">
      {/* Choice pills */}
      {pendingOptions && !answered && (
        <div className="mx-auto max-w-3xl px-4 pb-2 pt-3">
          <div className="flex flex-wrap gap-2">
            {pendingOptions.options.map((opt) => {
              const isSelected = selected.includes(opt.id)

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggle(opt.id)}
                  className={`flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-text-primary bg-text-primary text-white'
                      : 'cursor-pointer border-border-default bg-bg-surface text-text-primary hover:bg-bg-subtle'
                  }`}
                >
                  {isMCQ ? (
                    <Checkbox
                      checked={isSelected}
                      className={
                        isSelected
                          ? '[&_.ant-checkbox-inner]:border-white [&_.ant-checkbox-inner]:bg-transparent [&_.ant-checkbox-checked_.ant-checkbox-inner]:bg-transparent'
                          : ''
                      }
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : (
                    <Radio
                      checked={isSelected}
                      className={
                        isSelected
                          ? '[&_.ant-radio-inner]:border-white [&_.ant-radio-inner]:bg-transparent [&_.ant-radio-checked_.ant-radio-inner]:bg-transparent [&_.ant-radio-checked_.ant-radio-inner::after]:bg-white'
                          : ''
                      }
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Text input + send */}
      <div className="px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="chat-input-row">
            <Input.TextArea
              placeholder={
                pendingOptions && !answered ? 'Réponse personnalisée…' : 'Écrire un message…'
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              autoSize={{ minRows: 1, maxRows: 4 }}
              className="rounded-2xl!"
            />

            <Button
              type="text"
              shape="circle"
              onClick={handleSend}
              disabled={!canSend}
              icon={<Send size={18} />}
              className="flex-shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

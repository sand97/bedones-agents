import { useState } from 'react'
import { Button, Input, Popover } from 'antd'
import { Send, Mic, Paperclip, FileText, Video, ImageIcon } from 'lucide-react'
import { AudioRecorder } from './audio-recorder'

type InputMode = 'text' | 'audio'

/* ── File attachment popover ── */

function AttachmentPopover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  const items = [
    {
      icon: <FileText size={18} />,
      label: 'Document',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      icon: <Video size={18} />,
      label: 'Vidéo',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      icon: <ImageIcon size={18} />,
      label: 'Photos',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
  ]

  return (
    <Popover
      content={
        <div className="flex flex-col gap-1 w-44">
          {items.map((item) => (
            <Button
              key={item.label}
              type="text"
              block
              onClick={() => setOpen(false)}
              className="py-2.5!"
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${item.bgColor} ${item.color}`}
              >
                {item.icon}
              </div>
              {item.label}
            </Button>
          ))}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="topLeft"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      {children}
    </Popover>
  )
}

/* ── Main input ── */

export function ChatInput({ onSend }: { onSend?: (message: string) => Promise<void> }) {
  const [mode, setMode] = useState<InputMode>('text')
  const [inputValue, setInputValue] = useState('')
  const handleSend = () => {
    if (!inputValue.trim()) return
    const msg = inputValue.trim()
    setInputValue('')
    onSend?.(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const startRecording = () => {
    setMode('audio')
  }

  return (
    <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
      <div className="chat-input-row">
        <AttachmentPopover>
          <Button
            type="text"
            shape="circle"
            icon={<Paperclip size={18} />}
            className="flex-shrink-0"
          />
        </AttachmentPopover>

        {mode === 'audio' ? (
          <AudioRecorder
            onSend={() => {
              // TODO: handle sending audio blob
              setMode('text')
            }}
            onCancel={() => setMode('text')}
          />
        ) : (
          <Input.TextArea
            placeholder="Écrire un message…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="rounded-2xl!"
          />
        )}

        {mode === 'text' &&
          (inputValue.trim() ? (
            <Button
              type="text"
              shape="circle"
              onClick={handleSend}
              icon={<Send size={18} />}
              className="flex-shrink-0"
            />
          ) : (
            <Button
              type="text"
              shape="circle"
              onClick={startRecording}
              icon={<Mic size={18} />}
              className="flex-shrink-0"
            />
          ))}
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { Button, Input, Popover, message } from 'antd'
import { Send, Mic, Paperclip, FileText, Video, ImageIcon, X } from 'lucide-react'
import { AudioRecorder } from './audio-recorder'
import type { Message } from './mock-data'

type InputMode = 'text' | 'audio'
type MediaType = 'image' | 'video' | 'audio' | 'file'

/** Get duration of an audio/video file in seconds */
function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = file.type.startsWith('video') ? document.createElement('video') : new Audio()
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(el.duration || 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0) // Can't determine — allow it
    }
    el.src = url
  })
}

/* ── File attachment popover ── */

function AttachmentPopover({
  children,
  onSelectFiles,
}: {
  children: React.ReactNode
  onSelectFiles: (files: FileList, type: MediaType) => void
}) {
  const [open, setOpen] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const items = [
    {
      icon: <ImageIcon size={18} />,
      label: 'Photos',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      onClick: () => {
        setOpen(false)
        photoInputRef.current?.click()
      },
    },
    {
      icon: <Video size={18} />,
      label: 'Vidéo',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      onClick: () => {
        setOpen(false)
        videoInputRef.current?.click()
      },
    },
    {
      icon: <FileText size={18} />,
      label: 'Document',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      onClick: () => {
        setOpen(false)
        fileInputRef.current?.click()
      },
    },
  ]

  return (
    <>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onSelectFiles(e.target.files, 'image')
          e.target.value = ''
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onSelectFiles(e.target.files, 'video')
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onSelectFiles(e.target.files, 'file')
          e.target.value = ''
        }}
      />
      <Popover
        content={
          <div className="flex flex-col gap-0.5 w-44">
            {items.map((item) => (
              <Button key={item.label} type="text" block onClick={item.onClick} className="py-2.5!">
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
    </>
  )
}

/* ── Main input ── */

export function ChatInput({
  onSend,
  onUploadAndSend,
  replyTo,
  onCancelReply,
}: {
  onSend?: (
    message: string,
    media?: { url: string; type: 'image' | 'video' | 'audio' },
  ) => Promise<void>
  onUploadAndSend?: (file: File, type: MediaType | 'audio') => Promise<void>
  provider?: string
  replyTo?: Message | null
  onCancelReply?: () => void
}) {
  const [mode, setMode] = useState<InputMode>('text')
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Focus input when replyTo changes
  useEffect(() => {
    if (replyTo) {
      // Antd TextArea wraps the native textarea — use querySelector as fallback
      const el =
        inputRef.current || document.querySelector<HTMLTextAreaElement>('.chat-input-row textarea')
      el?.focus()
    }
  }, [replyTo])

  const handleSend = () => {
    if (!inputValue.trim()) return
    const msg = inputValue.trim()
    setInputValue('')
    onSend?.(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAudioSend = async (blob: Blob) => {
    setMode('text')
    if (!onUploadAndSend) return
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'ogg'
    const file = new File([blob], `audio.${ext}`, { type: blob.type })
    await onUploadAndSend(file, 'audio')
  }

  const MAX_MEDIA_DURATION = 180 // 3 minutes

  const handleFileSelect = async (files: FileList, type: MediaType) => {
    if (!onUploadAndSend || files.length === 0) return
    const file = files[0]

    // Validate duration for audio/video (3 min max)
    if (type === 'video' || type === 'audio') {
      const duration = await getMediaDuration(file)
      if (duration > MAX_MEDIA_DURATION) {
        message.error('Les fichiers audio et vidéo ne doivent pas dépasser 3 minutes')
        return
      }
    }

    const uploadType = type === 'file' ? 'file' : type
    await onUploadAndSend(file, uploadType)
  }

  const startRecording = () => {
    setMode('audio')
  }

  return (
    <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-xs text-text-secondary">
          <span className="min-w-0 flex-1 truncate">
            Réponse à <strong>{replyTo.from === 'business' ? 'Vous' : 'Client'}</strong> :{' '}
            {replyTo.text || (replyTo.type !== 'text' ? `[${replyTo.type}]` : '')}
          </span>
          <Button
            type="text"
            size="small"
            shape="circle"
            onClick={onCancelReply}
            icon={<X size={14} />}
          />
        </div>
      )}
      <div className="chat-input-row">
        <AttachmentPopover onSelectFiles={handleFileSelect}>
          <Button
            type="text"
            shape="circle"
            icon={<Paperclip size={18} />}
            className="flex-shrink-0"
          />
        </AttachmentPopover>

        {mode === 'audio' ? (
          <AudioRecorder onSend={handleAudioSend} onCancel={() => setMode('text')} />
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

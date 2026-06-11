import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Spin } from 'antd'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { DeliveryCheck, type ChatProvider } from './chat-message-utils'

/* ── Lazy video player ──
   Avoids pre-buffering: shows a placeholder with a play button. The <video>
   element is mounted only on click, so the network request happens at user
   intent rather than at render time. */

export function LazyVideo({ src, onPlay }: { src?: string; onPlay?: () => void }) {
  const [active, setActive] = useState(false)

  if (!active) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setActive(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setActive(true)
          }
        }}
        aria-label="Lire la vidéo"
        className="chat-video-placeholder"
      >
        <span className="chat-video-placeholder__play">
          <Play size={20} />
        </span>
      </div>
    )
  }

  return (
    <video
      src={src}
      controls
      autoPlay
      preload="auto"
      className="w-full rounded-control aspect-video bg-bg-muted"
      onLoadedMetadata={onPlay}
    />
  )
}

/* ── Audio message player ── */

export function AudioPlayer({
  audioUrl,
  timestamp,
  isOutgoing,
  isSending,
  isError,
  isRead,
  isAi,
  deliveryStatus,
  provider,
  onRetry,
}: {
  audioUrl?: string
  timestamp?: string
  isOutgoing?: boolean
  isSending?: boolean
  isError?: boolean
  isRead?: boolean
  isAi?: boolean
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  provider?: ChatProvider
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
    }
    const onLoadedMetadata = () => setDuration(audio.duration)
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col gap-1">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      <div className="flex items-center gap-3">
        <Button
          type="text"
          shape="circle"
          onClick={togglePlay}
          icon={playing ? <Pause size={14} /> : <Play size={14} />}
          className="flex-shrink-0 border border-text-primary text-text-primary!"
        />
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
          <div
            className="h-full rounded-full bg-text-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between pl-13 text-[10px] text-text-muted">
        <span>{duration > 0 ? formatDuration(duration) : '0:00'}</span>
        {isError ? (
          <Button
            type={'text'}
            danger
            size="small"
            iconPosition={'end'}
            onClick={onRetry}
            icon={<RotateCcw size={10} />}
          >
            Non envoyé · Réessayer
          </Button>
        ) : (
          <span className="flex items-center gap-1">
            <span>
              {timestamp}
              {isOutgoing && isAi && ` ${t('chat.by_ai')}`}
            </span>
            {isOutgoing && isSending && <Spin size="small" />}
            {isOutgoing && !isSending && (
              <DeliveryCheck
                deliveryStatus={deliveryStatus}
                provider={provider}
                isRead={!!isRead}
              />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

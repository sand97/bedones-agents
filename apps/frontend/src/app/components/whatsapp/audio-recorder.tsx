import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Popover, Tooltip } from 'antd'
import { X, Send, Mic, Square, Play, Pause } from 'lucide-react'

interface AudioRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void
  onCancel: () => void
}

type RecorderState = 'recording' | 'preview'

/* ── Live waveform (HiDPI-aware canvas) ── */

function LiveWaveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const sizeRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    if (!stream || !canvasRef.current) return

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      sizeRef.current = { w: rect.width, h: rect.height }
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const { w, h } = sizeRef.current
      if (w === 0) return

      ctx.clearRect(0, 0, w, h)

      const barWidth = 2.5
      const gap = 1.5
      const totalBars = Math.floor(w / (barWidth + gap))

      for (let i = 0; i < totalBars; i++) {
        const dataIndex = Math.floor((i / totalBars) * bufferLength)
        const sample = (dataArray[dataIndex] - 128) / 128
        const value = Math.abs(sample)
        const barHeight = Math.max(2, value * h * 0.9 + 2)
        const x = i * (barWidth + gap)
        const y = (h - barHeight) / 2

        ctx.fillStyle = `rgba(17, 27, 33, ${0.25 + value * 0.5})`
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 1)
        ctx.fill()
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
      observer.disconnect()
      audioCtx.close()
    }
  }, [stream])

  return (
    <canvas ref={canvasRef} className="flex-1 min-w-0 h-6 w-full" style={{ display: 'block' }} />
  )
}

/* ── Static waveform for preview (fills available width) ── */

function StaticWaveform({ progress, heights }: { progress: number; heights: number[] }) {
  return (
    <div className="flex flex-1 items-center justify-between min-w-0 h-6">
      {heights.map((h, i) => (
        <div
          key={i}
          className="rounded-full transition-colors duration-150"
          style={{
            width: '2px',
            height: `${h}px`,
            flexShrink: 0,
            backgroundColor:
              i / heights.length <= progress
                ? 'var(--color-text-primary)'
                : 'rgba(17, 27, 33, 0.15)',
          }}
        />
      ))}
    </div>
  )
}

/* ── Mic selector popover content ── */

function MicSelectorContent({
  devices,
  selectedId,
  onSelect,
}: {
  devices: MediaDeviceInfo[]
  selectedId: string
  onSelect: (deviceId: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5 w-56">
      <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-text-muted">Microphone</p>
      {devices.map((device) => (
        <Button
          key={device.deviceId}
          type="text"
          block
          onClick={() => onSelect(device.deviceId)}
          icon={<Mic size={14} />}
          className={`py-2! ${device.deviceId === selectedId ? 'font-medium' : ''}`}
        >
          <span className="truncate">{device.label || `Micro ${device.deviceId.slice(0, 4)}`}</span>
        </Button>
      ))}
    </div>
  )
}

/* ── Main recorder ── */

export function AudioRecorder({ onSend, onCancel }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>('recording')
  const [duration, setDuration] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [micPopoverOpen, setMicPopoverOpen] = useState(false)

  // All streams ever created — we track them all to ensure cleanup
  const allStreamsRef = useRef<Set<MediaStream>>(new Set())
  const streamRef = useRef<MediaStream | null>(null)

  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Preview / playback
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playProgress, setPlayProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  // Generate stable random waveform heights for the static preview
  const waveformHeights = useRef(Array.from({ length: 80 }, () => Math.random() * 16 + 3)).current

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const selectedDeviceLabel =
    devices.find((d) => d.deviceId === selectedDevice)?.label || 'Microphone'

  /** Nuclear cleanup — kill every stream we ever created */
  const stopEverything = useCallback(() => {
    // Stop the MediaRecorder
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    mediaRecorderRef.current = null

    // Kill ALL streams we ever created
    allStreamsRef.current.forEach((s) => {
      s.getTracks().forEach((t) => t.stop())
    })
    allStreamsRef.current.clear()
    streamRef.current = null
    setStream(null)
  }, [])

  /* ── Start mic stream + MediaRecorder ── */

  const startStream = useCallback(async (deviceId?: string) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      allStreamsRef.current.add(s)
      streamRef.current = s
      setStream(s)

      // Start MediaRecorder — prefer mp4 (supported by Instagram/Messenger APIs)
      const preferredTypes = ['audio/mp4', 'audio/m4a', 'audio/webm', 'audio/ogg']
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = mimeType ? new MediaRecorder(s, { mimeType }) : new MediaRecorder(s)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      mediaRecorderRef.current = recorder

      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const mics = allDevices.filter((d) => d.kind === 'audioinput')
      setDevices(mics)
      if (!deviceId && mics.length > 0) {
        setSelectedDevice(mics[0].deviceId)
      }
    } catch {
      // Mic not available — UI still renders for design/fallback
    }
  }, [])

  useEffect(() => {
    startStream()
    return () => {
      stopEverything()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [startStream, stopEverything])

  const MAX_DURATION = 180 // 3 minutes

  // Timer — only counts while recording, auto-stop at max
  useEffect(() => {
    if (state !== 'recording') return
    intervalRef.current = setInterval(() => {
      setDuration((prev) => {
        if (prev + 1 >= MAX_DURATION) {
          // Auto-stop recording at 3 min
          handleStop()
          return prev + 1
        }
        return prev + 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId)
    setMicPopoverOpen(false)
    stopEverything()
    setDuration(0)
    startStream(deviceId)
  }

  const handleStop = () => {
    // Capture chunks before stopping
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        setAudioBlob(blob)

        const url = URL.createObjectURL(blob)
        audioUrlRef.current = url
        const audio = new Audio(url)
        audio.onended = () => {
          setIsPlaying(false)
          setPlayProgress(0)
        }
        audioRef.current = audio
      }
    }
    stopEverything()
    setState('preview')
  }

  const handleCancel = () => {
    stopEverything()
    audioRef.current?.pause()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    onCancel()
  }

  const handleSend = () => {
    stopEverything()
    audioRef.current?.pause()
    if (audioBlob) {
      onSend(audioBlob, duration)
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
  }

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)

      const update = () => {
        if (!audio.paused && audio.duration) {
          setPlayProgress(audio.currentTime / audio.duration)
          requestAnimationFrame(update)
        }
      }
      requestAnimationFrame(update)
    }
  }

  return (
    <div className="flex h-input flex-1 min-w-0 items-stretch rounded-2xl border border-border-default bg-bg-surface overflow-hidden">
      {/* ── Left: Mic icon with popover + tooltip ── */}
      <Popover
        content={
          <MicSelectorContent
            devices={devices}
            selectedId={selectedDevice}
            onSelect={handleDeviceChange}
          />
        }
        trigger="click"
        open={micPopoverOpen}
        onOpenChange={setMicPopoverOpen}
        placement="topLeft"
        arrow={false}
        overlayClassName="org-switcher-popover"
      >
        <Tooltip
          title={selectedDeviceLabel}
          placement="top"
          open={micPopoverOpen ? false : undefined}
        >
          <Button
            type="text"
            className="flex w-10 flex-shrink-0 items-center justify-center rounded-l-2xl rounded-r-none! text-text-primary! bg-bg-subtle! hover:bg-bg-muted!"
          >
            <div className="relative">
              <Mic size={16} />
              {state === 'recording' && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </div>
          </Button>
        </Tooltip>
      </Popover>

      {/* ── Middle: Waveform + timer ── */}
      <div className="flex flex-1 items-center gap-2.5 px-3 min-w-0">
        {state === 'recording' && (
          <div className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
        )}
        <span className="text-xs tabular-nums font-medium text-text-primary flex-shrink-0">
          {formatDuration(
            state === 'preview' && isPlaying && audioRef.current
              ? Math.floor(audioRef.current.currentTime)
              : duration,
          )}
        </span>
        {state === 'recording' ? (
          <LiveWaveform stream={stream} />
        ) : (
          <StaticWaveform progress={playProgress} heights={waveformHeights} />
        )}
      </div>

      {/* ── Right: Control buttons ── */}
      <div className="flex items-center gap-1 px-1.5">
        {state === 'recording' ? (
          <>
            <Tooltip title="Arrêter" placement="top">
              <Button
                type="text"
                danger
                shape="circle"
                size="small"
                onClick={handleStop}
                icon={<Square size={14} fill="currentColor" />}
              />
            </Tooltip>
            <Tooltip title="Annuler" placement="top">
              <Button
                type="text"
                danger
                shape="circle"
                size="small"
                onClick={handleCancel}
                icon={<X size={15} />}
              />
            </Tooltip>
          </>
        ) : (
          <>
            <Tooltip title={isPlaying ? 'Pause' : 'Lecture'} placement="top">
              <Button
                type="text"
                shape="circle"
                size="small"
                onClick={togglePlayback}
                icon={isPlaying ? <Pause size={15} /> : <Play size={15} />}
              />
            </Tooltip>
            <Tooltip title="Envoyer" placement="top">
              <Button
                type="primary"
                shape="circle"
                size="small"
                onClick={handleSend}
                icon={<Send size={14} />}
              />
            </Tooltip>
            <Tooltip title="Annuler" placement="top">
              <Button
                type="text"
                danger
                shape="circle"
                size="small"
                onClick={handleCancel}
                icon={<X size={15} />}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}

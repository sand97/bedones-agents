import type { CSSProperties, ReactNode } from 'react'

/* ──────────────────────────── Iconography ──────────────────────────── */

interface IcProps {
  size?: number
  sw?: number
  fill?: string
  children?: ReactNode
  style?: CSSProperties
}
function Ic({ size = 20, sw = 1.6, fill = 'none', children, style }: IcProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  sparkles: (p) => (
    <Ic {...p}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </Ic>
  ),
  ticket: (p) => (
    <Ic {...p}>
      <path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 6 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-6z" />
      <path d="M13 7v10" strokeDasharray="1.5 2.5" />
    </Ic>
  ),
  promo: (p) => (
    <Ic {...p}>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </Ic>
  ),
  arrowRight: (p) => (
    <Ic {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Ic>
  ),
  arrowLeft: (p) => (
    <Ic {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Ic>
  ),
  check: (p) => (
    <Ic {...p}>
      <path d="M20 6L9 17l-5-5" />
    </Ic>
  ),
  alert: (p) => (
    <Ic {...p}>
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Ic>
  ),
  refresh: (p) => (
    <Ic {...p}>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </Ic>
  ),
  external: (p) => (
    <Ic {...p}>
      <path d="M15 3h6v6M21 3l-9 9" />
      <path d="M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" />
    </Ic>
  ),
  box: (p) => (
    <Ic {...p}>
      <path d="M21 8l-9-5-9 5M21 8v8l-9 5-9-5V8M21 8l-9 5-9-5M12 13v8" />
    </Ic>
  ),
  bag: (p) => (
    <Ic {...p}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
    </Ic>
  ),
  x: (p) => (
    <Ic {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Ic>
  ),
  shield: (p) => (
    <Ic {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Ic>
  ),
  layers: (p) => (
    <Ic {...p}>
      <path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
    </Ic>
  ),
}

export function Icon({ name, size }: { name: string; size?: number }) {
  const C = ICONS[name]
  return C ? <>{C({ size })}</> : null
}

const WA_GREEN = '#25d366'

export function WhatsAppGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={WA_GREEN} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function CommerceGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111b21"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5L5.4 5h13.2L20 9.5M4 9.5h16M4 9.5v9a1 1 0 001 1h14a1 1 0 001-1v-9" />
      <path d="M9 19.5v-5h6v5M7.5 9.5a1.8 1.8 0 01-3.5 0M11 9.5a1.8 1.8 0 01-3.5 0M14.5 9.5a1.8 1.8 0 01-3.5 0M18 9.5a1.8 1.8 0 01-3.5 0" />
    </svg>
  )
}

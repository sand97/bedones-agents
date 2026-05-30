import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import countryCodes from '@app/data/CountryCodes.json'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'
import { formatPhoneNumber } from '@app/lib/phone-format'
import { MK_CONTAINER, MK_EYEBROW, MK_ACCENT } from './mk'

interface CountryEntry {
  name: string
  dial_code: string
  code: string
}

const DEFAULT_DIAL_CODE = '+237'
const DEFAULT_ISO = 'CM'

/** Entrance choreography for the floating logos. Each value is the
 *  animation-delay in ms — prominent logos pop in first, ghost ones after.
 *  The keyframe itself (`mkHeroLogoIn` in styles.css) lasts 0.8s, so the
 *  full entrance finishes around ${last + 800}ms (~1600ms below). */
const HERO_ICON_DELAYS_MS = [
  // p1..p7 — prominent
  0, 120, 240, 360, 480, 600, 720,
  // g1..g4 — ghost (start after the main wave)
  640, 720, 800, 880,
]
// Wait until the entrance is mostly complete before letting the mouse-parallax
// JS start writing `transform` on each logo (it would otherwise clobber the
// keyframe's scale/rotate during the intro).
const PARALLAX_START_MS = 1600

export function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const [dialCode, setDialCode] = useState<string>(DEFAULT_DIAL_CODE)
  const [iso, setIso] = useState<string>(DEFAULT_ISO)
  const [phone, setPhone] = useState<string>('')

  // Detect country from IP on mount and auto-fill the dial code.
  useEffect(() => {
    let cancelled = false
    fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
      .then((res) => res.json())
      .then((data: { country_calling_code?: string; country_code?: string }) => {
        if (cancelled) return
        if (data.country_calling_code) {
          const entry = (countryCodes as CountryEntry[]).find(
            (c) => c.dial_code === data.country_calling_code,
          )
          if (entry) {
            setDialCode(entry.dial_code)
            setIso(entry.code)
            return
          }
        }
        if (data.country_code) {
          const entry = (countryCodes as CountryEntry[]).find((c) => c.code === data.country_code)
          if (entry) {
            setDialCode(entry.dial_code)
            setIso(entry.code)
          }
        }
      })
      .catch(() => {
        // Silently keep defaults.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (!cleanPhone || cleanPhone.length < 6) {
      // No phone yet — go to the login page so the user can fill it there.
      navigate({ to: '/auth/login' })
      return
    }
    navigate({
      to: '/auth/login',
      search: { country: dialCode, phone: cleanPhone },
    })
  }

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const logos = Array.from(hero.querySelectorAll<HTMLElement>('.mk-float-logo'))
    if (!logos.length) return

    // Apply the entrance stagger directly to each logo's --mk-d var.
    logos.forEach((logo, i) => {
      const ms = HERO_ICON_DELAYS_MS[i] ?? 0
      logo.style.setProperty('--mk-d', `${ms}ms`)
    })

    let mouseX = 0
    let mouseY = 0
    let active = false
    let parallaxStarted = false
    const states = logos.map(() => ({ tx: 0, ty: 0 }))

    const onMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect()
      mouseX = e.clientX - rect.left
      mouseY = e.clientY - rect.top
      active = true
    }
    const onLeave = () => {
      active = false
    }

    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('mouseleave', onLeave)

    const MAX_R = 280
    const MAX_OFFSET = 36
    const LERP = 0.1
    let raf = 0

    const tick = () => {
      if (!parallaxStarted) {
        raf = requestAnimationFrame(tick)
        return
      }
      const heroRect = hero.getBoundingClientRect()
      logos.forEach((logo, i) => {
        const r = logo.getBoundingClientRect()
        const cx = r.left - heroRect.left + r.width / 2 - states[i].tx
        const cy = r.top - heroRect.top + r.height / 2 - states[i].ty
        let targetX = 0
        let targetY = 0
        if (active) {
          const dx = cx - mouseX
          const dy = cy - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_R && dist > 0.0001) {
            const strength = 1 - dist / MAX_R
            const k = strength * strength
            targetX = -(dx / dist) * MAX_OFFSET * k
            targetY = -(dy / dist) * MAX_OFFSET * k
          }
        }
        states[i].tx += (targetX - states[i].tx) * LERP
        states[i].ty += (targetY - states[i].ty) * LERP
        const rot = (states[i].tx * 0.05).toFixed(2)
        logo.style.transform = `translate3d(${states[i].tx.toFixed(2)}px, ${states[i].ty.toFixed(2)}px, 0) rotate(${rot}deg)`
      })
      raf = requestAnimationFrame(tick)
    }
    const startTimer = window.setTimeout(() => {
      parallaxStarted = true
    }, PARALLAX_START_MS)
    raf = requestAnimationFrame(tick)

    return () => {
      window.clearTimeout(startTimer)
      cancelAnimationFrame(raf)
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <section
      className="relative overflow-hidden pt-[60px] pb-10 min-h-[720px] max-[768px]:pt-10 max-[768px]:pb-[120px] max-[768px]:min-h-0"
      ref={heroRef}
    >
      {/* .mk-hero-grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(#d4d4d4 1px, transparent 1px), linear-gradient(90deg, #d4d4d4 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, #000 25%, transparent 80%)',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, #000 25%, transparent 80%)',
        }}
      />

      {/* .mk-hero-floats */}
      <div className="absolute inset-0 pointer-events-none z-[1]" aria-hidden="true">
        {/* p1 — FB top-left */}
        <span className="mk-float-logo fb p1 absolute w-16 h-16 rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-facebook)] [top:18%] [left:8%] max-[1100px]:[display:none] max-[900px]:[display:inline-flex] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[900px]:[top:6%] max-[768px]:[left:4%]">
          <FacebookIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p2 — TT top-right */}
        <span className="mk-float-logo tt p2 absolute w-16 h-16 rounded-sm border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform bg-[var(--color-brand-tiktok)] text-white [top:12%] [right:10%] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[900px]:[top:6%] max-[768px]:[right:4%]">
          <TikTokIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p3 — WA mid-left — hidden on <=768 */}
        <span className="mk-float-logo wa p3 absolute w-16 h-16 rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-whatsapp)] [top:55%] [left:4%] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[768px]:hidden">
          <WhatsAppIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p4 — IG mid-right — hidden on <=768 */}
        <span
          className="mk-float-logo ig p4 absolute w-16 h-16 rounded-sm border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-white [top:50%] [right:5%] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[768px]:hidden"
          style={{
            background:
              'radial-gradient(circle at 30% 110%, #ffdc80 0%, #fcaf45 5%, #f77737 15%, #f56040 25%, #e1306c 45%, #c13584 60%, #833ab4 75%, #5851db 90%)',
          }}
        >
          <InstagramIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p5 — MS bottom-left */}
        <span className="mk-float-logo ms p5 absolute w-16 h-16 rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-messenger)] [bottom:16%] [left:16%] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[900px]:[bottom:4%] max-[768px]:[bottom:16px] max-[768px]:[left:6%]">
          <MessengerIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p6 — WA bottom-right */}
        <span className="mk-float-logo wa p6 absolute w-16 h-16 rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-whatsapp)] [bottom:12%] [right:18%] max-[900px]:w-[52px] max-[900px]:h-[52px] max-[900px]:[bottom:4%] max-[768px]:[bottom:16px] max-[768px]:[right:6%] max-[768px]:left-auto">
          <WhatsAppIcon className="w-[30px] h-[30px] max-[900px]:w-6 max-[900px]:h-6" />
        </span>
        {/* p7 — IG bottom-center (mobile only) */}
        <span
          className="mk-float-logo ig p7 absolute w-16 h-16 rounded-sm border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] pointer-events-none will-change-transform text-white hidden max-[768px]:inline-flex max-[768px]:[bottom:16px] max-[768px]:[left:calc(50%-26px)]"
          style={{
            background:
              'radial-gradient(circle at 30% 110%, #ffdc80 0%, #fcaf45 5%, #f77737 15%, #f56040 25%, #e1306c 45%, #c13584 60%, #833ab4 75%, #5851db 90%)',
          }}
        >
          <InstagramIcon className="w-[30px] h-[30px]" />
        </span>

        {/* Ghost logos — hidden <=1100 */}
        <span className="mk-float-logo fb ghost g1 absolute w-12 h-12 opacity-[0.55] rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-facebook)] [top:30%] [left:22%] max-[1100px]:hidden">
          <FacebookIcon className="w-[22px] h-[22px]" />
        </span>
        <span className="mk-float-logo ig ghost g2 absolute w-12 h-12 opacity-[0.55] rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-instagram)] [top:28%] [right:24%] max-[1100px]:hidden">
          <InstagramIcon className="w-[22px] h-[22px]" />
        </span>
        <span className="mk-float-logo tt ghost g3 absolute w-12 h-12 opacity-[0.55] rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-tiktok)] [bottom:32%] [left:18%] max-[1100px]:hidden">
          <TikTokIcon className="w-[22px] h-[22px]" />
        </span>
        <span className="mk-float-logo ms ghost g4 absolute w-12 h-12 opacity-[0.55] rounded-sm bg-white border border-[var(--mk-border)] [box-shadow:0_4px_12px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] inline-flex items-center justify-center pointer-events-none will-change-transform text-[var(--color-brand-messenger)] [bottom:28%] [right:30%] max-[1100px]:hidden">
          <MessengerIcon className="w-[22px] h-[22px]" />
        </span>
      </div>

      <div className={MK_CONTAINER}>
        {/* .mk-hero-inner */}
        <div className="relative text-center max-w-[720px] mx-auto mt-20 z-[2] max-[768px]:mt-10">
          {/* .mk-eyebrow-pill */}
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--mk-text)] bg-[var(--mk-surface)] border border-[var(--mk-border)] px-[14px] py-2 rounded-[999px] [box-shadow:var(--mk-shadow-soft)]">
            <span className="w-1.5 h-1.5 rounded-[999px] bg-[var(--mk-text)] [box-shadow:0_0_0_4px_rgba(17,27,33,0.1)]" />
            IA conversationnelle pour vendeurs en ligne
          </span>

          <h1 className="text-[clamp(40px,6vw,72px)] mt-7 mb-[22px] mx-auto max-w-[720px] leading-[1.02] tracking-[-0.035em] font-[family-name:var(--mk-font-display)] font-bold max-[768px]:text-[38px] max-[768px]:mt-5 max-[768px]:mb-4">
            Votre assistant IA qui répond
            <br className="max-[768px]:hidden" />à vos clients,{' '}
            <span className={MK_ACCENT}>24h/24.</span>
          </h1>

          <p className="text-[clamp(15px,1.4vw,17px)] text-[var(--mk-text-muted)] max-w-[540px] mx-auto mb-8 leading-[1.55] max-[768px]:text-[15px] max-[768px]:mb-6">
            Bedones Moderator gère vos conversations sur WhatsApp, Instagram, TikTok, Messenger et
            Facebook — en apprenant de votre catalogue et de votre façon de répondre.
          </p>

          {/* .mk-hero-form */}
          <form
            className="max-w-[520px] mx-auto mb-[18px] bg-white border border-[var(--mk-border)] rounded-[999px] p-[6px] flex items-center gap-[6px] [box-shadow:var(--mk-shadow-card)] max-[768px]:flex-wrap max-[768px]:rounded-[18px] max-[768px]:p-2 max-[768px]:gap-[6px]"
            onSubmit={handleSubmit}
          >
            <label className="inline-flex items-center gap-[6px] px-[14px] h-11 text-[14.5px] font-semibold text-[var(--mk-text)] border-r border-[var(--mk-border)] cursor-pointer max-[768px]:flex-[0_0_auto] max-[768px]:border-r-0 max-[768px]:px-[10px]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13 1 .37 1.97.72 2.91a2 2 0 01-.45 2.11L8.09 10.09a16 16 0 006 6l1.35-1.35a2 2 0 012.11-.45c.94.35 1.91.59 2.91.72A2 2 0 0122 16.92z" />
              </svg>
              <select
                value={dialCode}
                onChange={(e) => {
                  const next = e.target.value
                  setDialCode(next)
                  const entry = (countryCodes as CountryEntry[]).find((c) => c.dial_code === next)
                  if (entry) setIso(entry.code)
                }}
                aria-label="Indicatif pays"
                className="appearance-none bg-transparent border-0 outline-none font-[inherit] font-[inherit] color-inherit cursor-pointer p-0 max-w-[80px]"
              >
                {Array.from(
                  new Map(
                    (countryCodes as CountryEntry[])
                      .slice()
                      .sort((a, b) => a.dial_code.localeCompare(b.dial_code))
                      .map((c) => [c.dial_code, c]),
                  ).values(),
                ).map((c) => (
                  <option key={c.dial_code} value={c.dial_code}>
                    {c.code} {c.dial_code}
                  </option>
                ))}
              </select>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </label>
            <input
              type="tel"
              placeholder="6 57 88 86 90"
              aria-label="Numéro WhatsApp"
              value={formatPhoneNumber(phone, iso)}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              className="flex-1 min-w-0 border-0 outline-none bg-transparent h-11 font-[family-name:var(--mk-font-body)] text-[15px] text-[var(--mk-text)] px-[6px] placeholder:text-[var(--mk-text-soft)] max-[768px]:[flex:1_1_60%] max-[768px]:min-w-[100px]"
            />
            <button
              type="submit"
              className="h-11 px-[22px] bg-[var(--mk-text)] text-white rounded-[999px] font-[family-name:var(--mk-font-body)] text-[14.5px] font-semibold inline-flex items-center gap-[6px] flex-shrink-0 transition-[opacity,transform] duration-150 hover:opacity-[0.92] hover:-translate-y-px max-[768px]:[flex:1_1_100%] max-[768px]:rounded-xl"
            >
              Commencer →
            </button>
          </form>

          {/* .mk-hero-disclaimer */}
          <p className="text-[12.5px] text-[var(--mk-text-soft)] mx-auto mb-7 max-[768px]:mt-5">
            Démarrez gratuitement en 2 minutes. Pas de carte bancaire.
          </p>

          {/* .mk-hero-proof — hidden on mobile */}
          <div className="text-[13px] text-[var(--mk-text-soft)] flex gap-[10px] justify-center items-center flex-wrap max-[768px]:hidden">
            Rejoint par{' '}
            <strong className="text-[var(--mk-text)] font-semibold">500+ entrepreneurs</strong>
            <span className="text-[var(--mk-border)]">·</span>
            Service client 24/7
            <span className="text-[var(--mk-border)]">·</span>
            Réponse en moins de 2 min
          </div>
        </div>
      </div>
    </section>
  )
}

import { useEffect, useRef } from 'react'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'

export function Hero() {
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const logos = Array.from(hero.querySelectorAll<HTMLElement>('.mk-float-logo'))
    if (!logos.length) return

    let mouseX = 0
    let mouseY = 0
    let active = false
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
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <section className="mk-hero" ref={heroRef}>
      <div className="mk-hero-grid" />
      <div className="mk-hero-floats" aria-hidden="true">
        <span className="mk-float-logo fb p1">
          <FacebookIcon />
        </span>
        <span className="mk-float-logo tt p2">
          <TikTokIcon />
        </span>
        <span className="mk-float-logo wa p3">
          <WhatsAppIcon />
        </span>
        <span className="mk-float-logo ig p4">
          <InstagramIcon />
        </span>
        <span className="mk-float-logo ms p5">
          <MessengerIcon />
        </span>
        <span className="mk-float-logo wa p6">
          <WhatsAppIcon />
        </span>
        <span className="mk-float-logo fb ghost g1">
          <FacebookIcon />
        </span>
        <span className="mk-float-logo ig ghost g2">
          <InstagramIcon />
        </span>
        <span className="mk-float-logo tt ghost g3">
          <TikTokIcon />
        </span>
        <span className="mk-float-logo ms ghost g4">
          <MessengerIcon />
        </span>
      </div>
      <div className="mk-container">
        <div className="mk-hero-inner">
          <span className="mk-eyebrow-pill">
            <span className="dot" />
            IA conversationnelle pour vendeurs en ligne
          </span>
          <h1>
            Votre assistant IA qui répond
            <br />à vos clients, <span className="mk-accent">24h/24.</span>
          </h1>
          <p className="mk-sub">
            Bedones Moderator gère vos conversations sur WhatsApp, Instagram, TikTok, Messenger et
            Facebook — en apprenant de votre catalogue et de votre façon de répondre.
          </p>
          <form
            className="mk-hero-form"
            onSubmit={(e) => {
              e.preventDefault()
              window.location.href = '/auth/login'
            }}
          >
            <span className="cc">
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
              +237
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
            </span>
            <input type="tel" placeholder="6 9X XX XX XX" aria-label="Numéro WhatsApp" />
            <button type="submit">Commencer →</button>
          </form>
          <p className="mk-hero-disclaimer">
            Démarrez gratuitement en 2 minutes. Pas de carte bancaire.
          </p>
          <div className="mk-hero-proof">
            Rejoint par <strong>500+ entrepreneurs</strong>
            <span className="sep">·</span>
            Service client 24/7
            <span className="sep">·</span>
            Réponse en moins de 2 min
          </div>
        </div>
      </div>
    </section>
  )
}

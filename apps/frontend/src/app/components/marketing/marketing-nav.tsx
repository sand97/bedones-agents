import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { MK_CONTAINER, MK_LOGO, MK_LOGO_MARK, MK_LOGO_SUFFIX, MK_BTN_PRIMARY, MK_BTN_SM } from './mk'

interface Props {
  current?: 'home' | 'pricing' | 'blog'
}

export function MarketingNav({ current }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      ref={navRef}
      className={[
        // .mk-nav
        'sticky top-0 z-50 border-b transition-[box-shadow,border-color,background] duration-200 ease-[ease]',
        scrolled
          ? // .mk-nav.scrolled
            'bg-[rgba(250,250,250,0.94)] [box-shadow:var(--mk-shadow-nav)] border-[var(--mk-border)]'
          : 'bg-[rgba(250,250,250,0.85)] backdrop-blur-[10px] [-webkit-backdrop-filter:blur(10px)] border-transparent',
      ].join(' ')}
    >
      {/* .mk-nav-inner */}
      <div className={`${MK_CONTAINER} flex items-center justify-between h-[72px] gap-6 max-[900px]:h-16`}>
        <Link to="/" className={MK_LOGO}>
          <span className={MK_LOGO_MARK}>B</span>
          <span>
            Bedones <span className={MK_LOGO_SUFFIX}>/ Moderator</span>
          </span>
        </Link>

        {/* .mk-nav-links — hidden below 900 px */}
        <nav className="flex gap-8 items-center max-[900px]:hidden">
          <Link
            to="/"
            hash="features"
            className={`text-[14.5px] font-medium text-[var(--mk-text)] transition-opacity duration-150 hover:opacity-100 ${current === 'home' ? 'opacity-100 font-semibold' : 'opacity-85'}`}
          >
            Fonctionnalités
          </Link>
          <Link
            to="/"
            hash="how"
            className="text-[14.5px] font-medium text-[var(--mk-text)] opacity-85 transition-opacity duration-150 hover:opacity-100"
          >
            Comment ça marche
          </Link>
          <Link
            to="/pricing"
            className={`text-[14.5px] font-medium text-[var(--mk-text)] transition-opacity duration-150 hover:opacity-100 ${current === 'pricing' ? 'opacity-100 font-semibold' : 'opacity-85'}`}
          >
            Tarifs
          </Link>
          <Link
            to="/blog"
            className={`text-[14.5px] font-medium text-[var(--mk-text)] transition-opacity duration-150 hover:opacity-100 ${current === 'blog' ? 'opacity-100 font-semibold' : 'opacity-85'}`}
          >
            Blog
          </Link>
        </nav>

        {/* .mk-nav-right */}
        <div className="flex items-center gap-[14px]">
          {/* .mk-login — hidden below 900 px */}
          <Link
            to="/auth/login"
            className="text-[14.5px] font-medium max-[900px]:hidden"
          >
            Se connecter
          </Link>
          {/* mk-btn hidden below 900 px */}
          <Link
            to="/auth/login"
            className={`${MK_BTN_PRIMARY} ${MK_BTN_SM} max-[900px]:hidden`}
          >
            Démarrer gratuitement
          </Link>
          {/* .mk-nav-toggle — shown below 900 px */}
          <button
            className="hidden max-[900px]:inline-flex w-10 h-10 items-center justify-center rounded-[999px] text-[var(--mk-text)]"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* .mk-mobile-menu — shown when open */}
      {open && (
        <div className="flex flex-col gap-3 border-t border-[var(--mk-border)] bg-white px-6 py-4 pb-5">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2 border-b border-[var(--mk-border-soft)]"
          >
            Accueil
          </Link>
          <Link
            to="/"
            hash="features"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2 border-b border-[var(--mk-border-soft)]"
          >
            Fonctionnalités
          </Link>
          <Link
            to="/"
            hash="how"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2 border-b border-[var(--mk-border-soft)]"
          >
            Comment ça marche
          </Link>
          <Link
            to="/pricing"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2 border-b border-[var(--mk-border-soft)]"
          >
            Tarifs
          </Link>
          <Link
            to="/blog"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2 border-b border-[var(--mk-border-soft)]"
          >
            Blog
          </Link>
          <Link
            to="/auth/login"
            onClick={() => setOpen(false)}
            className="text-base font-medium text-[var(--mk-text)] py-2"
          >
            Se connecter
          </Link>
          <Link
            to="/auth/login"
            className={`${MK_BTN_PRIMARY} mt-2 w-full`}
            onClick={() => setOpen(false)}
          >
            Démarrer gratuitement
          </Link>
        </div>
      )}
    </header>
  )
}

import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

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
    <header ref={navRef} className={`mk-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="mk-container mk-nav-inner">
        <Link to="/" className="mk-logo">
          <span className="mk-logo-mark">B</span>
          <span>
            Bedones <span className="mk-logo-suffix">/ Moderator</span>
          </span>
        </Link>
        <nav className="mk-nav-links">
          <Link to="/" hash="features" className={current === 'home' ? 'active' : ''}>
            Fonctionnalités
          </Link>
          <Link to="/" hash="how">
            Comment ça marche
          </Link>
          <Link to="/pricing" className={current === 'pricing' ? 'active' : ''}>
            Tarifs
          </Link>
          <Link to="/blog" className={current === 'blog' ? 'active' : ''}>
            Blog
          </Link>
        </nav>
        <div className="mk-nav-right">
          <Link to="/auth/login" className="mk-login">
            Se connecter
          </Link>
          <Link to="/auth/login" className="mk-btn mk-btn-primary mk-btn-sm">
            Démarrer gratuitement
          </Link>
          <button
            className="mk-nav-toggle"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <div className={`mk-mobile-menu${open ? ' open' : ''}`}>
        <Link to="/" onClick={() => setOpen(false)}>
          Accueil
        </Link>
        <Link to="/" hash="features" onClick={() => setOpen(false)}>
          Fonctionnalités
        </Link>
        <Link to="/" hash="how" onClick={() => setOpen(false)}>
          Comment ça marche
        </Link>
        <Link to="/pricing" onClick={() => setOpen(false)}>
          Tarifs
        </Link>
        <Link to="/blog" onClick={() => setOpen(false)}>
          Blog
        </Link>
        <Link to="/auth/login" onClick={() => setOpen(false)}>
          Se connecter
        </Link>
        <Link to="/auth/login" className="mk-btn mk-btn-primary" onClick={() => setOpen(false)}>
          Démarrer gratuitement
        </Link>
      </div>
    </header>
  )
}

import { Link } from '@tanstack/react-router'
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'

export function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <div className="mk-footer-grid">
          <div className="mk-footer-brand">
            <Link to="/" className="mk-logo">
              <span className="mk-logo-mark">B</span>
              <span>
                Bedones <span className="mk-logo-suffix">/ Moderator</span>
              </span>
            </Link>
            <p className="tagline">
              L&apos;IA qui répond à vos clients sur toutes vos plateformes, 24h/24.
            </p>
          </div>
          <div className="mk-footer-col">
            <h5>Produit</h5>
            <ul>
              <li>
                <Link to="/" hash="features">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link to="/" hash="how">
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link to="/pricing">Tarifs</Link>
              </li>
              <li>
                <Link to="/auth/login">Démarrer gratuitement</Link>
              </li>
            </ul>
          </div>
          <div className="mk-footer-col">
            <h5>Ressources</h5>
            <ul>
              <li>
                <Link to="/blog">Blog</Link>
              </li>
              <li>
                <Link to="/auth/login">Se connecter</Link>
              </li>
            </ul>
          </div>
          <div className="mk-footer-col">
            <h5>Légal</h5>
            <ul>
              <li>
                <Link to="/legal/privacy">Confidentialité</Link>
              </li>
              <li>
                <Link to="/legal/conditions">Conditions</Link>
              </li>
              <li>
                <Link to="/legal/mentions">Mentions légales</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mk-footer-bottom">
          <div>© {new Date().getFullYear()} BEDONES SA — RC/DLN/2020/A/1418</div>
          <div className="mk-footer-socials">
            <a href="#" aria-label="Facebook">
              <FacebookIcon />
            </a>
            <a href="#" aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a href="#" aria-label="TikTok">
              <TikTokIcon />
            </a>
            <a href="#" aria-label="WhatsApp">
              <WhatsAppIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

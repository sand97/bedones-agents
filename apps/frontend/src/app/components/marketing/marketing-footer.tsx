import { Link } from '@tanstack/react-router'
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'
import { MK_CONTAINER, MK_LOGO, MK_LOGO_MARK } from './mk'

export function MarketingFooter() {
  return (
    // .mk-footer
    <footer className="bg-[var(--mk-text)] text-[#c7c2b8] py-20 pb-8 max-[768px]:py-14 max-[768px]:pb-6">
      <div className={MK_CONTAINER}>
        {/* .mk-footer-grid */}
        <div className="grid [grid-template-columns:1.4fr_1fr_1fr_1fr] gap-12 mb-14 max-[768px]:[grid-template-columns:1fr_1fr] max-[768px]:gap-8">
          {/* .mk-footer-brand */}
          <div className="max-[768px]:[grid-column:1/-1]">
            <Link to="/" className={`${MK_LOGO} text-white`}>
              <span className={`${MK_LOGO_MARK} bg-white text-[var(--mk-text)]`}>B</span>
              <span>
                Bedones <span className="text-[#9a958d] font-medium">/ Moderator</span>
              </span>
            </Link>
            <p className="mt-4 text-[14.5px] leading-[1.5] text-[#9a958d] max-w-[280px]">
              L&apos;IA qui répond à vos clients sur toutes vos plateformes, 24h/24.
            </p>
          </div>

          {/* .mk-footer-col — Produit */}
          <div>
            <h5 className="font-[family-name:var(--mk-font-body)] text-xs font-semibold tracking-[0.14em] uppercase text-[#9a958d] m-0 mb-[18px]">
              Produit
            </h5>
            <ul className="list-none m-0 p-0 flex flex-col gap-[10px]">
              <li>
                <Link
                  to="/"
                  hash="features"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link
                  to="/"
                  hash="how"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link
                  to="/pricing"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Tarifs
                </Link>
              </li>
              <li>
                <Link
                  to="/auth/login"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Démarrer gratuitement
                </Link>
              </li>
            </ul>
          </div>

          {/* .mk-footer-col — Ressources */}
          <div>
            <h5 className="font-[family-name:var(--mk-font-body)] text-xs font-semibold tracking-[0.14em] uppercase text-[#9a958d] m-0 mb-[18px]">
              Ressources
            </h5>
            <ul className="list-none m-0 p-0 flex flex-col gap-[10px]">
              <li>
                <Link
                  to="/blog"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/auth/login"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Se connecter
                </Link>
              </li>
            </ul>
          </div>

          {/* .mk-footer-col — Légal */}
          <div>
            <h5 className="font-[family-name:var(--mk-font-body)] text-xs font-semibold tracking-[0.14em] uppercase text-[#9a958d] m-0 mb-[18px]">
              Légal
            </h5>
            <ul className="list-none m-0 p-0 flex flex-col gap-[10px]">
              <li>
                <Link
                  to="/legal/privacy"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/conditions"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Conditions
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/mentions"
                  className="text-[14.5px] text-[#c7c2b8] transition-colors duration-150 hover:text-white"
                >
                  Mentions légales
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* .mk-footer-bottom */}
        <div className="border-t border-[#2a2a2a] pt-7 flex justify-between items-center flex-wrap gap-4 text-[13px] text-[#9a958d]">
          <div>© {new Date().getFullYear()} BEDONES SA — RC/DLN/2020/A/1418</div>
          {/* .mk-footer-socials */}
          <div className="flex gap-3">
            {[
              { href: '#', label: 'Facebook', Icon: FacebookIcon },
              { href: '#', label: 'Instagram', Icon: InstagramIcon },
              { href: '#', label: 'TikTok', Icon: TikTokIcon },
              { href: '#', label: 'WhatsApp', Icon: WhatsAppIcon },
            ].map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="w-8 h-8 border border-[#2a2a2a] rounded-[999px] inline-flex items-center justify-center text-[#c7c2b8] transition-all duration-150 hover:bg-white hover:border-white hover:text-[var(--mk-text)]"
              >
                <Icon className="w-[14px] h-[14px]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

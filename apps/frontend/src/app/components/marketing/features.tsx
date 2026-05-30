import type { CSSProperties } from 'react'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'
import { MK_CONTAINER, MK_EYEBROW, MK_BADGE_AI } from './mk'

const BRAND_FACEBOOK = '#1877F2'
const BRAND_INSTAGRAM = '#E1306C'
const BRAND_MESSENGER = '#0084FF'
const BRAND_TIKTOK = '#111111'
const BRAND_WHATSAPP = '#25D366'

/** Stagger helper. Returns inline style with the `--mk-d` CSS var that the
 *  `[data-anim="..."]` rules read as `animation-delay`. The argument is a
 *  delay in milliseconds — `d(640)` → 640ms delay. */
const d = (ms: number): CSSProperties => ({ ['--mk-d' as string]: `${ms}ms` })

// Shared class sets
// .mk-feature-row: desktop 2-col grid with area "visual head / visual body"
// .mk-feature-row.reverse: "head visual / body visual"
// Mobile: stacks as head / visual / body
const FEATURE_ROW_BASE =
  'grid gap-x-20 gap-y-0 items-center mb-[140px] last:mb-0 ' +
  'max-[768px]:grid-cols-1 max-[768px]:[grid-template-areas:"head"_"visual"_"body"] max-[768px]:gap-y-4 max-[768px]:mb-[72px]'

const FEATURE_ROW =
  FEATURE_ROW_BASE + ' grid-cols-2 [grid-template-areas:"visual_head"_"visual_body"]'

const FEATURE_ROW_REVERSE =
  FEATURE_ROW_BASE + ' grid-cols-2 [grid-template-areas:"head_visual"_"body_visual"]'

// .mk-feature-visual: aspect-ratio 5/4 box with rounded corners, centered content
const FEATURE_VISUAL_BASE =
  'mk-feature-visual [grid-area:visual] [aspect-ratio:5/4] rounded-[20px] p-9 flex items-center justify-center relative overflow-hidden ' +
  'max-[768px]:[aspect-ratio:auto] max-[768px]:p-4'

export function Features() {
  return (
    // .mk-features
    <section className="py-[120px] pb-20 max-[768px]:py-16 max-[768px]:pb-8" id="features">
      <div className={MK_CONTAINER}>
        {/* Feature 1 — Unified inbox */}
        <div className={`${FEATURE_ROW} mk-reveal`}>
          <div className="[grid-area:head] self-end pb-1 max-[768px]:self-auto max-[768px]:pb-0">
            <span className={MK_EYEBROW}>Un seul tableau de bord</span>
            <h2 className="text-[clamp(28px,3.6vw,44px)] mb-0 font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05] max-[768px]:text-[28px] max-[768px]:leading-[1.15]">
              Un seul agent, 5 plateformes
            </h2>
          </div>
          <div className={`${FEATURE_VISUAL_BASE} bg-[#ffe0d6]`}>
            {/* .mk-mini-inbox */}
            <div className="w-full bg-white rounded-2xl [box-shadow:var(--mk-shadow-card)] overflow-hidden [transform:rotate(-1.5deg)] max-[768px]:[transform:none]">
              <div
                className="flex items-center gap-2 px-4 py-3 border-b border-[var(--mk-border)] text-[13px] font-semibold"
                data-anim="fade"
                style={d(0)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Boîte unifiée
                <span className="ml-auto bg-[var(--mk-text)] text-white text-[11px] px-2 py-0.5 rounded-[999px]">
                  12
                </span>
              </div>

              {[
                {
                  bg: BRAND_WHATSAPP,
                  Icon: WhatsAppIcon,
                  nm: 'Aïcha K.',
                  hasAI: true,
                  pv: 'Le pagne wax en M est-il dispo ?',
                  tm: '16h25',
                  delay: 200,
                },
                {
                  bg: BRAND_INSTAGRAM,
                  Icon: InstagramIcon,
                  nm: 'Fatou Y.',
                  hasAI: false,
                  pv: 'Vous livrez à Cocody ce soir ?',
                  tm: '15h58',
                  delay: 400,
                },
                {
                  bg: BRAND_TIKTOK,
                  Icon: TikTokIcon,
                  nm: 'Jordan T.',
                  hasAI: true,
                  pv: "Trop beau le sac, c'est combien ?",
                  tm: '15h12',
                  delay: 600,
                },
                {
                  bg: BRAND_FACEBOOK,
                  Icon: FacebookIcon,
                  nm: 'Daniel Monti',
                  hasAI: false,
                  pv: 'Studio meublé Yaoundé — réservation ?',
                  tm: '16h24',
                  delay: 800,
                },
                {
                  bg: BRAND_MESSENGER,
                  Icon: MessengerIcon,
                  nm: 'Kossi B.',
                  hasAI: true,
                  pv: 'Merci pour la livraison rapide !',
                  tm: '14h30',
                  delay: 1000,
                },
              ].map(({ bg, Icon, nm, hasAI, pv, tm, delay }) => (
                <div
                  key={nm}
                  className="grid [grid-template-columns:28px_1fr_auto] gap-[10px] px-4 py-[10px] items-center border-b border-[var(--mk-border-soft)] last:border-b-0"
                  data-anim="left"
                  style={d(delay)}
                >
                  <span
                    className="w-7 h-7 rounded-[999px] inline-flex items-center justify-center text-white"
                    style={{ background: bg }}
                  >
                    <Icon className="w-[14px] h-[14px]" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold leading-[1.2]">
                      {nm}
                      {hasAI && <span className={MK_BADGE_AI}>IA</span>}
                    </div>
                    <div className="text-[11.5px] text-[var(--mk-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                      {pv}
                    </div>
                  </div>
                  <span className="text-[10.5px] text-[var(--mk-text-soft)]">{tm}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="[grid-area:body] self-start max-[768px]:self-auto">
            <p className="text-[17px] text-[var(--mk-text-muted)] m-0 mb-7">
              Gérez tous vos messages et commentaires depuis un tableau de bord unifié. Bedones
              Moderator répond en votre nom sur TikTok, Facebook, Messenger, Instagram et WhatsApp —
              en gardant votre ton.
            </p>
            <a
              href="#how"
              className="inline-flex items-center gap-2 font-semibold text-[var(--mk-text)] border-b-[1.5px] border-[var(--mk-text)] pb-0.5 text-[14.5px] transition-[gap] duration-200 hover:gap-3"
            >
              Découvrir la boîte unifiée →
            </a>
          </div>
        </div>

        {/* Feature 2 — Training */}
        <div className={`${FEATURE_ROW_REVERSE} mk-reveal`}>
          <div className="[grid-area:head] self-end pb-1 max-[768px]:self-auto max-[768px]:pb-0">
            <span className={MK_EYEBROW}>Apprentissage continu</span>
            <h2 className="text-[clamp(28px,3.6vw,44px)] mb-0 font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05] max-[768px]:text-[28px] max-[768px]:leading-[1.15]">
              Une IA formée sur votre business
            </h2>
          </div>
          <div className="[grid-area:body] self-start max-[768px]:self-auto">
            <p className="text-[17px] text-[var(--mk-text-muted)] m-0 mb-7">
              L&apos;agent apprend de vos conversations avec lui : vos produits, vos prix, vos
              conditions de livraison, votre façon de répondre aux objections. Pas de configuration
              complexe — parlez-lui comme à un collaborateur.
            </p>
            <a
              href="#how"
              className="inline-flex items-center gap-2 font-semibold text-[var(--mk-text)] border-b-[1.5px] border-[var(--mk-text)] pb-0.5 text-[14.5px] transition-[gap] duration-200 hover:gap-3"
            >
              Voir comment l&apos;agent apprend →
            </a>
          </div>
          <div className={`${FEATURE_VISUAL_BASE} bg-[#e2eedb]`}>
            {/* .mk-training-card */}
            <div className="w-full bg-white border border-[var(--mk-border)] rounded-[18px] [box-shadow:var(--mk-shadow-card)] overflow-hidden">
              <div
                className="px-[18px] py-[14px] border-b border-[var(--mk-border)] flex items-center gap-3"
                data-anim="fade"
                style={d(0)}
              >
                <span className="w-8 h-8 bg-[var(--mk-text)] text-white rounded-[9px] inline-flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold leading-[1.2]">
                    Formation de l&apos;agent
                  </div>
                  <div className="text-[11.5px] text-[var(--mk-text-soft)] mt-0.5">
                    Parlez-lui comme à un collègue
                  </div>
                </div>
                <span className="ml-auto bg-[#f5f5f5] text-[11px] font-semibold px-[10px] py-[5px] rounded-[999px] text-[var(--mk-text)]">
                  127 règles
                </span>
              </div>
              <div className="px-[18px] py-4 flex flex-col gap-[14px]">
                <div className="flex flex-col gap-1.5">
                  <div
                    className="bg-[#f5f5f5] self-start max-w-[92%] px-[13px] py-[9px] rounded-[14px] rounded-bl-[4px] text-[12.5px]"
                    data-anim="left"
                    style={d(220)}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--mk-text-soft)] mb-0.5">
                      Vous
                    </div>
                    On livre à Cocody pour 1 500 FCFA, sous 24h.
                  </div>
                  <div
                    className="bg-[var(--mk-text)] text-white self-end max-w-[92%] px-[13px] py-[9px] rounded-[14px] rounded-br-[4px] text-[12.5px] inline-flex items-center gap-2"
                    data-anim="right"
                    style={d(800)}
                  >
                    <svg
                      className="w-[14px] h-[14px] text-[#6be69a] flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Zone « Cocody » ajoutée
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div
                    className="bg-[#f5f5f5] self-start max-w-[92%] px-[13px] py-[9px] rounded-[14px] rounded-bl-[4px] text-[12.5px]"
                    data-anim="left"
                    style={d(1400)}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--mk-text-soft)] mb-0.5">
                      Vous
                    </div>
                    Commande &gt; 25 000 FCFA = livraison offerte sur Abidjan.
                  </div>
                  <div
                    className="bg-[var(--mk-text)] text-white self-end max-w-[92%] px-[13px] py-[9px] rounded-[14px] rounded-br-[4px] text-[12.5px] inline-flex items-center gap-2"
                    data-anim="right"
                    style={d(2000)}
                  >
                    <svg
                      className="w-[14px] h-[14px] text-[#6be69a] flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Règle promo enregistrée
                  </div>
                </div>
              </div>
              <div
                className="border-t border-[var(--mk-border)] px-[18px] py-3 flex gap-[18px] flex-wrap text-[11.5px] text-[var(--mk-text-soft)]"
                data-anim="up"
                style={d(2700)}
              >
                <span>
                  <strong className="text-[var(--mk-text)] font-bold mr-1">12</strong>zones
                  livraison
                </span>
                <span>
                  <strong className="text-[var(--mk-text)] font-bold mr-1">48</strong>produits
                </span>
                <span>
                  <strong className="text-[var(--mk-text)] font-bold mr-1">24</strong>tarifs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3 — Catalog */}
        <div className={`${FEATURE_ROW} mk-reveal`}>
          <div className="[grid-area:head] self-end pb-1 max-[768px]:self-auto max-[768px]:pb-0">
            <span className={MK_EYEBROW}>Catalogue natif</span>
            <h2 className="text-[clamp(28px,3.6vw,44px)] mb-0 font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05] max-[768px]:text-[28px] max-[768px]:leading-[1.15]">
              Votre catalogue WhatsApp, automatisé
            </h2>
          </div>
          <div className={`${FEATURE_VISUAL_BASE} bg-[#ffedd2]`}>
            {/* .mk-catalog-stage */}
            <div className="w-full grid gap-[14px] max-[768px]:gap-[10px]">
              {/* .mk-wa-card */}
              <div
                className="bg-white rounded-2xl [box-shadow:var(--mk-shadow-card)] overflow-hidden [transform:rotate(1.2deg)] max-[768px]:[transform:none]"
                data-anim="scale-bump"
                style={d(0)}
              >
                <div className="bg-[var(--color-brand-whatsapp)] text-white px-[14px] py-[10px] flex items-center gap-[10px] text-[12.5px] font-semibold">
                  <span className="w-[22px] h-[22px] rounded-[999px] bg-white text-[var(--color-brand-whatsapp)] inline-flex items-center justify-center">
                    <WhatsAppIcon className="w-[13px] h-[13px]" />
                  </span>
                  Catalogue WhatsApp Business
                </div>
                <div className="p-[14px] grid [grid-template-columns:78px_1fr] gap-3 items-center">
                  <div
                    className="w-[78px] h-[78px] rounded-xl bg-cover bg-center flex-shrink-0"
                    style={{
                      backgroundImage:
                        "url('https://images.unsplash.com/photo-1630084305900-b297cff3a608?w=300&q=80&auto=format&fit=crop')",
                    }}
                  />
                  <div>
                    <div className="text-[14px] font-bold">Pagne Wax Bleu Royal</div>
                    <div className="text-[13px] text-[var(--mk-text)] font-semibold mt-1">
                      12 500 FCFA{' '}
                      <span className="text-[var(--mk-text-soft)] font-medium line-through ml-1.5 text-xs">
                        15 000 FCFA
                      </span>
                    </div>
                    <span className="inline-block mt-1.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-[999px] bg-[#e5f4ec] text-[#047857]">
                      En stock · M / L / XL
                    </span>
                  </div>
                </div>
              </div>
              <div
                className="bg-white border border-[var(--mk-border)] rounded-2xl px-[14px] py-3 text-[12.5px] max-w-[80%] [box-shadow:var(--mk-shadow-soft)]"
                data-anim="left"
                style={d(550)}
              >
                Bonjour, quelles tailles vous avez en bleu ?
              </div>
              {/* .mk-typing-dots — animation managed by styles.css; hidden on mobile */}
              <div
                className="mk-typing-dots max-[768px]:hidden"
                data-anim="typing"
                style={d(1200)}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </div>
              <div
                className="bg-[#dcf8c6] rounded-2xl px-[14px] py-3 text-[12.5px] max-w-[88%] ml-auto text-[#1a1a1a] [box-shadow:var(--mk-shadow-soft)]"
                data-anim="after-typing"
                style={d(2800)}
              >
                <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.08em] uppercase text-[#047857] mb-1 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-[999px] before:bg-[#047857]">
                  Agent · WhatsApp
                </div>
                Disponible en M, L et XL à 12 500 FCFA (promo de 15 000). Combien de pièces
                souhaitez-vous commander ?
              </div>
            </div>
          </div>
          <div className="[grid-area:body] self-start max-[768px]:self-auto">
            <p className="text-[17px] text-[var(--mk-text-muted)] m-0 mb-7">
              Importez votre catalogue directement depuis votre compte WhatsApp Business. Votre
              numéro reste sur votre téléphone. L&apos;IA répond aux questions sur vos produits avec
              les bonnes infos, au bon moment.
            </p>
            <a
              href="#how"
              className="inline-flex items-center gap-2 font-semibold text-[var(--mk-text)] border-b-[1.5px] border-[var(--mk-text)] pb-0.5 text-[14.5px] transition-[gap] duration-200 hover:gap-3"
            >
              Connecter mon WhatsApp →
            </a>
          </div>
        </div>

        {/* Feature 4 — Feedback */}
        <div className={`${FEATURE_ROW_REVERSE} mk-reveal`}>
          <div className="[grid-area:head] self-end pb-1 max-[768px]:self-auto max-[768px]:pb-0">
            <span className={MK_EYEBROW}>Vous gardez le contrôle</span>
            <h2 className="text-[clamp(28px,3.6vw,44px)] mb-0 font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05] max-[768px]:text-[28px] max-[768px]:leading-[1.15]">
              Vous corrigez, l&apos;IA apprend
            </h2>
          </div>
          <div className="[grid-area:body] self-start max-[768px]:self-auto">
            <p className="text-[17px] text-[var(--mk-text-muted)] m-0 mb-7">
              Laissez un feedback sur chaque réponse générée — un pouce, une note, un commentaire.
              Bedones Moderator s&apos;améliore à chaque interaction et vous propose des mises à
              jour de son fonctionnement.
            </p>
            <a
              href="#how"
              className="inline-flex items-center gap-2 font-semibold text-[var(--mk-text)] border-b-[1.5px] border-[var(--mk-text)] pb-0.5 text-[14.5px] transition-[gap] duration-200 hover:gap-3"
            >
              Voir le système de feedback →
            </a>
          </div>
          <div className={`${FEATURE_VISUAL_BASE} bg-[#e6e3f6]`}>
            {/* .mk-feedback-stage */}
            <div className="w-full grid gap-[14px] max-[768px]:gap-[10px]">
              {/* .mk-fb-card */}
              <div
                className="bg-white border border-[var(--mk-border)] rounded-2xl p-4 [box-shadow:var(--mk-shadow-card)] max-[768px]:[transform:none]"
                data-anim="scale-bump"
                style={d(0)}
              >
                <div className="text-[13px] leading-[1.5]">
                  <div className="text-[var(--mk-text-soft)] text-[11.5px] mb-1.5">
                    Agent · Instagram DM · à Fatou Y.
                  </div>
                  « Bonjour Fatou ! Oui nous livrons à Cocody ce soir, jusqu&apos;à 19h. La
                  livraison est à 1 500 FCFA. Vous voulez que je prépare votre commande ? »
                </div>
                <div className="mt-3 pt-3 border-t border-dashed border-[var(--mk-border)] flex items-center gap-[10px] text-xs text-[var(--mk-text-muted)]">
                  Cette réponse vous convient ?
                  <div className="ml-auto inline-flex gap-1.5">
                    <button
                      className="w-[30px] h-[30px] rounded-lg border border-[#16a34a] bg-[#e5f4ec] text-[#047857] inline-flex items-center justify-center"
                      aria-label="J'aime"
                    >
                      <svg
                        className="w-[14px] h-[14px]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.3a2 2 0 002-1.7l1.4-9A2 2 0 0019.7 9H14zM7 22V11" />
                      </svg>
                    </button>
                    <button
                      className="w-[30px] h-[30px] rounded-lg border border-[var(--mk-border)] bg-white inline-flex items-center justify-center"
                      aria-label="Je n'aime pas"
                    >
                      <svg
                        className="w-[14px] h-[14px]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.7a2 2 0 00-2 1.7l-1.4 9A2 2 0 004.3 15H10zM17 2v13" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              {/* .mk-fb-proposal */}
              <div
                className="bg-white border border-[var(--mk-text)] rounded-2xl px-4 py-[14px] max-[768px]:[transform:none]"
                data-anim="up"
                style={d(900)}
              >
                <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--mk-text)] mb-2">
                  ✦ Nouvelle proposition de l&apos;IA
                </div>
                <h4 className="font-[family-name:var(--mk-font-display)] text-base font-semibold m-0 mb-1.5 tracking-[-0.01em]">
                  Ajouter une règle pour la livraison express
                </h4>
                <p className="text-[12.5px] text-[var(--mk-text-muted)] m-0 mb-3">
                  D&apos;après vos 12 dernières conversations, vous mentionnez souvent la livraison
                  avant 19h. Voulez-vous que je l&apos;intègre par défaut ?
                </p>
                <div className="flex gap-2">
                  <button className="bg-[var(--mk-text)] text-white text-xs font-semibold px-3 py-1.5 rounded-[999px]">
                    Accepter
                  </button>
                  <button className="bg-white text-[var(--mk-text)] border border-[var(--mk-border)] text-xs font-medium px-3 py-1.5 rounded-[999px]">
                    Plus tard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

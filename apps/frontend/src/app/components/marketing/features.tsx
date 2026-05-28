import type { CSSProperties } from 'react'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'

const BRAND_FACEBOOK = '#1877F2'
const BRAND_INSTAGRAM = '#E1306C'
const BRAND_MESSENGER = '#0084FF'
const BRAND_TIKTOK = '#111111'
const BRAND_WHATSAPP = '#25D366'

/** Stagger helper: returns a CSS variable consumed by the `[data-anim]` rules. */
const d = (n: number): CSSProperties => ({ ['--mk-d' as string]: String(n) })

export function Features() {
  return (
    <section className="mk-features" id="features">
      <div className="mk-container">
        {/* Feature 1 — Unified inbox: header fades in, then each conversation
            row slides in from the left in sequence (left-to-right reading). */}
        <div className="mk-feature-row mk-reveal">
          <div className="mk-feature-visual v1">
            <div className="mk-mini-inbox">
              <div className="mk-mini-inbox-head" data-anim="fade" style={d(0)}>
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
                <span className="count">12</span>
              </div>
              <div className="mk-mini-row" data-anim="left" style={d(1)}>
                <span className="av" style={{ background: BRAND_WHATSAPP }}>
                  <WhatsAppIcon />
                </span>
                <div>
                  <div className="nm">
                    Aïcha K. <span className="mk-badge-ai">IA</span>
                  </div>
                  <div className="pv">Le pagne wax en M est-il dispo ?</div>
                </div>
                <span className="tm">16h25</span>
              </div>
              <div className="mk-mini-row" data-anim="left" style={d(3)}>
                <span className="av" style={{ background: BRAND_INSTAGRAM }}>
                  <InstagramIcon />
                </span>
                <div>
                  <div className="nm">Fatou Y.</div>
                  <div className="pv">Vous livrez à Cocody ce soir ?</div>
                </div>
                <span className="tm">15h58</span>
              </div>
              <div className="mk-mini-row" data-anim="left" style={d(5)}>
                <span className="av" style={{ background: BRAND_TIKTOK }}>
                  <TikTokIcon />
                </span>
                <div>
                  <div className="nm">
                    Jordan T. <span className="mk-badge-ai">IA</span>
                  </div>
                  <div className="pv">Trop beau le sac, c&apos;est combien ?</div>
                </div>
                <span className="tm">15h12</span>
              </div>
              <div className="mk-mini-row" data-anim="left" style={d(7)}>
                <span className="av" style={{ background: BRAND_FACEBOOK }}>
                  <FacebookIcon />
                </span>
                <div>
                  <div className="nm">Daniel Monti</div>
                  <div className="pv">Studio meublé Yaoundé — réservation ?</div>
                </div>
                <span className="tm">16h24</span>
              </div>
              <div className="mk-mini-row" data-anim="left" style={d(9)}>
                <span className="av" style={{ background: BRAND_MESSENGER }}>
                  <MessengerIcon />
                </span>
                <div>
                  <div className="nm">
                    Kossi B. <span className="mk-badge-ai">IA</span>
                  </div>
                  <div className="pv">Merci pour la livraison rapide !</div>
                </div>
                <span className="tm">14h30</span>
              </div>
            </div>
          </div>
          <div className="mk-feature-text">
            <span className="mk-eyebrow">Un seul tableau de bord</span>
            <h2>Un seul agent, 5 plateformes</h2>
            <p>
              Gérez tous vos messages et commentaires depuis un tableau de bord unifié. Bedones
              Moderator répond en votre nom sur TikTok, Facebook, Messenger, Instagram et WhatsApp —
              en gardant votre ton.
            </p>
            <a href="#how" className="link">
              Découvrir la boîte unifiée →
            </a>
          </div>
        </div>

        {/* Feature 2 — Training: the user prompts ("Vous") slide in from the
            left, the agent confirmations ("Ajoutée") slide in from the right,
            mimicking a back-and-forth conversation. */}
        <div className="mk-feature-row reverse mk-reveal">
          <div className="mk-feature-text">
            <span className="mk-eyebrow">Apprentissage continu</span>
            <h2>Une IA formée sur votre business</h2>
            <p>
              L&apos;agent apprend de vos conversations avec lui : vos produits, vos prix, vos
              conditions de livraison, votre façon de répondre aux objections. Pas de configuration
              complexe — parlez-lui comme à un collaborateur.
            </p>
            <a href="#how" className="link">
              Voir comment l&apos;agent apprend →
            </a>
          </div>
          <div className="mk-feature-visual v2">
            <div className="mk-training-card">
              <div className="mk-training-head" data-anim="fade" style={d(0)}>
                <span className="ic">
                  <svg
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
                  <div className="title">Formation de l&apos;agent</div>
                  <div className="sub">Parlez-lui comme à un collègue</div>
                </div>
                <span className="counter">127 règles</span>
              </div>
              <div className="mk-training-body">
                <div className="mk-training-row">
                  <div className="mk-training-msg-out" data-anim="left" style={d(2)}>
                    <div className="by">Vous</div>
                    On livre à Cocody pour 1 500 FCFA, sous 24h.
                  </div>
                  <div className="mk-training-msg-in" data-anim="right" style={d(5)}>
                    <svg
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
                <div className="mk-training-row">
                  <div className="mk-training-msg-out" data-anim="left" style={d(9)}>
                    <div className="by">Vous</div>
                    Commande &gt; 25 000 FCFA = livraison offerte sur Abidjan.
                  </div>
                  <div className="mk-training-msg-in" data-anim="right" style={d(12)}>
                    <svg
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
              <div className="mk-training-stats" data-anim="up" style={d(16)}>
                <span>
                  <strong>12</strong>zones livraison
                </span>
                <span>
                  <strong>48</strong>produits
                </span>
                <span>
                  <strong>24</strong>tarifs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3 — Catalog: the product card eases in, then a customer
            question slides from the left, the agent shows a typing indicator
            for ~1s (the "agent is thinking" moment), and the AI reply slides
            in from the right after the dots disappear. */}
        <div className="mk-feature-row mk-reveal">
          <div className="mk-feature-visual v3">
            <div className="mk-catalog-stage">
              <div className="mk-wa-card" data-anim="scale" style={d(0)}>
                <div className="mk-wa-head">
                  <span className="ic">
                    <WhatsAppIcon />
                  </span>
                  Catalogue WhatsApp Business
                </div>
                <div className="mk-wa-body">
                  <div className="mk-wa-img" />
                  <div>
                    <div className="mk-wa-title">Pagne Wax Bleu Royal</div>
                    <div className="mk-wa-price">
                      12 500 FCFA <span className="old">15 000 FCFA</span>
                    </div>
                    <span className="mk-wa-tag">En stock · M / L / XL</span>
                  </div>
                </div>
              </div>
              <div className="mk-wa-question" data-anim="left" style={d(4)}>
                Bonjour, quelles tailles vous avez en bleu ?
              </div>
              {/* Typing dots: appears around 640ms after the question, runs the
                  show-hide keyframe (~1.7s) and fades out before the AI reply
                  arrives. Aria-hidden because it's a visual flourish. */}
              <div className="mk-typing-dots" data-anim="typing" style={d(8)} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="mk-wa-answer" data-anim="after-typing" style={d(22)}>
                <div className="ai-badge">Agent · WhatsApp</div>
                Disponible en M, L et XL à 12 500 FCFA (promo de 15 000). Combien de pièces
                souhaitez-vous commander ?
              </div>
            </div>
          </div>
          <div className="mk-feature-text">
            <span className="mk-eyebrow">Catalogue natif</span>
            <h2>Votre catalogue WhatsApp, automatisé</h2>
            <p>
              Importez votre catalogue directement depuis votre compte WhatsApp Business. Votre
              numéro reste sur votre téléphone. L&apos;IA répond aux questions sur vos produits avec
              les bonnes infos, au bon moment.
            </p>
            <a href="#how" className="link">
              Connecter mon WhatsApp →
            </a>
          </div>
        </div>

        {/* Feature 4 — Feedback: the message card scales in, the rate row
            slides up, and the AI proposal card rises in last, like a hint
            surfacing on top of the response. */}
        <div className="mk-feature-row reverse mk-reveal">
          <div className="mk-feature-text">
            <span className="mk-eyebrow">Vous gardez le contrôle</span>
            <h2>Vous corrigez, l&apos;IA apprend</h2>
            <p>
              Laissez un feedback sur chaque réponse générée — un pouce, une note, un commentaire.
              Bedones Moderator s&apos;améliore à chaque interaction et vous propose des mises à
              jour de son fonctionnement.
            </p>
            <a href="#how" className="link">
              Voir le système de feedback →
            </a>
          </div>
          <div className="mk-feature-visual v4">
            <div className="mk-feedback-stage">
              <div className="mk-fb-card" data-anim="scale" style={d(0)}>
                <div className="mk-fb-msg">
                  <div className="src">Agent · Instagram DM · à Fatou Y.</div>« Bonjour Fatou ! Oui
                  nous livrons à Cocody ce soir, jusqu&apos;à 19h. La livraison est à 1 500 FCFA.
                  Vous voulez que je prépare votre commande ? »
                </div>
                <div className="mk-fb-rate">
                  Cette réponse vous convient ?
                  <div className="btns">
                    <button className="mk-fb-btn up active" aria-label="J'aime">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.3a2 2 0 002-1.7l1.4-9A2 2 0 0019.7 9H14zM7 22V11" />
                      </svg>
                    </button>
                    <button className="mk-fb-btn" aria-label="Je n'aime pas">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.7a2 2 0 00-2 1.7l-1.4 9A2 2 0 004.3 15H10zM17 2v13" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="mk-fb-proposal" data-anim="up" style={d(8)}>
                <div className="head">✦ Nouvelle proposition de l&apos;IA</div>
                <h4>Ajouter une règle pour la livraison express</h4>
                <p>
                  D&apos;après vos 12 dernières conversations, vous mentionnez souvent la livraison
                  avant 19h. Voulez-vous que je l&apos;intègre par défaut ?
                </p>
                <div className="actions">
                  <button className="accept">Accepter</button>
                  <button className="dismiss">Plus tard</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

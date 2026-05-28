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

export function Showcase() {
  return (
    <section className="mk-showcase">
      <div className="mk-container">
        <div className="mk-showcase-head mk-reveal">
          <span className="mk-eyebrow">Le tableau de bord</span>
          <h2>Toutes vos conversations en un seul endroit</h2>
          <p>Répondez, supervisez, formez votre agent — depuis une interface unique et claire.</p>
        </div>

        <div className="mk-mockup-wrap mk-reveal">
          <div className="mk-mockup">
            <div className="mk-mockup-bar">
              <div className="dots">
                <span />
                <span />
                <span />
              </div>
              <div className="url">
                <span className="url-host">moderator.bedones.com</span>
                <span className="url-path"> / whatsapp</span>
              </div>
              <span className="user-pill">
                <span className="user-av">M</span>
                Mboa
                <span className="caret">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                  </svg>
                </span>
              </span>
            </div>
            <div className="mk-mockup-body">
              <aside className="mk-mockup-sidebar">
                <div className="ws">
                  <span className="ws-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 21V9l9-6 9 6v12" />
                      <path d="M9 21v-6h6v6" />
                    </svg>
                  </span>
                  <div className="ws-meta">
                    <div className="ws-name">Ma Boutique Abidjan</div>
                    <div className="ws-plan">Pro</div>
                  </div>
                  <span className="ws-caret">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                    </svg>
                  </span>
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6z" />
                      <path d="M19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8z" />
                    </svg>
                  </span>
                  Mes Agents
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 7h16v10H4z" />
                      <path d="M9 11v2M15 11v2" />
                    </svg>
                  </span>
                  Tickets
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 7l1-3h14l1 3v2a2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0V7zM5 11v9h14v-9" />
                    </svg>
                  </span>
                  Catalogues
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="7" cy="7" r="3" />
                      <circle cx="17" cy="17" r="3" />
                      <path d="M19 5L5 19" />
                    </svg>
                  </span>
                  Promotions
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="3" y="8" width="18" height="4" />
                      <path d="M4 12v9h16v-9M12 8v13" />
                      <path d="M7.5 8a2.5 2.5 0 010-5C9 3 12 5 12 8c0-3 3-5 4.5-5a2.5 2.5 0 010 5" />
                    </svg>
                  </span>
                  Fidélité
                </div>

                <div className="group-label">Messageries</div>
                <div className="mk-nav-item active">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_WHATSAPP }} />
                  </span>
                  WhatsApp
                  <span className="badge">2</span>
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_INSTAGRAM }} />
                  </span>
                  Instagram DM
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_MESSENGER }} />
                  </span>
                  Messenger
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_TIKTOK }} />
                  </span>
                  TikTok DM
                </div>

                <div className="group-label">Commentaires</div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_FACEBOOK }} />
                  </span>
                  Facebook
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_INSTAGRAM }} />
                  </span>
                  Instagram
                </div>
                <div className="mk-nav-item">
                  <span className="ico">
                    <span className="dot-mark" style={{ background: BRAND_TIKTOK }} />
                  </span>
                  TikTok
                </div>
              </aside>

              <div className="mk-mockup-main">
                <div className="mk-mockup-list">
                  <div className="mk-list-head">
                    <div className="mk-list-filters">
                      <span className="pill active">All</span>
                      <span className="pill">Unread</span>
                      <span className="pill">Labels</span>
                      <span className="tools">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M14.7 6.3a4 4 0 015.7 5.7l-9.4 9.4-5.7 1.4 1.4-5.7 9.4-9.4z" />
                        </svg>
                        Tools
                      </span>
                    </div>
                  </div>
                  <div className="mk-convo active">
                    <div className="mk-avatar av-green">L</div>
                    <div className="mk-convo-meta">
                      <div className="mk-convo-row1">
                        <span className="mk-convo-name">Laure Epoupa</span>
                        <span className="mk-convo-time">20/04</span>
                      </div>
                      <div className="mk-convo-preview">
                        Merci. Dans quelle ville souhaitez-vous être livrée ?
                      </div>
                    </div>
                  </div>
                  <div className="mk-convo">
                    <div className="mk-avatar av-blue">A</div>
                    <div className="mk-convo-meta">
                      <div className="mk-convo-row1">
                        <span className="mk-convo-name">Aisha Mbala</span>
                        <span className="mk-convo-time">20/04</span>
                      </div>
                      <div className="mk-convo-preview">
                        La livraison à Douala est offerte dès 25 000 FCFA.
                      </div>
                    </div>
                  </div>
                  <div className="mk-convo">
                    <div className="mk-avatar av-yellow">J</div>
                    <div className="mk-convo-meta">
                      <div className="mk-convo-row1">
                        <span className="mk-convo-name">Jean-Paul Nkoa</span>
                        <span className="mk-convo-time">19/04</span>
                      </div>
                      <div className="mk-convo-preview">
                        Je vérifie le stock pour vous, deux minutes.
                      </div>
                    </div>
                  </div>
                  <div className="mk-convo">
                    <div className="mk-avatar av-coral">F</div>
                    <div className="mk-convo-meta">
                      <div className="mk-convo-row1">
                        <span className="mk-convo-name">Fatou Y.</span>
                        <span className="mk-convo-time">18/04</span>
                      </div>
                      <div className="mk-convo-preview">
                        Merci beaucoup, c&apos;est bien noté pour vendredi.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mk-mockup-thread">
                  <div className="mk-thread-head">
                    <div className="mk-avatar av-green">L</div>
                    <div>
                      <div className="title">Laure Epoupa</div>
                      <div className="sub">+237 695 33 33 33</div>
                    </div>
                  </div>
                  <div className="mk-thread-body">
                    <span className="mk-date-pill">20 avril</span>
                    <div className="mk-bubble in has-image">
                      <div
                        className="mk-bubble-image"
                        style={{
                          backgroundImage:
                            "url('https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&q=80&auto=format&fit=crop')",
                        }}
                      />
                      Bonjour, vous avez encore ce pantalon Jean ?
                      <div className="meta">
                        <span>00:52</span>
                      </div>
                    </div>
                    <div className="mk-bubble ai">
                      Oui, il est disponible. Quelles tailles et combien de pièces souhaitez-vous ?
                      <div className="meta">
                        <span>00:53</span>
                        <span className="ai-tag">by AI</span>
                        <span className="check">
                          <svg
                            viewBox="0 0 16 13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 6.5 L4 9.5 L10 3.5 M5.5 6.5 L8.5 9.5 L14.5 3.5" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    <div className="mk-bubble in">
                      Taille 38, une seule pièce.
                      <div className="meta">
                        <span>00:55</span>
                      </div>
                    </div>
                    <div className="mk-bubble ai">
                      Merci. Dans quelle ville souhaitez-vous être livrée ?
                      <div className="meta">
                        <span>00:56</span>
                        <span className="ai-tag">by AI</span>
                        <span className="check">
                          <svg
                            viewBox="0 0 16 13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 6.5 L4 9.5 L10 3.5 M5.5 6.5 L8.5 9.5 L14.5 3.5" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mk-platforms-row">
          <div className="mk-platforms-inner">
            <span className="mk-platforms-label">5 plateformes connectées</span>
            <div className="mk-platforms">
              <span className="mk-plat-item fb">
                <span className="mk-plat-tile">
                  <FacebookIcon />
                </span>
                Facebook
              </span>
              <span className="mk-plat-item ig">
                <span className="mk-plat-tile">
                  <InstagramIcon />
                </span>
                Instagram
              </span>
              <span className="mk-plat-item ms">
                <span className="mk-plat-tile">
                  <MessengerIcon />
                </span>
                Messenger
              </span>
              <span className="mk-plat-item tt">
                <span className="mk-plat-tile">
                  <TikTokIcon />
                </span>
                TikTok
              </span>
              <span className="mk-plat-item wa">
                <span className="mk-plat-tile">
                  <WhatsAppIcon />
                </span>
                WhatsApp
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

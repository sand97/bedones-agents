import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/marketing/social-icons'
import { MK_CONTAINER, MK_EYEBROW } from './mk'

const BRAND_FACEBOOK = '#1877F2'
const BRAND_INSTAGRAM = '#E1306C'
const BRAND_MESSENGER = '#0084FF'
const BRAND_TIKTOK = '#111111'
const BRAND_WHATSAPP = '#25D366'

export function Showcase() {
  return (
    // .mk-showcase
    <section className="py-10 pb-20 bg-[var(--mk-bg)] max-[768px]:py-6 max-[768px]:pb-14">
      <div className={MK_CONTAINER}>
        {/* .mk-showcase-head */}
        <div className="text-center max-w-[720px] mx-auto mb-12 mk-reveal max-[768px]:mb-8">
          <span className={MK_EYEBROW}>Le tableau de bord</span>
          <h2 className="text-[clamp(28px,3.4vw,44px)] mb-[14px] font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05]">Toutes vos conversations en un seul endroit</h2>
          <p className="text-[var(--mk-text-muted)] text-base m-0">Répondez, supervisez, formez votre agent — depuis une interface unique et claire.</p>
        </div>

        {/* .mk-mockup-wrap */}
        <div className="mt-16 relative mk-reveal max-[768px]:mt-0">
          {/* .mk-mockup */}
          <div className="mk-mockup relative bg-[var(--mk-surface)] border border-[var(--mk-border)] rounded-[24px] [box-shadow:0_30px_80px_-20px_rgba(20,15,10,0.18),0_8px_24px_rgba(20,15,10,0.06)] overflow-hidden max-w-[1080px] mx-auto">

            {/* .mk-mockup-bar */}
            <div className="flex items-center gap-2 px-[18px] py-[14px] border-b border-[var(--mk-border)] bg-[var(--mk-surface)]">
              <div className="flex gap-1.5">
                <span className="w-[11px] h-[11px] rounded-[999px] bg-[#ff5f57]" />
                <span className="w-[11px] h-[11px] rounded-[999px] bg-[#febc2e]" />
                <span className="w-[11px] h-[11px] rounded-[999px] bg-[#28c840]" />
              </div>
              <div className="text-xs text-[var(--mk-text-soft)] ml-[14px] font-[ui-monospace,'SF_Mono',Menlo,monospace]">
                <span className="url-host max-[768px]:hidden">moderator.bedones.com</span>
                <span className="url-path"> / whatsapp</span>
              </div>
              <span className="ml-auto inline-flex items-center gap-2 bg-white border border-[var(--mk-border)] rounded-[999px] py-1 px-[10px] pl-1 text-xs font-medium text-[var(--mk-text)]">
                <span className="w-[22px] h-[22px] rounded-[999px] bg-[#98c97e] text-white inline-flex items-center justify-center text-[10.5px] font-bold">M</span>
                Mboa
                <span className="text-[var(--mk-text-soft)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                  </svg>
                </span>
              </span>
            </div>

            {/* .mk-mockup-body */}
            <div className="grid [grid-template-columns:240px_1fr] min-h-[620px] max-[768px]:[grid-template-columns:1fr]">

              {/* .mk-mockup-sidebar — hidden on mobile */}
              <aside className="bg-[#fafafa] border-r border-[var(--mk-border)] p-[14px_12px] flex flex-col gap-0.5 max-[768px]:hidden">
                <div className="flex items-center gap-[10px] p-2 mb-[14px] rounded-[10px] border border-[var(--mk-border)] bg-white">
                  <span className="w-8 h-8 rounded-[9px] bg-[#f5f5f5] text-[var(--mk-text)] inline-flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21V9l9-6 9 6v12" />
                      <path d="M9 21v-6h6v6" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold leading-[1.2]">Ma Boutique Abidjan</div>
                    <div className="text-[10.5px] text-[var(--mk-text-soft)] mt-px">Pro</div>
                  </div>
                  <span className="text-[var(--mk-text-soft)] ml-auto flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                    </svg>
                  </span>
                </div>

                {/* nav items */}
                {[
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6z" /><path d="M19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8z" /></svg>, label: 'Mes Agents' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16v10H4z" /><path d="M9 11v2M15 11v2" /></svg>, label: 'Tickets' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7l1-3h14l1 3v2a2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0V7zM5 11v9h14v-9" /></svg>, label: 'Catalogues' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M19 5L5 19" /></svg>, label: 'Promotions' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="8" width="18" height="4" /><path d="M4 12v9h16v-9M12 8v13" /><path d="M7.5 8a2.5 2.5 0 010-5C9 3 12 5 12 8c0-3 3-5 4.5-5a2.5 2.5 0 010 5" /></svg>, label: 'Fidélité' },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-[10px] px-[10px] py-2 rounded-lg text-[13px] text-[var(--mk-text)]">
                    <span className="w-[18px] h-[18px] inline-flex items-center justify-center">
                      <span className="w-4 h-4 block [&>svg]:w-full [&>svg]:h-full">{icon}</span>
                    </span>
                    {label}
                  </div>
                ))}

                <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)] px-2 pt-3 pb-1">Messageries</div>
                <div className="flex items-center gap-[10px] px-[10px] py-2 rounded-lg text-[13px] text-[var(--mk-text)] bg-white border border-[var(--mk-border)] [box-shadow:0_1px_2px_rgba(0,0,0,0.03)] font-bold">
                  <span className="w-[18px] h-[18px] inline-flex items-center justify-center">
                    <span className="w-[9px] h-[9px] rounded-[999px] inline-block" style={{ background: BRAND_WHATSAPP }} />
                  </span>
                  WhatsApp
                  <span className="ml-auto text-[11px] bg-[var(--mk-text)] text-white py-[2px] px-[7px] rounded-[999px] font-semibold">2</span>
                </div>
                {[
                  { color: BRAND_INSTAGRAM, label: 'Instagram DM' },
                  { color: BRAND_MESSENGER, label: 'Messenger' },
                  { color: BRAND_TIKTOK, label: 'TikTok DM' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-[10px] px-[10px] py-2 rounded-lg text-[13px] text-[var(--mk-text)]">
                    <span className="w-[18px] h-[18px] inline-flex items-center justify-center">
                      <span className="w-[9px] h-[9px] rounded-[999px] inline-block" style={{ background: color }} />
                    </span>
                    {label}
                  </div>
                ))}

                <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)] px-2 pt-3 pb-1">Commentaires</div>
                {[
                  { color: BRAND_FACEBOOK, label: 'Facebook' },
                  { color: BRAND_INSTAGRAM, label: 'Instagram' },
                  { color: BRAND_TIKTOK, label: 'TikTok' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-[10px] px-[10px] py-2 rounded-lg text-[13px] text-[var(--mk-text)]">
                    <span className="w-[18px] h-[18px] inline-flex items-center justify-center">
                      <span className="w-[9px] h-[9px] rounded-[999px] inline-block" style={{ background: color }} />
                    </span>
                    {label}
                  </div>
                ))}
              </aside>

              {/* .mk-mockup-main */}
              <div className="grid [grid-template-columns:280px_1fr] min-h-full max-[768px]:[grid-template-columns:1fr]">

                {/* .mk-mockup-list — hidden on mobile */}
                <div className="border-r border-[var(--mk-border)] bg-white max-[768px]:hidden">
                  <div className="px-[18px] py-[18px] pb-[14px] border-b border-[var(--mk-border)] flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-medium px-[11px] py-[5px] rounded-[999px] border border-[var(--mk-border)] text-[var(--mk-text)] bg-[var(--mk-text)] text-white border-[var(--mk-text)]">All</span>
                      <span className="text-[11.5px] font-medium px-[11px] py-[5px] rounded-[999px] border border-[var(--mk-border)] text-[var(--mk-text)] bg-white">Unread</span>
                      <span className="text-[11.5px] font-medium px-[11px] py-[5px] rounded-[999px] border border-[var(--mk-border)] text-[var(--mk-text)] bg-white">Labels</span>
                      <span className="ml-auto inline-flex items-center gap-[5px] text-[11.5px] text-[var(--mk-text-muted)] font-medium">
                        <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14.7 6.3a4 4 0 015.7 5.7l-9.4 9.4-5.7 1.4 1.4-5.7 9.4-9.4z" />
                        </svg>
                        Tools
                      </span>
                    </div>
                  </div>

                  {/* Conversation rows */}
                  {[
                    { anim: 'left', delay: '120ms', av: 'av-green', avBg: '#98c97e', letter: 'L', name: 'Laure Epoupa', time: '20/04', preview: 'Merci. Dans quelle ville souhaitez-vous être livrée ?', active: true },
                    { anim: 'left', delay: '260ms', av: 'av-blue', avBg: '#6ba9d4', letter: 'A', name: 'Aisha Mbala', time: '20/04', preview: 'La livraison à Douala est offerte dès 25 000 FCFA.', active: false },
                    { anim: 'left', delay: '400ms', av: 'av-yellow', avBg: '#ecc865', letter: 'J', name: 'Jean-Paul Nkoa', time: '19/04', preview: 'Je vérifie le stock pour vous, deux minutes.', active: false },
                    { anim: 'left', delay: '540ms', av: 'av-coral', avBg: '#e18a77', letter: 'F', name: 'Fatou Y.', time: '18/04', preview: "Merci beaucoup, c'est bien noté pour vendredi.", active: false },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className={`px-[18px] py-[14px] grid [grid-template-columns:36px_1fr] gap-3 border-b border-[var(--mk-border-soft)] items-start${c.active ? ' bg-[#f5f5f5]' : ''}`}
                      data-anim={c.anim}
                      style={{ ['--mk-d' as string]: c.delay }}
                    >
                      <div className="w-9 h-9 rounded-[999px] text-white inline-flex items-center justify-center font-semibold text-[13.5px] flex-shrink-0" style={{ background: c.avBg }}>{c.letter}</div>
                      <div className="min-w-0 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-semibold leading-[1.2]">{c.name}</span>
                          <span className="text-[11.5px] text-[var(--mk-text-soft)] font-medium flex-shrink-0">{c.time}</span>
                        </div>
                        <div className="text-[12.5px] text-[var(--mk-text-muted)] mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{c.preview}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* .mk-mockup-thread */}
                <div className="bg-white flex flex-col">
                  <div className="px-[22px] py-4 border-b border-[var(--mk-border)] bg-white flex items-center gap-3" data-anim="fade" style={{ ['--mk-d' as string]: '120ms' }}>
                    <div className="w-9 h-9 rounded-[999px] bg-[#98c97e] text-white inline-flex items-center justify-center font-semibold text-[13.5px] flex-shrink-0">L</div>
                    <div>
                      <div className="text-[14.5px] font-semibold">Laure Epoupa</div>
                      <div className="text-xs text-[var(--mk-text-soft)] mt-0.5">+237 695 33 33 33</div>
                    </div>
                  </div>

                  <div className="px-7 py-[22px] flex flex-col gap-[10px] flex-1 bg-white">
                    <span className="self-center text-[11.5px] text-[var(--mk-text-muted)] bg-[#f5f5f5] px-3 py-[5px] rounded-[999px] my-1 mb-2 font-medium" data-anim="fade" style={{ ['--mk-d' as string]: '300ms' }}>
                      20 avril
                    </span>
                    <div className="max-w-[78%] px-[14px] pt-[11px] pb-2 rounded-2xl text-[13.5px] leading-[1.45] bg-white border border-[var(--mk-border)] rounded-bl-[6px] self-start pt-[6px]" data-anim="left" style={{ ['--mk-d' as string]: '500ms' }}>
                      <div className="w-[200px] h-[150px] rounded-[10px] bg-cover bg-center bg-[#e5e5e5] mb-2" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&q=80&auto=format&fit=crop')" }} />
                      Bonjour, vous avez encore ce pantalon Jean ?
                      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[var(--mk-text-soft)] justify-start">
                        <span>00:52</span>
                      </div>
                    </div>
                    <div className="max-w-[78%] px-[14px] pt-[11px] pb-2 rounded-2xl text-[13.5px] leading-[1.45] bg-[#f5f5f5] text-[var(--mk-text)] rounded-br-[6px] self-end" data-anim="right" style={{ ['--mk-d' as string]: '1200ms' }}>
                      Oui, il est disponible. Quelles tailles et combien de pièces souhaitez-vous ?
                      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[var(--mk-text-soft)] justify-end">
                        <span>00:53</span>
                        <span className="font-medium text-[var(--mk-text-soft)]">by AI</span>
                        <span className="[&>svg]:w-[14px] [&>svg]:h-[10px]">
                          <svg viewBox="0 0 16 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 6.5 L4 9.5 L10 3.5 M5.5 6.5 L8.5 9.5 L14.5 3.5" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    <div className="max-w-[78%] px-[14px] pt-[11px] pb-2 rounded-2xl text-[13.5px] leading-[1.45] bg-white border border-[var(--mk-border)] rounded-bl-[6px] self-start" data-anim="left" style={{ ['--mk-d' as string]: '1900ms' }}>
                      Taille 38, une seule pièce.
                      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[var(--mk-text-soft)] justify-start">
                        <span>00:55</span>
                      </div>
                    </div>
                    <div className="max-w-[78%] px-[14px] pt-[11px] pb-2 rounded-2xl text-[13.5px] leading-[1.45] bg-[#f5f5f5] text-[var(--mk-text)] rounded-br-[6px] self-end" data-anim="right" style={{ ['--mk-d' as string]: '2600ms' }}>
                      Merci. Dans quelle ville souhaitez-vous être livrée ?
                      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[var(--mk-text-soft)] justify-end">
                        <span>00:56</span>
                        <span className="font-medium text-[var(--mk-text-soft)]">by AI</span>
                        <span className="[&>svg]:w-[14px] [&>svg]:h-[10px]">
                          <svg viewBox="0 0 16 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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

        {/* .mk-platforms-row */}
        <div className="mk-platforms-row mt-14 py-7 border-t border-b border-[var(--mk-border)]">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <span className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--mk-text-soft)]" data-anim="fade">
              5 plateformes connectées
            </span>
            <div className="flex gap-7 items-center flex-wrap max-[768px]:gap-5">
              {[
                { cls: 'fb', icon: <FacebookIcon />, label: 'Facebook', bg: BRAND_FACEBOOK, delay: '120ms' },
                { cls: 'ig', icon: <InstagramIcon />, label: 'Instagram', delay: '220ms', gradient: true },
                { cls: 'ms', icon: <MessengerIcon />, label: 'Messenger', delay: '320ms', msGradient: true },
                { cls: 'tt', icon: <TikTokIcon />, label: 'TikTok', bg: BRAND_TIKTOK, delay: '420ms' },
                { cls: 'wa', icon: <WhatsAppIcon />, label: 'WhatsApp', bg: BRAND_WHATSAPP, delay: '520ms' },
              ].map(({ cls, icon, label, bg, delay, gradient, msGradient }) => (
                <span
                  key={cls}
                  className={`mk-plat-item ${cls} inline-flex items-center gap-[10px] text-[var(--mk-text)] text-[14px] font-semibold transition-transform duration-150 ease-[ease] hover:-translate-y-px max-[768px]:text-[0px]`}
                  data-anim="scale-bump"
                  style={{ ['--mk-d' as string]: delay }}
                >
                  <span
                    className="w-8 h-8 rounded-[10px] inline-flex items-center justify-center text-white flex-shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px] max-[768px]:text-[14px]"
                    style={
                      gradient
                        ? { background: 'radial-gradient(circle at 30% 110%, #ffdc80 0%, #fcaf45 5%, #f77737 15%, #f56040 25%, #e1306c 45%, #c13584 60%, #833ab4 75%, #5851db 90%)' }
                        : msGradient
                          ? { background: 'radial-gradient(circle at 30% 110%, #00b2ff 0%, #006aff 40%, #a033ff 100%)' }
                          : { background: bg }
                    }
                  >
                    {icon}
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

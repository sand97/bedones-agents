import { Link } from '@tanstack/react-router'
import { MK_CONTAINER, MK_EYEBROW, MK_BTN_WHITE } from './mk'

export function HowItWorks() {
  return (
    // .mk-how
    <section
      className="bg-[var(--mk-surface-tinted)] py-[120px] border-t border-b border-[var(--mk-border)] max-[768px]:py-16"
      id="how"
    >
      <div className={MK_CONTAINER}>
        {/* .mk-how-head */}
        <div className="text-center max-w-[720px] mx-auto mb-16 mk-reveal max-[768px]:mb-12">
          <span className={MK_EYEBROW}>Comment ça marche</span>
          <h2 className="text-[clamp(32px,4vw,52px)] mb-4 font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05]">
            Votre agent prêt en moins de 10 minutes
          </h2>
          <p className="text-[var(--mk-text-muted)] text-[17px] m-0">
            Pas de configuration complexe. Pas de formulaires interminables. Trois étapes, et votre
            IA commence à travailler.
          </p>
        </div>

        {/* .mk-steps */}
        <div className="grid [grid-template-columns:repeat(3,1fr)] gap-6 relative max-[768px]:[grid-template-columns:1fr]">
          {/* Step 1 */}
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] p-8 relative mk-reveal">
            <div className="font-[family-name:var(--mk-font-display)] text-[60px] font-bold leading-[1] text-[var(--mk-text)] tracking-[-0.04em] mb-6">
              01
            </div>
            <h3 className="text-[22px] font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] m-0 mb-[10px]">
              Connectez vos comptes
            </h3>
            <p className="text-[var(--mk-text-muted)] text-[15px] m-0">
              Reliez TikTok, Facebook, Instagram, Messenger et WhatsApp en quelques clics. Votre
              numéro WhatsApp reste sur votre téléphone.
            </p>
            {/* .mk-step-arrow */}
            <div className="absolute right-[-18px] top-[60px] text-[var(--mk-text-soft)] z-[2] max-[768px]:hidden">
              <svg
                className="w-7 h-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] p-8 relative mk-reveal">
            <div className="font-[family-name:var(--mk-font-display)] text-[60px] font-bold leading-[1] text-[var(--mk-text)] tracking-[-0.04em] mb-6">
              02
            </div>
            <h3 className="text-[22px] font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] m-0 mb-[10px]">
              Formez votre agent
            </h3>
            <p className="text-[var(--mk-text-muted)] text-[15px] m-0">
              Partagez votre catalogue, vos process, votre ton. L&apos;IA apprend en discutant avec
              vous — comme à un collaborateur.
            </p>
            <div className="absolute right-[-18px] top-[60px] text-[var(--mk-text-soft)] z-[2] max-[768px]:hidden">
              <svg
                className="w-7 h-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] p-8 relative mk-reveal">
            <div className="font-[family-name:var(--mk-font-display)] text-[60px] font-bold leading-[1] text-[var(--mk-text)] tracking-[-0.04em] mb-6">
              03
            </div>
            <h3 className="text-[22px] font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] m-0 mb-[10px]">
              Laissez-le travailler
            </h3>
            <p className="text-[var(--mk-text-muted)] text-[15px] m-0">
              Votre agent répond, engage, et s&apos;améliore. Vous gardez le contrôle total :
              approuvez, corrigez, modifiez quand vous voulez.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function StatsAndTestimonial() {
  return (
    // .mk-stats
    <section className="py-[120px] pb-[60px] max-[768px]:py-16 max-[768px]:pb-10">
      <div className={MK_CONTAINER}>
        {/* .mk-stats-grid */}
        <div className="grid [grid-template-columns:repeat(3,1fr)] gap-5 mb-20 max-[768px]:[grid-template-columns:1fr] max-[768px]:mb-10">
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] px-8 py-9 mk-reveal max-[768px]:px-6 max-[768px]:py-7">
            <div className="font-[family-name:var(--mk-font-display)] font-bold text-[clamp(40px,5vw,60px)] leading-[1] tracking-[-0.03em] text-[var(--mk-text)] mb-[14px]">
              5<span className="text-[var(--mk-text-muted)] font-semibold"> plateformes</span>
            </div>
            <div className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)]">
              connectées en natif
            </div>
          </div>
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] px-8 py-9 mk-reveal max-[768px]:px-6 max-[768px]:py-7">
            <div className="font-[family-name:var(--mk-font-display)] font-bold text-[clamp(40px,5vw,60px)] leading-[1] tracking-[-0.03em] text-[var(--mk-text)] mb-[14px]">
              &lt; 2<span className="text-[var(--mk-text-muted)] font-semibold"> min</span>
            </div>
            <div className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)]">
              de temps de réponse moyen
            </div>
          </div>
          <div className="bg-white border border-[var(--mk-border)] rounded-[20px] px-8 py-9 mk-reveal max-[768px]:px-6 max-[768px]:py-7">
            <div className="font-[family-name:var(--mk-font-display)] font-bold text-[clamp(40px,5vw,60px)] leading-[1] tracking-[-0.03em] text-[var(--mk-text)] mb-[14px]">
              3×
              <span className="text-[var(--mk-text-muted)] font-semibold" />
            </div>
            <div className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-[var(--mk-text-soft)]">
              plus de clients traités par jour
            </div>
          </div>
        </div>

        {/* .mk-testimonial */}
        <div className="bg-[var(--mk-text)] text-white rounded-[28px] px-14 py-16 grid [grid-template-columns:1fr_auto] gap-10 items-end relative overflow-hidden mk-reveal max-[768px]:px-7 max-[768px]:py-10 max-[768px]:[grid-template-columns:1fr]">
          {/* ::before quotation mark */}
          <span
            className="pointer-events-none absolute top-0 left-9 font-[family-name:var(--mk-font-display)] leading-[1] text-white opacity-[0.08] select-none"
            style={{ fontSize: '280px' }}
            aria-hidden="true"
          >
            &ldquo;
          </span>
          <blockquote
            className="font-[family-name:var(--mk-font-display)] font-semibold text-[clamp(22px,2.4vw,32px)] leading-[1.3] tracking-[-0.015em] m-0 max-w-[760px] relative"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            Depuis que j&apos;utilise Bedones Moderator, je ne perds plus aucun message sur WhatsApp
            ni sur TikTok. Mon agent connaît tout mon catalogue par cœur.
          </blockquote>
          <div className="flex items-center gap-[14px] relative">
            <div className="w-[52px] h-[52px] rounded-[999px] bg-white text-[var(--mk-text)] inline-flex items-center justify-center font-bold text-[18px]">
              AK
            </div>
            <div>
              <div className="font-semibold text-[15px]">Aïcha K.</div>
              <div className="text-[#b8b3aa] text-[13px] mt-0.5">Vendeuse en ligne · Abidjan</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function FinalCTA() {
  return (
    // .mk-final-cta
    <section className="bg-[var(--mk-text)] text-white py-[120px] relative overflow-hidden max-[768px]:py-[72px]">
      {/* ::before grid overlay */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, #000 30%, transparent 80%)',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, #000 30%, transparent 80%)',
        }}
        aria-hidden="true"
      />
      <div className={MK_CONTAINER}>
        <div className="relative text-center max-w-[760px] mx-auto">
          <h2 className="text-[clamp(36px,5vw,60px)] mb-[18px] text-white font-[family-name:var(--mk-font-display)] font-bold tracking-[-0.035em] leading-[1.05]">
            Prêt à automatiser votre service client&nbsp;?
          </h2>
          <p className="text-[18px] opacity-[0.92] m-0 mb-9">
            Commencez gratuitement. Pas de carte bancaire requise.
          </p>
          <Link to="/auth/login" className={MK_BTN_WHITE}>
            Créer mon agent maintenant →
          </Link>
        </div>
      </div>
    </section>
  )
}

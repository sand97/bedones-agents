import { Link } from '@tanstack/react-router'

export function HowItWorks() {
  return (
    <section className="mk-how" id="how">
      <div className="mk-container">
        <div className="mk-how-head mk-reveal">
          <span className="mk-eyebrow">Comment ça marche</span>
          <h2>Votre agent prêt en moins de 10 minutes</h2>
          <p>
            Pas de configuration complexe. Pas de formulaires interminables. Trois étapes, et votre
            IA commence à travailler.
          </p>
        </div>
        <div className="mk-steps">
          <div className="mk-step mk-reveal">
            <div className="mk-step-num">01</div>
            <h3>Connectez vos comptes</h3>
            <p>
              Reliez TikTok, Facebook, Instagram, Messenger et WhatsApp en quelques clics. Votre
              numéro WhatsApp reste sur votre téléphone.
            </p>
            <div className="mk-step-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
          <div className="mk-step mk-reveal">
            <div className="mk-step-num">02</div>
            <h3>Formez votre agent</h3>
            <p>
              Partagez votre catalogue, vos process, votre ton. L&apos;IA apprend en discutant avec
              vous — comme à un collaborateur.
            </p>
            <div className="mk-step-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
          <div className="mk-step mk-reveal">
            <div className="mk-step-num">03</div>
            <h3>Laissez-le travailler</h3>
            <p>
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
    <section className="mk-stats">
      <div className="mk-container">
        <div className="mk-stats-grid">
          <div className="mk-stat mk-reveal">
            <div className="num">
              5<span className="unit"> plateformes</span>
            </div>
            <div className="label">connectées en natif</div>
          </div>
          <div className="mk-stat mk-reveal">
            <div className="num">
              &lt; 2<span className="unit"> min</span>
            </div>
            <div className="label">de temps de réponse moyen</div>
          </div>
          <div className="mk-stat mk-reveal">
            <div className="num">
              3×
              <span className="unit" />
            </div>
            <div className="label">plus de clients traités par jour</div>
          </div>
        </div>

        <div className="mk-testimonial mk-reveal">
          <blockquote>
            Depuis que j&apos;utilise Bedones Moderator, je ne perds plus aucun message sur WhatsApp
            ni sur TikTok. Mon agent connaît tout mon catalogue par cœur.
          </blockquote>
          <div className="author">
            <div className="av">AK</div>
            <div>
              <div className="name">Aïcha K.</div>
              <div className="role">Vendeuse en ligne · Abidjan</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function FinalCTA() {
  return (
    <section className="mk-final-cta">
      <div className="mk-container">
        <div className="mk-final-cta-inner">
          <h2>Prêt à automatiser votre service client&nbsp;?</h2>
          <p>Commencez gratuitement. Pas de carte bancaire requise.</p>
          <Link to="/auth/login" className="mk-btn mk-btn-white">
            Créer mon agent maintenant →
          </Link>
        </div>
      </div>
    </section>
  )
}

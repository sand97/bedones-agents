import { useEffect } from 'react'

/**
 * Drives the marketing reveal systems:
 *
 *  1. `.mk-reveal` — section-level fade-in-up applied once when the
 *     section enters the viewport (used for headlines, stats, etc).
 *  2. Animation hosts — when one of `.mk-feature-visual`, `.mk-mockup` or
 *     `.mk-platforms-row` enters view, it gets `.mk-anim-in`. Children
 *     carrying `data-anim` attributes (with optional `--mk-d` stagger CSS
 *     var) then play their entrance / typing / pulse animations defined
 *     in styles.css.
 *
 * Multiple fallbacks (rAF + scroll listener + 1.8s safety timer) cover
 * preview iframes where IntersectionObserver doesn't fire reliably.
 */
const HOST_SELECTOR = '.mk-feature-visual, .mk-mockup, .mk-platforms-row, .mk-anim-host'

export function useScrollReveal() {
  useEffect(() => {
    const sectionReveals = document.querySelectorAll('.mk-reveal')
    const hosts = document.querySelectorAll(HOST_SELECTOR)
    if (!sectionReveals.length && !hosts.length) return

    const revealSection = (el: Element) => el.classList.add('in')
    const revealHost = (el: Element) => el.classList.add('mk-anim-in')

    if ('IntersectionObserver' in window) {
      const sectionIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              revealSection(e.target)
              sectionIO.unobserve(e.target)
            }
          })
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
      )
      sectionReveals.forEach((el) => sectionIO.observe(el))

      const hostIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              revealHost(e.target)
              hostIO.unobserve(e.target)
            }
          })
        },
        // Trigger as soon as ~15% of the host is in view so the
        // choreography starts a touch before the user fully reaches it.
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
      )
      hosts.forEach((el) => hostIO.observe(el))
    }

    const check = () => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight - 40 && r.bottom > 0) revealSection(el)
      })
      document.querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`).forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight * 0.9 && r.bottom > 0) revealHost(el)
      })
    }
    requestAnimationFrame(() => {
      check()
      setTimeout(check, 200)
    })
    window.addEventListener('scroll', check, { passive: true })
    const safety = setTimeout(() => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach(revealSection)
      document.querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`).forEach(revealHost)
    }, 1800)

    return () => {
      window.removeEventListener('scroll', check)
      clearTimeout(safety)
    }
  }, [])
}

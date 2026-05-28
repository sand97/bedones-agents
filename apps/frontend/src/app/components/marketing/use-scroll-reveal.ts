import { useEffect } from 'react'

/**
 * Drives two reveal systems on marketing pages:
 *
 *  1. `.mk-reveal` — section-level fade-in-up applied once when the
 *     section enters the viewport.
 *  2. `.mk-feature-visual` — when the visual block of a feature row
 *     enters view, it gets `.mk-anim-in`. Children carrying `data-anim`
 *     attributes (and optional `--mk-d` stagger CSS var) then play their
 *     entrance/typing animations (see the CSS block in styles.css).
 *
 * Multiple fallbacks (rAF + scroll listener + final timer) cover preview
 * iframes where IntersectionObserver doesn't fire reliably.
 */
export function useScrollReveal() {
  useEffect(() => {
    const sectionReveals = document.querySelectorAll('.mk-reveal')
    const featureVisuals = document.querySelectorAll('.mk-feature-visual')
    if (!sectionReveals.length && !featureVisuals.length) return

    const revealSection = (el: Element) => el.classList.add('in')
    const revealVisual = (el: Element) => el.classList.add('mk-anim-in')

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

      // Trigger feature-visual animations a bit earlier than the section
      // reveal so the choreography starts as soon as the visual is in view.
      const visualIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              revealVisual(e.target)
              visualIO.unobserve(e.target)
            }
          })
        },
        { threshold: 0.25, rootMargin: '0px 0px -60px 0px' },
      )
      featureVisuals.forEach((el) => visualIO.observe(el))
    }

    const check = () => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight - 40 && r.bottom > 0) revealSection(el)
      })
      document.querySelectorAll('.mk-feature-visual:not(.mk-anim-in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight * 0.85 && r.bottom > 0) revealVisual(el)
      })
    }
    requestAnimationFrame(() => {
      check()
      setTimeout(check, 200)
    })
    window.addEventListener('scroll', check, { passive: true })
    const safety = setTimeout(() => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach(revealSection)
      document.querySelectorAll('.mk-feature-visual:not(.mk-anim-in)').forEach(revealVisual)
    }, 1500)

    return () => {
      window.removeEventListener('scroll', check)
      clearTimeout(safety)
    }
  }, [])
}

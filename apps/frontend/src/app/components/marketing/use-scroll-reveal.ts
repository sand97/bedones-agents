import { useEffect } from 'react'

/**
 * Drives the marketing reveal systems:
 *
 *  1. `.mk-reveal` — section-level fade-in-up applied once when the
 *     section enters the viewport (used for headlines, stats, etc).
 *  2. Animation hosts — when one of `.mk-feature-visual`, `.mk-mockup`,
 *     `.mk-platforms-row` or `.mk-anim-host` enters view, it gets
 *     `.mk-anim-in`. Children carrying `data-anim` attributes (with
 *     optional `--mk-d` stagger CSS var) then play their entrance /
 *     typing / pulse animations defined in styles.css.
 *
 * Triggering rules:
 *   - On mount we sync-check what's already visible and reveal it
 *     immediately (no waiting for the first IO callback).
 *   - We use `threshold: 0` + a generous positive `rootMargin` so the
 *     entrance starts a touch *before* the host enters the viewport,
 *     giving the choreography time to play as the user scrolls in.
 *   - Triple fallback (scroll listener + 700ms safety timer) covers the
 *     edge cases where IO is throttled or doesn't fire at all (some
 *     preview iframes, low-power mode, etc).
 */
const HOST_SELECTOR = '.mk-feature-visual, .mk-mockup, .mk-platforms-row, .mk-anim-host'

export function useScrollReveal() {
  useEffect(() => {
    const revealSection = (el: Element) => el.classList.add('in')
    const revealHost = (el: Element) => el.classList.add('mk-anim-in')

    // 1. Immediate pass — reveal anything already in (or above) the
    // viewport on mount, no observer round-trip required.
    const syncCheck = () => {
      const vh = window.innerHeight || 800
      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < vh - 20 && r.bottom > 0) revealSection(el)
      })
      document.querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`).forEach((el) => {
        const r = el.getBoundingClientRect()
        // Trigger as soon as the host is even peeking into the viewport
        // (with a 200px buffer below for a slightly anticipated start).
        if (r.top < vh + 200 && r.bottom > -100) revealHost(el)
      })
    }
    syncCheck()
    requestAnimationFrame(syncCheck)

    // 2. IntersectionObserver for ongoing reveals as the user scrolls.
    let sectionIO: IntersectionObserver | null = null
    let hostIO: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      sectionIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              revealSection(e.target)
              sectionIO?.unobserve(e.target)
            }
          })
        },
        { threshold: 0, rootMargin: '0px 0px 0px 0px' },
      )
      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => sectionIO!.observe(el))

      hostIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              revealHost(e.target)
              hostIO?.unobserve(e.target)
            }
          })
        },
        // Fire as soon as any pixel of the host is in (or near) the
        // viewport. The 200px bottom margin makes the animation start
        // just before the user actually sees the element.
        { threshold: 0, rootMargin: '0px 0px 200px 0px' },
      )
      document
        .querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`)
        .forEach((el) => hostIO!.observe(el))
    }

    // 3. Scroll listener as a redundant trigger (in case IO is throttled).
    const onScroll = () => syncCheck()
    window.addEventListener('scroll', onScroll, { passive: true })

    // 4. Safety net — reveal everything after 700ms regardless. Faster
    // than the previous 1.5s so even on slow / stuck observer setups the
    // page is never left with invisible illustrations.
    const safety = setTimeout(() => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach(revealSection)
      document.querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`).forEach(revealHost)
    }, 700)

    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(safety)
      sectionIO?.disconnect()
      hostIO?.disconnect()
    }
  }, [])
}

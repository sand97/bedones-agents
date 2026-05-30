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
 * Triggering rule:
 *   The animation fires when the block's vertical center crosses the
 *   trigger line, defined as 10% of the viewport height *above* the
 *   viewport center — i.e. y = 40% from the top. In other words: we
 *   wait until the block is well-centered (a touch above center) before
 *   playing the entrance choreography.
 *
 *   Driven by a rAF-throttled scroll listener (precise to the pixel,
 *   cheap for the ~20 reveal targets we have). An initial check fires
 *   one frame after mount so the browser can paint the hidden state
 *   before we add the `.in` class — without that frame the CSS
 *   transition on `.mk-reveal` has nothing to animate *from*.
 */
const HOST_SELECTOR = '.mk-feature-visual, .mk-mockup, .mk-platforms-row, .mk-anim-host'

// Trigger lines as a fraction of viewport height, measured from the top.
//
// We split into two phases so that "header" content (titles, paragraphs,
// app-layout chrome marked `.mk-reveal`) fades in early — otherwise the
// user reads the title, scrolls, and stares at a big empty block while
// waiting for the illustration to enter its trigger zone.
//
// Phase 1 — `.mk-reveal` (titles + layout wrappers):
//   Fires almost as soon as the block enters the viewport from below.
// Phase 2 — animation hosts (`.mk-mockup`, `.mk-feature-visual`,
//   `.mk-platforms-row`, `.mk-anim-host`):
//   Fires once the host is well-centered, so the staggered children
//   animation (e.g. the chat conversation) plays while the user is
//   actually looking at it.
const HEADER_TRIGGER_RATIO = 0.95
const ILLUSTRATION_TRIGGER_RATIO = 0.7

export function useScrollReveal() {
  useEffect(() => {
    const revealSection = (el: Element) => el.classList.add('in')
    const revealHost = (el: Element) => el.classList.add('mk-anim-in')

    const checkVisible = () => {
      const vh = window.innerHeight || 800
      const headerTriggerY = vh * HEADER_TRIGGER_RATIO
      const illustrationTriggerY = vh * ILLUSTRATION_TRIGGER_RATIO

      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.height === 0) return // not yet laid out
        const blockCenter = r.top + r.height / 2
        if (blockCenter <= headerTriggerY) revealSection(el)
      })

      document.querySelectorAll(`${HOST_SELECTOR}:not(.mk-anim-in)`).forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.height === 0) return
        const blockCenter = r.top + r.height / 2
        if (blockCenter <= illustrationTriggerY) revealHost(el)
      })
    }

    // Defer one frame so the browser paints the initial (hidden) state
    // before we add the `.in` class. Without this, the CSS transition on
    // `.mk-reveal` has no "from" frame and the element appears instantly.
    const initialRaf = requestAnimationFrame(checkVisible)

    // rAF-throttled scroll/resize handler so we run at most one check
    // per frame regardless of how chatty the scroll events are.
    let pending: number | null = null
    const schedule = () => {
      if (pending !== null) return
      pending = requestAnimationFrame(() => {
        pending = null
        checkVisible()
      })
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      cancelAnimationFrame(initialRaf)
      if (pending !== null) cancelAnimationFrame(pending)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])
}

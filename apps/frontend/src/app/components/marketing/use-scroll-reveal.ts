import { useEffect } from 'react'

export function useScrollReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll('.mk-reveal')
    if (!elements.length) return

    const reveal = (el: Element) => el.classList.add('in')

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              reveal(e.target)
              io.unobserve(e.target)
            }
          })
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
      )
      elements.forEach((el) => io.observe(el))
    }

    const check = () => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight - 40 && r.bottom > 0) reveal(el)
      })
    }
    requestAnimationFrame(() => {
      check()
      setTimeout(check, 200)
    })
    window.addEventListener('scroll', check, { passive: true })
    const safety = setTimeout(() => {
      document.querySelectorAll('.mk-reveal:not(.in)').forEach(reveal)
    }, 1200)

    return () => {
      window.removeEventListener('scroll', check)
      clearTimeout(safety)
    }
  }, [])
}

/**
 * StudyNav: the quiet in-page nav beside the reading column (desk only, from 1100 px). It
 * sticks under the top bar and marks the section being read (aria-current, plus a short
 * rule and a heavier weight: never colour alone). A link scrolls its section to just
 * under the bar (smooth, or instant under reduced motion) and moves focus to the heading,
 * so the keyboard carries on from there. The hash is left alone: the app has no URLs.
 *
 * The scroll position is read once a frame at most, and only this nav re-renders.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import { SECTIONS, sectionDomId, type SectionId } from '../../lib/study'
import { activeSection, isAtBottom } from '../../lib/studyNav'
import { barHeight } from '../../lib/breakpoints'
import { prefersReducedMotion } from '../../lib/motion'

export function StudyNav() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(sectionDomId(s.id)))
    let raf = 0
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const line = barHeight(window.innerWidth) + vh * 0.25
      const tops = els.map((el) => (el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY))
      setActive(activeSection(tops, line, isAtBottom(window.scrollY, vh, document.documentElement.scrollHeight)))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(raf)
    }
  }, [])

  const go = (e: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    const section = document.getElementById(sectionDomId(id))
    if (!section) return
    e.preventDefault()
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    document.getElementById(`${sectionDomId(id)}-h`)?.focus({ preventScroll: true })
  }

  return (
    <nav aria-label="On this page" className="study-nav max-lg:hidden">
      <ul className="m-0 list-none p-0">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${sectionDomId(s.id)}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={(e) => go(e, s.id)}
              className="study-nav__link"
            >
              {s.nav}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

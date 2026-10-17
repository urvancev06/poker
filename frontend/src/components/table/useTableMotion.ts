// The table's motion: one orchestration, driven by the difference between consecutive
// backend snapshots (lib/tableMotion.ts diffTable). The screen already shows the new
// state when these run; every animation runs from the previous look to it (fill:
// backwards), or moves a throwaway ghost of something that has just gone (chips gliding
// into the pot, folded backs sliding to the muck). Nothing here can hide a bet or a card.
//
//   the deal      backs come off the deck at the centre with a lift and a spin; your two
//                 cards rise out of the felt into your hand, turning face up and coming
//                 into focus; the blinds slide out, then the pot appears
//   a fold        the backs slide toward the muck and fade
//   a bet         the chip slides out from in front of the player; its label follows
//   a street      last street's chips glide into the pot; the dealt cards move over to
//                 make room (FLIP) and the new ones come off the deck and turn over
//   a showdown    the shown cards turn face up where they lay
//   hand over     the pot goes to whoever won it
//   desktop panel the table glides aside and re-centres (FLIP on the stage)
// Your turn (the lift, the pool, the rim light) is CSS transitions on the state classes.
// Reduced motion, a skip to the result, or a view coming back into sight: instant.

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { chips as chipText } from '../../lib/format'
import { EASE, play } from '../../lib/motion'
import { prefersReducedMotion } from '../../lib/motion'
import { boardU, project, type TableLayout, type UV } from '../../lib/tableLayout'
import { diffTable, type TableEvents } from '../../lib/tableMotion'
import type { TableModel } from '../../lib/tableModel'

export interface MotionRefs {
  stage: RefObject<HTMLDivElement | null>
  feltGhosts: RefObject<HTMLDivElement | null>
  overlayGhosts: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  coach: RefObject<HTMLElement | null>
}

const DECK: UV = [0.5, 0.5]

/** Plane px between two table-space points (what a translate3d on the felt moves by). */
function planeD(L: TableLayout, from: UV, to: UV): [number, number] {
  const pw = 1000 * L.s
  return [(to[0] - from[0]) * pw, (to[1] - from[1]) * pw * L.g.aspect]
}

const chipSpot = (L: TableLayout, p: number): UV => (p === 0 ? L.heroBet : L.bets[p as 1 | 2 | 3 | 4 | 5])
const seatSpot = (L: TableLayout, p: number): UV => (p === 0 ? [0.5, 1.02] : L.g.seats[p as 1 | 2 | 3 | 4 | 5].cards)

/** A throwaway copy of an element, in a ghost layer; it removes itself when done. */
function ghostOf(el: Element | null, host: HTMLElement | null): HTMLElement | null {
  if (!el || !host) return null
  const g = el.cloneNode(true) as HTMLElement
  g.hidden = false
  g.removeAttribute('data-chip')
  g.removeAttribute('data-backs')
  g.removeAttribute('data-bet')
  g.classList.add('ghost')
  g.setAttribute('aria-hidden', 'true')
  host.appendChild(g)
  return g
}
function retire(g: HTMLElement, a: Animation | null) {
  if (!a) g.remove()
  else a.finished.then(() => g.remove(), () => g.remove())
}

export function useTableMotion(refs: MotionRefs, model: TableModel | null, L: TableLayout, quiet: boolean) {
  const prev = useRef<TableModel | null>(null)
  const prevLayout = useRef<TableLayout | null>(null)
  const mountedAt = useRef(0)
  const introDone = useRef(false)
  const hiddenSince = useRef(false)
  const layoutNow = useRef(L)

  // The entrance, once: the object rises into the light with its lineup; the dock fades up.
  // Coming back from another view replays nothing (and animates no catch-up).
  useLayoutEffect(() => {
    mountedAt.current = performance.now()
    if (!introDone.current) {
      introDone.current = true
      const stage = refs.stage.current
      play(stage?.querySelector('.table-obj'), [{ opacity: 0 }, { opacity: 1 }], { delay: 80, duration: 520, ease: 'ease-out' })
      play(stage?.querySelector('.table-obj'), [{ transform: 'translateY(28px) scale(.955)' }, { transform: 'none' }], { delay: 80, duration: 1100 })
      play(stage?.querySelector('.overlay'), [{ opacity: 0 }, { opacity: 1 }], { delay: 220, duration: 480, ease: 'ease-out' })
      play(refs.dock.current, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { delay: 300, duration: 600 })
    }
    return () => {
      hiddenSince.current = true
    }
  }, [refs.stage, refs.dock])

  useLayoutEffect(() => {
    layoutNow.current = L
  })

  // A desktop side panel opening or closing: the table glides over and re-centres.
  const panelW = L.panelW
  useLayoutEffect(() => {
    const was = prevLayout.current
    const now = layoutNow.current
    prevLayout.current = now
    if (!was || was.panelW === now.panelW || hiddenSince.current || prefersReducedMotion()) return
    const k = was.s / now.s
    const cyWas = was.objTop + was.tableH / 2
    const cyNow = now.objTop + now.tableH / 2
    const o = { duration: 560 }
    play(refs.stage.current, [{ transform: `translate(${was.axis - k * now.axis}px, ${cyWas - k * cyNow}px) scale(${k})` }, { transform: 'none' }], o)
    play(refs.dock.current, [{ transform: `translateX(${was.axis - now.axis}px)` }, { transform: 'none' }], o)
    if (was.coachAt === 'side' && now.coachAt === 'side')
      play(refs.coach.current, [{ transform: `translate(${was.coach.left - now.coach.left}px, ${was.coach.top - now.coach.top}px)` }, { transform: 'none' }], o)
  }, [panelW, refs.stage, refs.dock, refs.coach])

  useLayoutEffect(() => {
    const before = prev.current
    prev.current = model
    const comingBack = hiddenSince.current
    hiddenSince.current = false
    if (!model || quiet || comingBack || prefersReducedMotion()) return
    const events = diffTable(before, model)
    const firstDeal = !before
    const t0 = firstDeal ? Math.max(0, 500 - (performance.now() - mountedAt.current)) : 0
    run(refs, layoutNow.current, model, events, t0)
  }, [model, quiet, refs])
}

function run(refs: MotionRefs, L: TableLayout, m: TableModel, e: TableEvents, t0: number) {
  const stage = refs.stage.current
  if (!stage) return
  const q = (sel: string) => stage.querySelector<HTMLElement>(sel)
  const g = L.g

  const chipIn = (p: number, delay: number) => {
    const ch = q(`[data-chip="${p}"]`)
    if (!ch || ch.hidden) return
    const [dx, dy] = planeD(L, chipSpot(L, p), seatSpot(L, p))
    play(ch, [{ transform: `translate3d(${dx}px, ${dy}px, ${10 * L.s}px)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }], { delay, duration: 360 })
    play(q(`[data-bet="${p}"]`), [{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { delay: delay + 160, duration: 260 })
  }

  if (e.deal) {
    // two rounds from the small blind, 28 ms apart
    const bySeat = [m.hero, ...m.villains].sort((a, b) => a.seat - b.seat)
    let n = 0
    let end = t0
    for (let r = 0; r < 2; r++) {
      for (const s of bySeat) {
        const delay = t0 + n * 28
        n++
        if (s.player === 0) {
          end = Math.max(end, heroDeal(stage, L, r, delay))
          continue
        }
        const vc = q(`[data-backs="${s.player}"]`)
        const card = vc && !vc.hidden ? (vc.children[r] as HTMLElement | undefined) : undefined
        if (!card) continue
        const [dx, dy] = planeD(L, g.seats[s.player as 1 | 2 | 3 | 4 | 5].cards, DECK)
        const spin = (n % 2 ? -1 : 1) * (14 + (n % 3) * 7)
        play(
          card,
          [
            { transform: `translate3d(${dx}px, ${dy}px, ${18 * L.s}px) rotateZ(${spin}deg)`, opacity: 0 },
            { opacity: 1, offset: 0.12 },
            { transform: `translate3d(${dx * 0.35}px, ${dy * 0.35}px, ${34 * L.s}px) rotateZ(${spin * 0.4}deg)`, offset: 0.55 },
            { transform: 'none', opacity: 1 },
          ],
          { delay, duration: 380 },
        )
        end = Math.max(end, delay + 380)
      }
    }
    // the blinds slide out as the last cards land, then the pot appears: a card in flight
    // never sits on a label
    const blinds = end - 60
    for (const p of e.chipIns) chipIn(p, blinds)
    play(q('[data-pot-label]'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { delay: blinds + 140, duration: 360 })
    play(q('[data-street-label]'), [{ opacity: 0 }, { opacity: 1 }], { delay: t0 + 120, duration: 300, ease: 'ease-out' })
    return
  }

  // folds: the backs slide to the muck
  for (const p of e.folds) {
    const gh = ghostOf(q(`[data-backs="${p}"]`), refs.feltGhosts.current)
    if (!gh) continue
    const [dx, dy] = planeD(L, g.seats[p as 1 | 2 | 3 | 4 | 5].cards, DECK)
    retire(
      gh,
      play(gh, [{ transform: 'none', opacity: 1 }, { transform: `translate3d(${dx * 0.42}px, ${dy * 0.42}px, 0) rotateZ(${dx > 0 ? 18 : -18}deg)`, opacity: 0 }], {
        duration: 300,
        ease: 'ease-in',
        fill: 'forwards',
      }),
    )
  }
  for (const p of e.chipIns) chipIn(p, 0)
  // the seat that just acted: its line comes up
  if (e.acted !== null && e.acted !== 0) play(q(`[data-seat="${e.acted}"] [data-seat-act]`), [{ opacity: 0.2 }, { opacity: 1 }], { duration: 260, ease: 'ease-out' })

  if (e.street) {
    const { from, to, collected } = e.street
    // the street's chips glide into the pot (ghosts: the real chips are already gone)
    for (const c of collected) {
      const gc = ghostOf(q(`[data-chip="${c.player}"]`), refs.feltGhosts.current)
      if (gc) {
        const [dx, dy] = planeD(L, chipSpot(L, c.player), g.pot)
        retire(
          gc,
          play(gc, [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.7 }, { transform: `translate3d(${dx}px, ${dy}px, 0)`, opacity: 0 }], {
            duration: 360,
            ease: 'cubic-bezier(.4,0,.2,1)',
            fill: 'forwards',
          }),
        )
      }
      const gl = ghostOf(q(`[data-bet="${c.player}"]`), refs.overlayGhosts.current)
      if (gl) {
        gl.textContent = chipText(c.amount)
        retire(gl, play(gl, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, ease: 'ease-out', fill: 'forwards' }))
      }
    }
    if (to > from) {
      const t1 = collected.length ? 160 : 0
      const slots = [...stage.querySelectorAll<HTMLElement>('[data-board]')].sort((a, b) => Number(a.dataset.board) - Number(b.dataset.board))
      // the cards already down make room: the board stays centred on what is dealt
      slots.slice(0, from).forEach((sl, i) => {
        const [dx] = planeD(L, [boardU(g, i, to), 0], [boardU(g, i, from), 0])
        play(sl, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { delay: t1, duration: 460 })
      })
      slots.slice(from, to).forEach((sl, j) => {
        const i = from + j
        const card = sl.firstElementChild as HTMLElement | null
        if (!card) return
        const [dx, dy] = planeD(L, [boardU(g, i, to), g.board[1]], DECK)
        const delay = t1 + j * 60
        play(
          card,
          [
            { transform: `translate3d(${dx}px, ${dy}px, ${24 * L.s}px) rotateZ(${-8 + j * 6}deg)`, opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { transform: `translate3d(${dx * 0.3}px, ${dy * 0.3}px, ${40 * L.s}px)`, offset: 0.5 },
            { transform: 'none', opacity: 1 },
          ],
          { delay, duration: 400 },
        )
        turnOver(card, delay, 520, 0.4)
      })
      play(q('[data-street-label]'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { delay: t1 + 200, duration: 360 })
    }
  }

  // a showdown: the shown cards turn over where they lay
  e.reveals.forEach((p, k) => {
    const vc = q(`[data-backs="${p}"]`)
    if (!vc) return
    ;[...vc.children].forEach((c, j) => turnOver(c as HTMLElement, 260 + k * 90 + j * 70, 520, 0.2))
  })

  // the pot goes to whoever won it
  if (e.handOver) {
    const winners = [m.hero, ...m.villains].filter((s) => (s.net ?? 0) > 0)
    const template = q('[data-chip]')
    winners.forEach((w, k) => {
      const gc = ghostOf(template, refs.feltGhosts.current)
      if (!gc) return
      gc.style.left = `${g.pot[0] * 100}%`
      gc.style.top = `${g.pot[1] * 100}%`
      const [dx, dy] = planeD(L, g.pot, seatSpot(L, w.player))
      retire(
        gc,
        play(gc, [{ transform: 'none', opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { transform: `translate3d(${dx}px, ${dy}px, 0)`, opacity: 0 }], {
          delay: 380 + k * 80,
          duration: 620,
          ease: 'cubic-bezier(.4,0,.2,1)',
          fill: 'both',
        }),
      )
    })
  }
}

/** A two-sided card turning face up (the face starts hidden behind it). */
function turnOver(card: HTMLElement, delay: number, duration: number, hold: number) {
  const inner = card.querySelector('.flip__inner') ?? (card.classList.contains('flip__inner') ? card : null)
  play(inner, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: hold, easing: EASE.spring }, { transform: 'rotateY(0deg)' }], {
    delay,
    duration,
    ease: 'linear',
  })
}

/** Your card rises out of the felt into your hand, turning face up and coming into focus. */
function heroDeal(stage: HTMLElement, L: TableLayout, r: number, delay: number): number {
  const card = stage.querySelector<HTMLElement>('[data-hero] .hero__cards')?.children[r] as HTMLElement | undefined
  if (!card || !card.classList.contains('flip')) return delay
  const cr = card.getBoundingClientRect()
  const c = project(L, 0.5, 0.5)
  const dx = c[0] - (cr.left + cr.width / 2)
  const dy = c[1] - (cr.top + cr.height / 2)
  play(
    card,
    [
      { transform: `translate(${dx}px, ${dy}px) rotateX(${L.g.tilt}deg) scale(.5)`, opacity: 0, filter: 'blur(6px)' },
      { opacity: 1, offset: 0.15 },
      { filter: 'blur(0px)', offset: 0.55 },
      { transform: 'none', opacity: 1, filter: 'blur(0px)' },
    ],
    { delay, duration: 520 },
  )
  turnOver(card, delay, 480, 0.2)
  if (r === 1) play(stage.querySelector('[data-hero-info]'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { delay: delay + 340, duration: 420 })
  return delay + 520
}

/**
 * The object itself: the obsidian slab in 3D (wall, top, sheen, the focus pool, the glint)
 * and what lies on its felt: the board, each villain's two backs (face up where they lay
 * at a showdown, B3: only cards the backend says were shown), and the chips in front of
 * each seat. Decorative for assistive tech: TableView says the same in words.
 *
 * Positions are table space (u, v as % of the plane); CSS 3D does the projection.
 * Elements carry data attributes so the motion hook can find them: data-board, data-backs,
 * data-chip, data-pot, data-deck, and a ghosts layer it may write into.
 */
import { memo, useId, useMemo, type RefObject } from 'react'
import type { SeatModel } from '../../lib/tableModel'
import { useDeck } from '../../lib/prefsContext'
import { acrossStops, edgeLight, LIMB_LIGHT, lightAcross, wallFills, wallShade } from '../../lib/slabLight'
import { boardU, slabSide, type TableLayout, type UV, VILLAIN_SLOTS } from '../../lib/tableLayout'
import { Card } from '../Card'

const pct = (n: number) => `${n * 100}%`
const at = ([u, v]: UV) => ({ left: pct(u), top: pct(v) })

/** A card that can turn over: the face, with the back behind it. Decorative. */
export function FlipCard({ code }: { code: string }) {
  return (
    <div className="flip" data-code={code}>
      <div className="flip__inner">
        <Card card={code} decorative />
        <Card faceDown decorative className="flip__back" />
      </div>
    </div>
  )
}

/** Bands down the wall: enough that each is under a pixel at the middle of the near rim
 * (so the ramp reads smooth, not stepped); each is stroked in its own fill, so the edges
 * where they meet overlap and leave no anti-aliasing seam. */
const WALL_BANDS = 36
const WALL_FILLS = wallFills(WALL_BANDS)

/**
 * The slab's side wall, drawn in viewport px under the 3D object (the top paints over all
 * but the visible band), lit as lib/slabLight says: a ramp down the wall (one fill per
 * band, the bands following the curve), a falloff across it toward the ends and away from
 * the light source (lightX), and a faint lower edge all the way round, so the silhouette
 * reads against the void at the ends too.
 */
export const SlabSide = memo(function SlabSide({ L, lightX }: { L: TableLayout; lightX: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // the outline the browser draws (L.outline: a rounded rectangle without corner-shape)
  const side = useMemo(() => slabSide(L, WALL_BANDS), [L])
  const { x, y, w, h } = side.box
  const pad = 3
  const lx = lightAcross(lightX, x, w)
  const fall = acrossStops(wallShade, lx)
  const edge = acrossStops(edgeLight, lx)
  return (
    <svg className="slab-side" viewBox={`${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`} style={{ left: x - pad, top: y - pad, width: w + 2 * pad, height: h + 2 * pad }}>
      <defs>
        <linearGradient id={`${uid}f`} gradientUnits="userSpaceOnUse" x1={x} y1={0} x2={x + w} y2={0}>
          {fall.map(([o, a]) => (
            <stop key={o} offset={o} stopColor="#000" stopOpacity={a} />
          ))}
        </linearGradient>
        <linearGradient id={`${uid}e`} gradientUnits="userSpaceOnUse" x1={x} y1={0} x2={x + w} y2={0}>
          {edge.map(([o, a]) => (
            <stop key={o} offset={o} stopColor={LIMB_LIGHT} stopOpacity={a} />
          ))}
        </linearGradient>
      </defs>
      {side.bands.map((d, k) => (
        <path key={k} d={d} fill={WALL_FILLS[k]} stroke={WALL_FILLS[k]} strokeWidth={0.6} strokeLinejoin="round" />
      ))}
      <path d={side.bands[0]} fill={`url(#${uid}f)`} />
      <path d={side.edge} fill="none" stroke={`url(#${uid}e)`} strokeWidth={0.9 + 0.6 * L.s} strokeLinecap="round" />
    </svg>
  )
})

export const Slab = memo(function Slab({ glint, focus }: { glint: { u: number; v: number; deg: number }; focus: boolean }) {
  return (
    <>
      <div className="slab slab--wall" />
      <div className="slab slab--top">
        <div className="slab__sheen" />
        <div className={`slab__focus ${focus ? 'is-on' : ''}`} />
        <div className="slab__glint" style={{ left: pct(glint.u), top: pct(glint.v), rotate: `${glint.deg}deg` }} />
      </div>
    </>
  )
})

export interface FeltProps {
  L: TableLayout
  /** null while booting: nothing dealt yet. */
  board: readonly string[]
  villains: readonly SeatModel[] | null
  hero: SeatModel | null
  ghosts: RefObject<HTMLDivElement | null>
}

export function Felt({ L, board, villains, hero, ghosts }: FeltProps) {
  const g = L.g
  const n = board.length
  const reveal = useDeck().reveal
  return (
    <div className="felt-top">
      {board.map((code, i) => (
        <div key={code} className="on slot" data-board={i} style={at([boardU(g, i, n), g.board[1]])}>
          <FlipCard code={code} />
        </div>
      ))}
      {VILLAIN_SLOTS.map((k) => {
        const v = villains?.[k - 1]
        const shown = !!v?.cards
        const sg = g.seats[k]
        return (
          <div
            key={k}
            className={`on vcards ${shown ? 'is-shown' : ''}`}
            data-backs={k}
            hidden={!v || (v.folded && !shown)}
            style={{ ...at(shown ? sg.rev : sg.cards), ['--reveal' as string]: reveal }}
          >
            {v?.cards ? (
              v.cards.map((c) => <FlipCard key={c} code={c} />)
            ) : (
              <>
                <Card faceDown decorative />
                <Card faceDown decorative />
              </>
            )}
          </div>
        )
      })}
      {[hero, ...(villains ?? [])].map((s, i) => {
        const p = s?.player ?? i
        const where = p === 0 ? L.heroBet : L.bets[p as 1 | 2 | 3 | 4 | 5]
        return (
          <div key={`chip-${p}`} className="on chips" data-chip={p} hidden={!s || !(s.bet > 0)} style={at(where)}>
            <i className="chip__base" />
            <i className="chip__mid" />
            <i className="chip__top" />
          </div>
        )
      })}
      <div className="on anchor" data-pot="" style={at(g.pot)} />
      <div className="on anchor" data-deck="" style={at([0.5, 0.5])} />
      <div className="felt-ghosts" ref={ghosts} />
    </div>
  )
}

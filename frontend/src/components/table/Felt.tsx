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
import { memo, type RefObject } from 'react'
import type { SeatModel } from '../../lib/tableModel'
import { boardU, type TableLayout, type UV, VILLAIN_SLOTS } from '../../lib/tableLayout'
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
          <div key={k} className={`on vcards ${shown ? 'is-shown' : ''}`} data-backs={k} hidden={!v || (v.folded && !shown)} style={at(shown ? sg.rev : sg.cards)}>
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

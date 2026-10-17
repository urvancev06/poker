/**
 * A villain's place: floating type on the void beside the rim. Line one is the name (by
 * visibility mode), the dealer puck and the stack ("All-in" while all-in). In HUD mode the
 * read has its own line. The last line is the position, then what happened: this street's
 * action ("3-bet 15, bets 26"; a phone keeps only the latest), "Folded", or at hand end the
 * net (+197 in green, −5 in red) and a shown hand's label (on a line of its own when it
 * does not fit beside them in the seat's width). A bot thinking has a pulsing dot.
 * Folded seats step back to the tertiary colour (and say "Folded": never colour alone).
 */
import type { ReactNode, Ref } from 'react'
import { cardLabel } from '../../lib/cards'
import { chips, signedChips } from '../../lib/format'
import type { SeatPlacement } from '../../lib/tableLayout'
import { capitalize, type Identity, type SeatModel } from '../../lib/tableModel'

export interface SeatLabelProps {
  /** null while booting: the name only. */
  seat: SeatModel | null
  identity: Identity
  place: SeatPlacement
  phone: boolean
  labelRef?: Ref<HTMLDivElement>
}

export function Dealer({ phone }: { phone: boolean }) {
  return (
    <span className={`dealer ${phone ? 'size-4 text-[9.5px]' : 'size-[18px] text-[10.5px]'}`} title="Dealer button" aria-hidden="true">
      D
    </span>
  )
}

export function SeatLabel({ seat, identity, place, phone, labelRef }: SeatLabelProps) {
  const folded = !!seat?.folded
  const ink = folded ? 'text-dust' : ''
  let act: ReactNode = null
  if (seat) {
    const shown = seat.cards && seat.label ? <span className="seat__line font-semibold text-ink">{capitalize(seat.label)}</span> : null
    if (seat.net != null && seat.net !== 0)
      act = (
        <>
          <span className={`flex-none font-strong ${seat.net > 0 ? 'text-win' : 'text-loss'}`}>{signedChips(seat.net)}</span>
          {shown}
        </>
      )
    else if (shown) act = shown
    else if (folded) act = <span className="seat__line">Folded</span>
    else if (seat.tags.length) act = <span className="seat__line">{(phone ? seat.tags.slice(-1) : seat.tags).join(', ')}</span>
  }
  const name = [
    identity.name,
    identity.pos,
    seat ? (seat.allIn ? 'all-in' : `${chips(seat.stack)} chips`) : null,
    seat && seat.bet > 0 ? `bet ${chips(seat.bet)}` : null,
    seat ? (folded ? 'folded' : 'in the hand') : null,
    seat?.button ? 'dealer' : null,
    seat?.actor ? 'thinking' : null,
    identity.hud?.join(', '),
    seat?.tags.length && !folded ? seat.tags.join(', ') : null,
    seat?.cards ? `shows ${seat.cards.map(cardLabel).join(' and ')}${seat.label ? `, ${seat.label}` : ''}` : null,
    seat?.net ? `${signedChips(seat.net)} this hand` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const line2 = identity.pos || act
  // a shown hand's label wraps under the position and net rather than truncating; the
  // wrapped line keeps the seat's alignment
  const wrap = !!(seat?.cards && seat.label)
  const justify = place.side === 'top' ? 'justify-center' : place.side === 'left' || place.side === 'top-right' || place.side === 'corner-right' ? 'justify-end' : ''
  const actRow = wrap ? `flex-wrap gap-y-0.5 ${justify}` : ''
  return (
    <div
      ref={labelRef}
      className={`seat ${phone ? 'gap-0.5' : 'gap-[3px]'}`}
      data-side={place.side}
      role="group"
      aria-label={name}
      data-seat={seat?.player}
      style={{ left: place.x, top: place.y, maxWidth: place.maxWidth ?? undefined }}
    >
      <div className={`flex max-w-full items-center ${phone ? 'gap-1.5' : 'gap-2'}`}>
        <span className={`seat__line font-strong leading-[1.15] ${phone ? 'text-[15px] tracking-[-0.015em]' : 'text-[19px] tracking-[-0.022em]'} ${folded ? 'text-dust' : seat ? 'text-ink' : 'text-fog'}`}>
          {identity.name}
          {seat?.actor && <span className="seat__think" aria-hidden="true" />}
        </span>
        {seat?.button && <Dealer phone={phone} />}
        {seat &&
          (seat.allIn ? (
            <span className={`flex-none font-strong text-ink ${phone ? 'text-[15px]' : 'text-[17px]'}`}>All-in</span>
          ) : (
            <span className={`flex-none font-medium tabular-nums tracking-[-0.01em] ${phone ? 'text-[15px]' : 'text-[17px]'} ${folded ? 'text-dust' : 'text-fog'}`}>{chips(seat.stack)}</span>
          ))}
      </div>
      {identity.hud && seat && (
        <div className={`seat__line flex font-semibold tabular-nums ${phone ? 'gap-[7px] text-[12px]' : 'gap-[9px] text-foot'} ${folded ? 'text-dust' : 'text-fog'}`}>
          {identity.hud.map((h, i) => (
            <span key={h} className={i > 0 ? 'text-dust' : undefined}>
              {h}
            </span>
          ))}
        </div>
      )}
      {seat && line2 && (
        // proportional figures here: Inter's tabular set widens the hyphen in "3-bet 15"
        <div data-seat-act="" className={`flex max-w-full font-medium ${phone ? 'gap-x-[5px] text-[12px]' : 'gap-x-[7px] text-foot'} ${actRow} ${ink || 'text-fog'}`}>
          {identity.pos && <span className="flex-none font-semibold text-dust">{identity.pos}</span>}
          {act}
        </div>
      )}
    </div>
  )
}

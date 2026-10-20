/**
 * Your hand: two cards standing below the rim, the hand label ("Flush draw") and your line
 * ("You  BB  92.5", the stack in big blinds, the dealer puck, "All-in"). On your turn the cards lift on the bouncy
 * spring into a pool of the atmosphere's blue. A hand you folded stays white and steps
 * back; while the bots play on, the backend withholds your cards, and the place says
 * "Folded". Before the first deal: just "You".
 */
import { cardLabel } from '../../lib/cards'
import { bb, bbSpeech } from '../../lib/format'
import { capitalize, type SeatModel } from '../../lib/tableModel'
import { FlipCard } from './Felt'
import { Dealer } from './SeatLabel'

export interface HeroHandProps {
  hero: SeatModel | null
  /** The hand's big blind (amounts are chips). */
  bigBlind: number
  turn: boolean
  phone: boolean
  x: number
  y: number
}

export function HeroHand({ hero, bigBlind, turn, phone, x, y }: HeroHandProps) {
  const cards = hero?.cards ?? null
  const steppedBack = !!hero?.folded && !!cards
  const label = !hero || !cards ? '' : hero.folded ? 'Folded' : capitalize(hero.label)
  const name = hero
    ? `You, ${hero.position}, ${hero.allIn ? 'all-in' : bbSpeech(hero.stack, bigBlind)}${hero.button ? ', dealer' : ''}${hero.bet > 0 ? `, bet ${bbSpeech(hero.bet, bigBlind)}` : ''}${turn ? ', your turn' : ''}`
    : 'You'
  return (
    <div className={`hero ${turn ? 'is-turn' : ''} ${steppedBack ? 'is-folded' : ''}`} role="group" aria-label={name} style={{ left: x, top: y }} data-hero="">
      <div className="hero__hand">
        <div className="hero__pool" aria-hidden="true" />
        <div className="hero__cards" role="group" aria-label={cards ? `Your cards: ${cards.map(cardLabel).join(', ')}${hero?.label && !hero.folded ? `, ${hero.label}` : ''}` : hero ? 'You folded' : 'No cards yet'}>
          {cards ? (
            cards.map((c) => <FlipCard key={c} code={c} />)
          ) : hero ? (
            <div className={`hero__folded font-semibold text-dust ${phone ? 'text-callout' : 'text-body'}`}>{hero.folded ? 'Folded' : ''}</div>
          ) : (
            <div className="hero__folded" />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center" data-hero-info="">
        <div className={`font-strong tracking-[-0.02em] ${phone ? 'mt-2 min-h-[22px] text-body' : 'mt-3 min-h-[26px] text-headline'} ${hero?.folded ? 'text-fog' : 'text-ink'}`} aria-hidden="true">
          {label}
        </div>
        <div className={`flex items-center gap-2 font-medium tabular-nums text-fog ${phone ? 'mt-[3px] text-foot' : 'mt-[5px] text-callout tracking-[-0.005em]'}`} aria-hidden="true">
          <b className="font-semibold text-ink">You</b>
          {hero?.button && <Dealer phone={phone} />}
          {hero && <span className="font-semibold">{hero.position}</span>}
          {hero && (hero.allIn ? <b className="font-semibold text-ink">All-in</b> : <span>{bb(hero.stack, bigBlind)}</span>)}
        </div>
      </div>
    </div>
  )
}

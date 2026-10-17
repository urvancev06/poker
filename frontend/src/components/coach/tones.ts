// Tailwind classes for the coach's tones. The tone is always the backend `tone`
// (lib/ring normalizeTone: unknown -> neutral), never read from the verdict's words.

import type { Figure } from '../../lib/coachView'
import type { Tone } from '../../lib/ring'

/** The verdict and the headline figure. */
export const TONE_TEXT: Record<Tone, string> = { good: 'text-win', neutral: 'text-ink', close: 'text-close', fold: 'text-loss' }

/** Each glance figure: equity in the tone, Need in the price grey, Call EV by its sign. */
export const FIGURE_TEXT: Record<Figure['tone'], string> = { ...TONE_TEXT, need: 'text-fog', win: 'text-win', loss: 'text-loss' }

/** The realized bar in the maths: the ring's fill gradient, start to tip. */
export const TONE_FILL: Record<Tone, string> = {
  good: 'from-(--tone-good-a) to-(--tone-good-b)',
  neutral: 'from-(--tone-neutral-a) to-(--tone-neutral-b)',
  close: 'from-(--tone-close-a) to-(--tone-close-b)',
  fold: 'from-(--tone-fold-a) to-(--tone-fold-b)',
}

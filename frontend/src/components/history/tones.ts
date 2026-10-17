// Tailwind classes for a hand's net. The sign always says it ("+94", "−91", "0"); the
// colour only repeats it.

import type { Tone } from '../../lib/historyList'

export const NET_TEXT: Record<Tone, string> = { win: 'text-win', loss: 'text-loss', even: 'text-fog' }

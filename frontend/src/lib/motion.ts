// Motion tokens and the one way to run a scripted animation.
//
// CSS transitions/keyframes use the same curves as Tailwind utilities (ease-spring,
// ease-bouncy, ease-grow) or var(--ease-spring) in component CSS. Sequenced moves from
// effects use `play()`, which honours prefers-reduced-motion by not animating at all:
// the element is already in its final state (animations only run from the previous look
// to the current one, `fill: 'backwards'`), so skipping them is the instant version.
// Transform and opacity only (plus stroke-dasharray / clip-path where a primitive says so).

import { useSyncExternalStore } from 'react'

/** Damped springs sampled into CSS linear(); identical to the @theme tokens in index.css. */
export const EASE = {
  /** zeta 1.00, critically damped: everything that moves. */
  spring:
    'linear(0, 0.0209, 0.0724, 0.1418, 0.2198, 0.3005, 0.3797, 0.4549, 0.5246, 0.5879, 0.6448, 0.6953, 0.7397, 0.7784, 0.812, 0.8409, 0.8658, 0.887, 0.9051, 0.9204, 0.9334, 0.9444, 0.9536, 0.9614, 0.9679, 0.9733, 0.9778, 0.9816, 0.9848, 0.9874, 0.9896, 0.9914, 0.9929, 0.9942, 0.9952, 0.996, 0.9967, 0.9973, 0.9978, 0.9982, 1)',
  /** zeta 0.70, 4.6% overshoot: only the hand lifting on your turn. */
  bouncy:
    'linear(0, 0.014, 0.0516, 0.1065, 0.1736, 0.2484, 0.3273, 0.4072, 0.4857, 0.5611, 0.632, 0.6974, 0.7568, 0.8099, 0.8566, 0.897, 0.9315, 0.9603, 0.9839, 1.0029, 1.0177, 1.0288, 1.0367, 1.0419, 1.0448, 1.046, 1.0456, 1.0441, 1.0417, 1.0387, 1.0353, 1.0317, 1.028, 1.0244, 1.0209, 1.0176, 1.0145, 1.0117, 1.0092, 1.007, 1.0051, 1.0035, 1.0021, 1.001, 1, 0.9993, 0.9988, 0.9984, 0.9981, 0.998, 0.9979, 0.9979, 0.998, 0.9981, 0.9982, 0.9983, 1)',
  /** zeta 0.68, ~3% of the final width: only the dock growing into its buttons. */
  grow:
    'linear(0, 0.0147, 0.0542, 0.112, 0.1824, 0.2609, 0.3433, 0.4265, 0.508, 0.5859, 0.6586, 0.7254, 0.7854, 0.8386, 0.8849, 0.9245, 0.9576, 0.9848, 1.0065, 1.0234, 1.036, 1.0448, 1.0504, 1.0534, 1.0543, 1.0534, 1.0512, 1.048, 1.0442, 1.0399, 1.0354, 1.0309, 1.0265, 1.0223, 1.0183, 1.0147, 1.0115, 1.0086, 1.0061, 1.004, 1.0022, 1.0008, 0.9996, 0.9987, 0.998, 0.9975, 0.9972, 0.9971, 0.9971, 0.9971, 0.9972, 0.9974, 0.9976, 0.9978, 0.9981, 0.9983, 1)',
} as const

/** Durations (ms), matching --dur-quick / --dur-base. */
export const DUR = { quick: 200, base: 460 } as const

const REDUCE = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches
}

function subscribeReduce(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Live prefers-reduced-motion, for components that branch on it while rendering. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, prefersReducedMotion, () => false)
}

export interface PlayOptions extends KeyframeAnimationOptions {
  /** One of EASE's keys, or any CSS easing. Defaults to the spring. */
  ease?: keyof typeof EASE | string
}

/**
 * element.animate() with the Stage defaults: the spring, `fill: 'backwards'` (the element
 * already holds its final state; the animation only shows the way there), and nothing at
 * all under reduced motion. Returns the Animation, or null when skipped.
 */
export function play(el: Element | null | undefined, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: PlayOptions = {}): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function' || prefersReducedMotion()) return null
  const { ease = 'spring', ...rest } = options
  const easing = ease in EASE ? EASE[ease as keyof typeof EASE] : ease
  return el.animate(keyframes, { duration: DUR.base, fill: 'backwards', easing, ...rest })
}

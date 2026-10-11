/**
 * Icons: the handful of custom line icons the Stage prototype uses. Each is a 24 x 24
 * (chevrons 16 x 16) stroke drawing in currentColor, decorative (aria-hidden): the
 * control that holds it carries the accessible name.
 *
 *   <IconLog />  <IconMore />  <IconChevronRight />  <IconBack />
 *   <IconAlert />  <IconInfo />  <IconClose />  <IconCoach />
 *
 * Props: className (size it with Tailwind, e.g. "size-5"); strokeWidth (default 1.6).
 */
import type { ReactNode } from 'react'

export interface IconProps {
  className?: string
  strokeWidth?: number
}

function Svg({ className = 'size-5', strokeWidth = 1.6, viewBox = '0 0 24 24', children }: IconProps & { viewBox?: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** The hand log: three lines with bullets. */
export function IconLog(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7h10M9 12h10M9 17h7" />
      <circle cx="5" cy="7" r=".6" />
      <circle cx="5" cy="12" r=".6" />
      <circle cx="5" cy="17" r=".6" />
    </Svg>
  )
}

/** The overflow menu: three dots. */
export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="18" cy="12" r="1.1" />
    </Svg>
  )
}

/** Disclosure and "Show the maths" chevron (16 x 16 box). Rotate it for an open state. */
export function IconChevronRight({ className = 'size-3.5', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg className={className} strokeWidth={strokeWidth} viewBox="0 0 16 16">
      <path d="M6 3.5L10.5 8 6 12.5" />
    </Svg>
  )
}

/** Back (the sizing face's way out). */
export function IconBack({ className = 'size-[22px]', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg className={className} strokeWidth={strokeWidth}>
      <path d="M14.5 6.5L9 12l5.5 5.5" />
    </Svg>
  )
}

/** An error or warning: a circle with an exclamation mark. Colour it text-close. */
export function IconAlert({ className = 'size-6', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg className={className} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.2M12 16.2v.1" />
    </Svg>
  )
}

/** More information: a circle with an i. */
export function IconInfo({ className = 'size-4', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg className={className} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.8v.1" />
    </Svg>
  )
}

/** Close / dismiss. */
export function IconClose({ className = 'size-4', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg className={className} strokeWidth={strokeWidth}>
      <path d="M7 7l10 10M17 7L7 17" />
    </Svg>
  )
}

/** The coach: a faint ring with a signal-blue arc ("Ask the coach"). Fixed colours. */
export function IconCoach({ className = 'size-[22px]' }: Pick<IconProps, 'className'>) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" stroke="rgba(41,151,255,.35)" strokeWidth="3" />
      <path d="M12 4a8 8 0 0 1 8 8" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

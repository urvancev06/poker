/**
 * Capsule: the button. Always a true capsule (radius = height / 2, never squircled).
 *
 *   variant  primary    ink fill, black label: the one thing to do (Next hand, Try again)
 *            secondary  white 10% on glass: the dock's Fold / Call / Raise
 *            quiet      white 7% with a top highlight: New game, Done, Ask the coach
 *   size     sm 34 px (14 px label)   top bar
 *            md 44 px (15 px label)   sheets, menus, notices
 *            lg 48 px (17 px label)   the dock (48 inside the 64 px dock: concentric)
 *
 * Any button attribute passes through (onClick, disabled, aria-*, ref). Disabled fades to
 * 45%. It presses to 97% on the spring. Numbers in labels are tabular.
 */
import type { ComponentPropsWithRef } from 'react'

export type CapsuleVariant = 'primary' | 'secondary' | 'quiet'
export type CapsuleSize = 'sm' | 'md' | 'lg'

export type CapsuleProps = ComponentPropsWithRef<'button'> & {
  variant?: CapsuleVariant
  size?: CapsuleSize
}

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 tabular-nums select-none ' +
  'transition-[background-color,color,opacity,transform] duration-200 ease-spring enabled:active:scale-[0.97] ' +
  'disabled:cursor-default disabled:opacity-45'

const VARIANT: Record<CapsuleVariant, string> = {
  primary: 'bg-ink text-black enabled:hover:bg-white focus-visible:outline-offset-3',
  secondary: 'bg-act text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] enabled:hover:bg-act-hi',
  quiet: 'bg-quiet text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] enabled:hover:bg-quiet-hi',
}

const SIZE: Record<CapsuleSize, string> = {
  sm: 'h-[34px] px-[15px] text-[14px] font-medium',
  md: 'h-11 min-w-16 px-[18px] text-callout font-semibold',
  lg: 'h-12 min-w-28 px-6 text-body font-semibold tracking-[-0.015em]',
}

export function Capsule({ variant = 'quiet', size = 'md', className = '', type = 'button', ...rest }: CapsuleProps) {
  return <button type={type} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest} />
}

/**
 * Glass: the one material that floats over light (the dock over the atmosphere). Fill,
 * backdrop blur, and the light-logic rim: a hairline, a top specular, and a blue lower
 * edge because the light comes from below; then the deep two-part shadow.
 *
 * Use it once per screen (backdrop-filter budget: <= 2 on desktop, 1 on a phone). Over the
 * void, where nothing sits behind, use the opaque `material-sheet` utility instead.
 *
 *   <Glass shape="capsule" className="h-16 p-2">...</Glass>
 *
 * Props: as ('div' | 'section' | 'aside' | 'nav' | 'header', default 'div');
 * shape ('capsule' = radius height/2, 'sheet' = 30 px squircle, 'none'); any HTML attribute
 * and ref. For a glass built in parts (a blurred box that never resizes plus a rim that
 * follows a clip-path), use the `material-glass` and `glass-rim` utilities directly.
 */
import type { ComponentPropsWithRef } from 'react'

type GlassTag = 'div' | 'section' | 'aside' | 'nav' | 'header'

export type GlassProps = ComponentPropsWithRef<'div'> & {
  as?: GlassTag
  shape?: 'capsule' | 'sheet' | 'none'
}

const SHAPE = {
  capsule: 'rounded-full',
  sheet: 'rounded-sheet squircle',
  none: '',
} as const

export function Glass({ as: Tag = 'div', shape = 'capsule', className = '', ...rest }: GlassProps) {
  return <Tag className={`material-glass ${SHAPE[shape]} ${className}`} {...rest} />
}

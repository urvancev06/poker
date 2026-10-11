/**
 * IconButton: a circular button holding one icon (the log, the "..." menu, info, back).
 * `label` is required: it becomes the accessible name and, unless `title` is given, the
 * hover title (add the shortcut there, e.g. title="Hand log (L)").
 *
 *   size     sm 34 px (top bar)  md 44 px  lg 48 px (dock, concentric in the 64 px glass)
 *   variant  quiet (white 7%, default) | secondary (white 10%, on glass)
 *
 * Shows its open state from aria-expanded / aria-pressed (a lighter fill). Any button
 * attribute passes through.
 */
import type { ComponentPropsWithRef, ReactNode } from 'react'

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  label: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'quiet' | 'secondary'
}

const SIZE = { sm: 'size-[34px]', md: 'size-11', lg: 'size-12' } as const
const VARIANT = {
  quiet:
    'bg-quiet shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] enabled:hover:bg-quiet-hi aria-expanded:bg-quiet-hi aria-pressed:bg-quiet-hi',
  secondary:
    'bg-act shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] enabled:hover:bg-act-hi aria-expanded:bg-act-hi aria-pressed:bg-act-hi',
} as const

export function IconButton({ label, title, size = 'sm', variant = 'quiet', className = '', type = 'button', children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={`grid shrink-0 place-items-center rounded-full border-0 p-0 text-ink transition-[background-color,transform] duration-200 ease-spring enabled:active:scale-[0.95] disabled:cursor-default disabled:opacity-45 ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

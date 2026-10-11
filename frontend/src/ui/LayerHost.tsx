/**
 * LayerHost: gives a view a place for its overlays. Sheets and tooltips rendered inside it
 * portal into its own (unstyled, untransformed) element, so they stay position: fixed to
 * the viewport and hide when the view is hidden. The shell wraps every view in one.
 */
import { useCallback, useState, type ReactNode } from 'react'
import { LayerContext } from './layerContext'

export function LayerHost({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  // Keep the element while a hidden <Activity> detaches refs: the host is display: none
  // then, so whatever is portalled into it hides with the view instead of moving to <body>.
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node) setEl(node)
  }, [])
  return (
    <LayerContext value={el}>
      {children}
      <div ref={attach} data-layer-host="" />
    </LayerContext>
  )
}

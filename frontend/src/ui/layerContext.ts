// Where overlays (sheets, tooltips) portal to. Each view in the shell renders a LayerHost,
// so a view's overlays live inside that view's subtree: when the view is hidden (React
// <Activity>), its open sheet hides with it. Outside any host they portal to <body>.

import { createContext, useContext } from 'react'

/** undefined: no host (use <body>); null: a host that has not mounted yet. */
export const LayerContext = createContext<HTMLElement | null | undefined>(undefined)

/** The element overlays should portal into, or null while their host is not mounted. */
export function useLayerTarget(): HTMLElement | null {
  const host = useContext(LayerContext)
  if (host !== undefined) return host
  return typeof document === 'undefined' ? null : document.body
}

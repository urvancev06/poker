// Request paths that carry options. Pure, so the options are tested without a server.

/** POST /session/{id}/advance; with `warm`, the server builds the flop's equity matrix when
 *  the step leaves you on a flop, so the coach's flop answer is quick (D18). The table sends
 *  it while the coach is on (any mode but off). */
export function advancePath(id: string, warm: boolean): string {
  return `/session/${encodeURIComponent(id)}/advance${warm ? '?warm_coach=true' : ''}`
}

// Loads GET /lab/archetypes once: the five archetypes, their target bands and default
// knobs, the knob ranges, the default lineup and the hands cap. The answer never changes
// while the server runs, so it is kept once it lands; only a failure is retried.
//
// The view stays mounted while hidden (<Activity>) and its effects re-run when it is shown
// again: a load that was cut off by hiding starts again then, a loaded one does not.

import { useCallback, useEffect, useState } from 'react'
import { api, type LabArchetypesInfo } from '../../api'
import { toApiError, type ApiError } from '../../lib/apiError'

export interface LabInfoLoad {
  info: LabArchetypesInfo | null
  error: ApiError | null
  /** A retry is in flight (the notice stays up, busy, until it lands). */
  retrying: boolean
  retry: () => void
}

export function useLabInfo(): LabInfoLoad {
  const [info, setInfo] = useState<LabArchetypesInfo | null>(null)
  const [error, setError] = useState<{ err: ApiError; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loaded = info !== null

  useEffect(() => {
    if (loaded) return
    let live = true
    api.labArchetypes().then(
      (i) => {
        if (!live) return
        setInfo(i)
        setError(null)
      },
      (e: unknown) => {
        if (live) setError({ err: toApiError(e), attempt })
      },
    )
    return () => {
      live = false
    }
  }, [loaded, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { info, error: error?.err ?? null, retrying: error !== null && error.attempt !== attempt, retry }
}

// Entry of the dev-only coach harness (frontend/coach-harness.html). Vite builds only
// index.html, so none of this ships; the guard below also refuses to run in a build.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import '../../../index.css'
import { CoachHarness } from './CoachHarness'

if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CoachHarness />
    </StrictMode>,
  )
}

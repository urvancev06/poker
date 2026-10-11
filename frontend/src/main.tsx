import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// One family (index.css --font): SF Pro on Apple devices, Inter Variable with its optical
// size axis everywhere else. Self-hosted, never pulled from a CDN.
import '@fontsource-variable/inter/opsz.css'

import './index.css'
import App from './App.tsx'
import { PrefsProvider } from './prefs'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <App />
    </PrefsProvider>
  </StrictMode>,
)

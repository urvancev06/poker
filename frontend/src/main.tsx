import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Mono Minimal — Editorial (references/DESIGN.md): Sora for UI/headings, IBM Plex
// Mono for every number and caps micro-label. Bundled locally (no CDN).
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/ibm-plex-mono/300.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'

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

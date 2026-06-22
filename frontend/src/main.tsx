import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Felt & Brass typography, bundled locally (no CDN): Fraunces for display,
// Hanken Grotesk for UI/body. See DESIGN.md §2.
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/hanken-grotesk/800.css'

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

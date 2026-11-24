import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

registerSW({ immediate: true })
// Storage marked persistent is exempt from eviction when the disk runs short.
// WebKit grants it by heuristics, one of which is being opened from the Home Screen.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Capture the browser's install prompt before React renders
import './pwa/installPrompt'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

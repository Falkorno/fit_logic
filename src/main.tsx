import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installGlobalErrorMonitoring, reportAppIssue } from './lib/errorMonitor.js'

installGlobalErrorMonitoring()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)


const secureHostedApp = location.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)
if ('serviceWorker' in navigator && (import.meta.env.PROD || secureHostedApp)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.error('Service worker registration failed:', error)
    reportAppIssue('pwa', error)
  }))
}
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initNotificationListener } from './stores/notificationStore'

initNotificationListener()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

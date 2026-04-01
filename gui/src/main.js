import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router.js'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// ── NWC Deep Link Protocol Handler (NIP-47) ─────────────────────────
// Register web+nostrnwc:// so the browser routes deep links to /connect.
// Browsers require the "web+" prefix for custom protocol handlers.
// The %s placeholder is replaced by the full URI by the browser.
try {
  if (navigator.registerProtocolHandler) {
    navigator.registerProtocolHandler(
      'web+nostrnwc',
      `${window.location.origin}/connect?deeplink=%s`,
      'NUTbits NWC',
    )
  }
} catch { /* non-fatal — some browsers restrict this */ }

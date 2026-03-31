import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'nutbits-token-provider',
      configureServer(server) {
        server.middlewares.use('/__nutbits/token', (_req, res) => {
          const tokenPath = path.join(os.homedir(), '.nutbits', 'nutbits.sock.token')
          try {
            const token = fs.readFileSync(tokenPath, 'utf-8').trim()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, token }))
          } catch {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Token file not found at ' + tokenPath }))
          }
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3338',
        changeOrigin: true,
      },
    },
  },
})

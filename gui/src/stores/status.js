import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useStatusStore = defineStore('status', {
  state: () => ({
    status: {},
    loading: false,
    error: null,
    lastSuccessAt: null,
  }),

  getters: {
    /**
     * Convert uptime_ms to a human-readable string like "2d 5h 13m".
     */
    uptimeFormatted(state) {
      const ms = state.status.uptime_ms
      if (ms == null) return '--'
      const totalSec = Math.floor(ms / 1000)
      const days = Math.floor(totalSec / 86400)
      const hours = Math.floor((totalSec % 86400) / 3600)
      const minutes = Math.floor((totalSec % 3600) / 60)
      const parts = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0) parts.push(`${hours}h`)
      parts.push(`${minutes}m`)
      return parts.join(' ')
    },

    /**
     * True when the mint reports as healthy.
     */
    isHealthy(state) {
      return state.status.mint?.healthy === true
    },

    backendConnected(state) {
      return state.lastSuccessAt != null && !state.error
    },
  },

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        this.status = await api.get('/api/v1/status')
        this.lastSuccessAt = Date.now()
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})

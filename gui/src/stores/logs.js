import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useLogsStore = defineStore('logs', {
  state: () => ({
    logs: [],
    loading: false,
    error: null,
  }),

  actions: {
    /**
     * Fetch recent log entries.
     * @param {'debug'|'info'|'warning'|'error'} [level='info']
     * @param {number} [limit=100]
     */
    async fetch(level = 'info', limit = 100) {
      this.loading = true
      this.error = null
      try {
        const data = await api.get(
          `/api/v1/logs?level=${encodeURIComponent(level)}&limit=${limit}`,
        )
        this.logs = Array.isArray(data) ? data : data.logs || []
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
  },
})

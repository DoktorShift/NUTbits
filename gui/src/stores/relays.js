import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useRelaysStore = defineStore('relays', {
  state: () => ({
    relays: [],
    connected: 0,
    total: 0,
    loading: false,
    error: null,
  }),

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const data = await api.get('/api/v1/relays')
        if (Array.isArray(data)) {
          this.relays = data
          this.connected = data.filter((r) => r.connected).length
          this.total = data.length
        } else {
          this.relays = data.relays || []
          this.connected = data.connected ?? this.relays.filter((r) => r.connected).length
          this.total = data.total ?? this.relays.length
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
  },
})

import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useMintsStore = defineStore('mints', {
  state: () => ({
    mints: [],
    activeMint: '',
    nuts: {},
    loading: false,
    error: null,
  }),

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const data = await api.get('/api/v1/mints')
        this.mints = Array.isArray(data) ? data : data.mints || []
        this.activeMint = data?.active_mint || this.mints.find((m) => m.active)?.url || ''
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    async fetchNuts() {
      this.loading = true
      this.error = null
      try {
        this.nuts = await api.get('/api/v1/nuts')
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    async setActiveMint(url) {
      this.loading = true
      this.error = null
      try {
        const data = await api.post('/api/v1/mints/active', { url })
        this.activeMint = data?.active_mint || url
        await this.fetch()
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})

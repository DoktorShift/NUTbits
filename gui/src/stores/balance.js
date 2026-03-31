import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useBalanceStore = defineStore('balance', {
  state: () => ({
    total_sats: 0,
    mints: [],
    loading: false,
    error: null,
  }),

  getters: {
    /**
     * Total sats formatted with comma separators (e.g. "1,234,567").
     */
    formattedTotal(state) {
      return state.total_sats.toLocaleString('en-US')
    },
  },

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const data = await api.get('/api/v1/balance')
        this.total_sats = data.total_sats
        this.mints = data.mints
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
  },
})

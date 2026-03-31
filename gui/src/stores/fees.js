import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useFeesStore = defineStore('fees', {
  state: () => ({
    fees: {},
    loading: false,
    error: null,
  }),

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        this.fees = await api.get('/api/v1/fees')
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
  },
})

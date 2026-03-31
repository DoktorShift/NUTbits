import { defineStore } from 'pinia'
import api from '@/api/client.js'

/**
 * Build a query-string from a filters object, omitting empty/null values.
 * @param {Record<string, any>} params
 * @returns {string}
 */
function toQuery(params) {
  const parts = []
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export const useHistoryStore = defineStore('history', {
  state: () => ({
    transactions: [],
    total: 0,
    loading: false,
    error: null,
    filters: {
      type: '',
      connection: '',
      limit: 50,
    },
  }),

  getters: {
    /**
     * Only incoming (receive) transactions.
     */
    incoming(state) {
      return state.transactions.filter((tx) => tx.type === 'incoming')
    },

    /**
     * Only outgoing (pay) transactions.
     */
    outgoing(state) {
      return state.transactions.filter((tx) => tx.type === 'outgoing')
    },
  },

  actions: {
    /**
     * Fetch transaction history, optionally overriding stored filters.
     * @param {Object} [filters]
     * @param {string} [filters.type]
     * @param {string} [filters.connection]
     * @param {number} [filters.limit]
     * @param {string} [filters.from]   ISO date string
     * @param {string} [filters.until]  ISO date string
     */
    async fetch(filters) {
      this.loading = true
      this.error = null
      try {
        const params = { ...this.filters, ...filters }
        const data = await api.get(`/api/v1/history${toQuery(params)}`)
        if (Array.isArray(data)) {
          this.transactions = data
          this.total = data.length
        } else {
          this.transactions = data.transactions || data.items || []
          this.total = data.total ?? this.transactions.length
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    /**
     * Export transaction history.
     * @param {'json'|'csv'} format
     * @param {Object}       [filters]
     * @returns {Promise<any>}
     */
    async exportHistory(format = 'json', filters) {
      try {
        const params = { format, ...this.filters, ...filters }
        return await api.get(`/api/v1/history/export${toQuery(params)}`)
      } catch (err) {
        this.error = err.message
        throw err
      }
    },
  },
})

import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useConnectionsStore = defineStore('connections', {
  state: () => ({
    connections: [],
    loading: false,
    error: null,
  }),

  getters: {
    /**
     * Number of connections that have not been revoked.
     */
    activeCount(state) {
      return state.connections.filter((c) => !c.revoked).length
    },

    /**
     * Sum of tx_count across all connections.
     */
    totalTxCount(state) {
      return state.connections.reduce((sum, c) => sum + (c.tx_count || 0), 0)
    },
  },

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        this.connections = await api.get('/api/v1/connections')
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    /**
     * Create a new NWC connection.
     * @param {{ label: string, permissions: string[], mint?: string, max_daily_sats?: number, max_payment_sats?: number, service_fee_ppm?: number, service_fee_base?: number, lud16?: string }} data
     * @returns {Promise<any>} the created connection object
     */
    async create(data) {
      this.loading = true
      this.error = null
      try {
        const result = await api.post('/api/v1/connections', data)
        await this.fetch()
        return result
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },

    /**
     * Update a connection's metadata (e.g. lud16).
     * @param {string} pubkey
     * @param {{ lud16?: string|null }} fields
     */
    async update(pubkey, fields) {
      try {
        const result = await api.patch(`/api/v1/connections/${pubkey}`, fields)
        await this.fetch()
        return result
      } catch (err) {
        this.error = err.message
        throw err
      }
    },

    /**
     * Revoke a connection by its app pubkey.
     * @param {string} pubkey
     */
    async revoke(pubkey) {
      this.loading = true
      this.error = null
      try {
        await api.del(`/api/v1/connections/${pubkey}`)
        await this.fetch()
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },

    /**
     * Export all connections.
     * @param {boolean} includeRevoked
     * @returns {Promise<any>}
     */
    async exportAll(includeRevoked = false) {
      try {
        return await api.get(
          `/api/v1/connections/export?include_revoked=${includeRevoked}`,
        )
      } catch (err) {
        this.error = err.message
        throw err
      }
    },
  },
})

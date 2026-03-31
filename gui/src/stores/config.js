import { defineStore } from 'pinia'
import api from '@/api/client.js'

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: {},
    envOptions: [],
    envFileExists: true,
    loading: false,
    error: null,
  }),

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const data = await api.get('/api/v1/config')
        this.config = {
          ...data,
          mint_url: data.active_mint || data.mint_url || '',
          storage_backend: data.storage || data.storage_backend || '',
          fee_reserve_percent: data.fee_reserve_pct ?? data.fee_reserve_percent ?? null,
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    async fetchEnv() {
      this.loading = true
      this.error = null
      try {
        const data = await api.get('/api/v1/config/env')
        const options = Array.isArray(data) ? data : (data.options || [])
        this.envOptions = options.map((option) => ({
          ...option,
          description: option.description || option.desc || '',
          restart_required: option.restart_required ?? option.restart ?? false,
        }))
        this.envFileExists = data?.file_exists !== false
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    /**
     * Update a runtime configuration value.
     * @param {string} key
     * @param {any}    value
     */
    async updateConfig(key, value) {
      this.loading = true
      this.error = null
      try {
        await api.post('/api/v1/config', { key, value })
        await this.fetch()
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },

    /**
     * Update an environment-level configuration value.
     * @param {string}  key
     * @param {any}     value
     * @param {boolean} [confirmSensitive]  confirm overwriting a sensitive value
     */
    async updateEnv(key, value, confirmSensitive = false) {
      this.loading = true
      this.error = null
      try {
        const result = await api.post('/api/v1/config/env', {
          key,
          value,
          confirm_sensitive: confirmSensitive,
        })
        await this.fetchEnv()
        return result
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})

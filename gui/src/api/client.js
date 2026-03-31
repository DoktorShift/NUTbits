/**
 * NUTbits API client.
 *
 * Reads credentials from localStorage:
 *   nutbits_api_token  - Bearer token
 *   nutbits_api_url    - Base URL (default '' = same-origin / Vite proxy)
 */

class ApiClient {
  _autoDetected = false
  _requestTimeoutMs = 15000

  _bootstrapTargets() {
    const targets = []
    if (this._baseUrl) {
      targets.push(this._baseUrl)
    }

    if (typeof window !== 'undefined') {
      const host = window.location.hostname
      if (!this._baseUrl && (host === 'localhost' || host === '127.0.0.1')) {
        targets.push('http://127.0.0.1:3338')
      }
    }

    return [...new Set(targets)]
  }

  async _bootstrapFrom(baseUrl) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const res = await fetch(`${baseUrl}/api/v1/bootstrap`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

      const json = await res.json()
      const data = json?.data || json
      if (!data?.token) {
        return { ok: false, error: 'No token in bootstrap response' }
      }

      localStorage.setItem('nutbits_api_token', data.token)
      localStorage.setItem('nutbits_api_url', data.api_url || baseUrl)
      this._autoDetected = true
      return { ok: true, source: 'local-bootstrap', apiUrl: data.api_url || baseUrl }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err?.name === 'AbortError') {
        return { ok: false, error: 'Bootstrap timed out' }
      }
      return { ok: false, error: 'Bootstrap unavailable' }
    }
  }

  /**
   * Attempt to auto-detect the API token from the local NUTbits installation.
   * In dev mode, the Vite server exposes ~/.nutbits/nutbits.sock.token via
   * a local middleware. In production, this is a no-op.
   *
   * @returns {Promise<{ok: boolean, source?: string, error?: string}>}
   */
  async autoDetectToken() {
    // Skip if token is already configured
    if (localStorage.getItem('nutbits_api_token')) {
      this._autoDetected = true
      return { ok: true, source: 'localStorage' }
    }

    try {
      const res = await fetch('/__nutbits/token')
      if (!res.ok) {
        for (const baseUrl of this._bootstrapTargets()) {
          const result = await this._bootstrapFrom(baseUrl)
          if (result.ok) return result
        }
        return { ok: false, error: 'Token endpoint not available' }
      }
      const data = await res.json()
      if (data.ok && data.token) {
        localStorage.setItem('nutbits_api_token', data.token)
        this._autoDetected = true
        return { ok: true, source: '~/.nutbits/nutbits.sock.token' }
      }
      for (const baseUrl of this._bootstrapTargets()) {
        const result = await this._bootstrapFrom(baseUrl)
        if (result.ok) return result
      }
      return { ok: false, error: data.error || 'No token in response' }
    } catch {
      for (const baseUrl of this._bootstrapTargets()) {
        const result = await this._bootstrapFrom(baseUrl)
        if (result.ok) return result
      }
      return { ok: false, error: 'Could not reach token provider' }
    }
  }

  clearStoredAuth() {
    localStorage.removeItem('nutbits_api_token')
  }

  async recoverAuth() {
    this.clearStoredAuth()

    for (const baseUrl of this._bootstrapTargets()) {
      const result = await this._bootstrapFrom(baseUrl)
      if (result.ok) return result
    }

    return { ok: false, error: 'No local bootstrap available' }
  }
  /** @returns {string} */
  get _baseUrl() {
    return (localStorage.getItem('nutbits_api_url') || '').replace(/\/+$/, '')
  }

  /** @returns {Record<string, string>} */
  _headers(hasBody = false) {
    const h = {}
    const token = localStorage.getItem('nutbits_api_token')
    if (token) {
      h['Authorization'] = `Bearer ${token}`
    }
    if (hasBody) {
      h['Content-Type'] = 'application/json'
    }
    return h
  }

  /**
   * Internal request helper.
   * @param {string} method
   * @param {string} path
   * @param {any}    [body]
   * @returns {Promise<any>}
   */
  async _request(method, path, body) {
    const url = `${this._baseUrl}${path}`
    const hasBody = body !== undefined
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this._requestTimeoutMs)
    const opts = {
      method,
      headers: this._headers(hasBody),
      signal: controller.signal,
    }
    if (hasBody) {
      opts.body = JSON.stringify(body)
    }

    let res
    try {
      res = await fetch(url, opts)
    } catch (err) {
      clearTimeout(timeoutId)
      if (err?.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(this._requestTimeoutMs / 1000)}s`)
      }
      throw new Error('Could not reach NUTbits API')
    }
    clearTimeout(timeoutId)

    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const json = await res.json()
        if (json.detail) msg = json.detail
        else if (json.error) msg = json.error
        else if (json.message) msg = json.message
      } catch { /* ignore parse errors */ }
      if (res.status === 401) {
        msg = `${msg}. Check the API token in Settings.`
      }
      throw new Error(msg)
    }

    const json = await res.json()

    if (json.ok === false) {
      throw new Error(json.error || json.message || 'Unknown API error')
    }

    // If the response wraps data in a `data` field alongside `ok: true`, unwrap it.
    if (json.ok === true && 'data' in json) {
      return json.data
    }

    return json
  }

  /**
   * GET request.
   * @param {string} path
   * @returns {Promise<any>}
   */
  get(path) {
    return this._request('GET', path)
  }

  /**
   * POST request.
   * @param {string} path
   * @param {any}    body
   * @returns {Promise<any>}
   */
  post(path, body) {
    return this._request('POST', path, body)
  }

  /**
   * PATCH request.
   * @param {string} path
   * @param {any}    body
   * @returns {Promise<any>}
   */
  patch(path, body) {
    return this._request('PATCH', path, body)
  }

  /**
   * DELETE request.
   * @param {string} path
   * @returns {Promise<any>}
   */
  del(path) {
    return this._request('DELETE', path)
  }
}

export default new ApiClient()

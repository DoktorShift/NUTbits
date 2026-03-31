import { reactive } from 'vue'

/** Shared reactive toast list (singleton across all consumers). */
const toasts = reactive([])

let nextId = 0

/**
 * Composable providing a simple toast notification system.
 *
 * @returns {{
 *   toasts: Array<{ id: number, message: string, type: string, removing: boolean }>,
 *   addToast: (message: string, type?: string, duration?: number) => number,
 *   removeToast: (id: number) => void,
 *   success: (message: string, duration?: number) => number,
 *   error: (message: string, duration?: number) => number,
 *   warning: (message: string, duration?: number) => number,
 *   info: (message: string, duration?: number) => number
 * }}
 */
export function useToast() {
  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration  ms before auto-removal (0 = manual only)
   * @returns {number} toast id
   */
  function addToast(message, type = 'info', duration = 4000) {
    const id = nextId++
    toasts.push({ id, message, type, removing: false })
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
    return id
  }

  /**
   * Remove a toast by id with exit animation.
   * @param {number} id
   */
  function removeToast(id) {
    const toast = toasts.find((t) => t.id === id)
    if (toast) {
      toast.removing = true
      setTimeout(() => {
        const idx = toasts.findIndex((t) => t.id === id)
        if (idx !== -1) toasts.splice(idx, 1)
      }, 300)
    }
  }

  function success(message, duration) {
    return addToast(message, 'success', duration)
  }

  function error(message, duration) {
    return addToast(message, 'error', duration)
  }

  function warning(message, duration) {
    return addToast(message, 'warning', duration)
  }

  function info(message, duration) {
    return addToast(message, 'info', duration)
  }

  return { toasts, addToast, removeToast, success, error, warning, info }
}

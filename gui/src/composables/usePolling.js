import { ref, onUnmounted } from 'vue'

/**
 * Composable that polls a function at a fixed interval.
 *
 * @param {() => Promise<void>} fetchFn  - async function to call
 * @param {number}              intervalMs - polling interval (default 10 000 ms)
 * @returns {{ start: () => void, stop: () => void, isPolling: import('vue').Ref<boolean> }}
 */
export function usePolling(fetchFn, intervalMs = 10000) {
  const isPolling = ref(false)
  let timerId = null

  function start() {
    if (timerId !== null) return // already running
    isPolling.value = true
    fetchFn() // fire immediately
    timerId = setInterval(fetchFn, intervalMs)
  }

  function stop() {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
    isPolling.value = false
  }

  onUnmounted(stop)

  return { start, stop, isPolling }
}

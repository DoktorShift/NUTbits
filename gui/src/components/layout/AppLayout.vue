<script setup>
import { ref } from 'vue'
import Sidebar from './Sidebar.vue'
import Header from './Header.vue'
import Toast from '../ui/Toast.vue'
import { useToast } from '../../composables/useToast.js'

defineProps({
  connected: {
    type: Boolean,
    default: false,
  },
})

const { toasts, removeToast } = useToast()
const sidebarOpen = ref(false)

function openSidebar() {
  sidebarOpen.value = true
}

function closeSidebar() {
  sidebarOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-nutbits-950">
    <Sidebar :open="sidebarOpen" @close="closeSidebar" />

    <div class="min-h-screen flex flex-col lg:ml-56">
      <Header :connected="connected" @toggle-nav="openSidebar" />

      <main class="flex-1 p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>

    <!-- Toast container -->
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-3 sm:bottom-6 sm:right-6">
      <TransitionGroup
        name="toast"
        tag="div"
        class="flex flex-col-reverse gap-3"
      >
        <Toast
          v-for="toast in toasts"
          :key="toast.id"
          :toast="toast"
          @close="removeToast"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.3s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(2rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}
</style>

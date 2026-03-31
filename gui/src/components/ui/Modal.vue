<script setup>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  maxWidth: {
    type: String,
    default: '32rem',
  },
})

const emit = defineEmits(['close'])

const isOpen = computed(() => props.open || props.show)

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) {
    emit('close')
  }
}

function onOverlayClick(e) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

watch(isOpen, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-overlay">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click="onOverlayClick"
      >
        <Transition name="modal-content" appear>
          <div
            class="bg-nutbits-900 border border-nutbits-700 rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh]"
            :style="{ maxWidth: maxWidth }"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-6 py-4 border-b border-nutbits-700 shrink-0"
            >
              <h2 class="text-lg font-semibold text-nutbits-100">{{ title }}</h2>
              <button
                class="text-nutbits-400 hover:text-nutbits-100 transition-colors text-xl leading-none p-1"
                @click="emit('close')"
              >
                &times;
              </button>
            </div>

            <!-- Body -->
            <div class="px-6 py-5 overflow-y-auto flex-1">
              <slot />
            </div>

            <!-- Footer -->
            <div
              v-if="$slots.footer"
              class="px-6 py-4 border-t border-nutbits-700 shrink-0"
            >
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay-enter-active,
.modal-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.modal-overlay-enter-from,
.modal-overlay-leave-to {
  opacity: 0;
}

.modal-content-enter-active {
  transition: all 0.2s ease-out;
}

.modal-content-leave-active {
  transition: all 0.15s ease-in;
}

.modal-content-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.modal-content-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>

<script setup>
/**
 * Stepper.vue — Vertical step indicator for multi-step flows.
 *
 * Props:
 *   steps    — Array of { id, label } step definitions
 *   current  — id of the currently active step
 *
 * Emits nothing — display-only. The parent controls which step is active.
 */
defineProps({
  steps: {
    type: Array,
    required: true,
    // Each entry: { id: string, label: string }
  },
  current: {
    type: String,
    required: true,
  },
})

function stepState(stepId, steps, current) {
  var idx = steps.findIndex(s => s.id === stepId)
  var curIdx = steps.findIndex(s => s.id === current)
  if (idx < curIdx) return 'completed'
  if (idx === curIdx) return 'active'
  return 'pending'
}
</script>

<template>
  <nav class="stepper" aria-label="Progress">
    <ol class="stepper-list">
      <li
        v-for="(step, i) in steps"
        :key="step.id"
        class="stepper-item"
        :class="stepState(step.id, steps, current)"
      >
        <!-- Connector line (not on first) -->
        <div v-if="i > 0" class="stepper-line" />

        <div class="stepper-row">
          <!-- Circle indicator -->
          <div class="stepper-circle">
            <!-- Completed: checkmark -->
            <svg v-if="stepState(step.id, steps, current) === 'completed'" viewBox="0 0 16 16" fill="currentColor" class="stepper-icon">
              <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2.5-2.5a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/>
            </svg>
            <!-- Active / Pending: step number -->
            <span v-else class="stepper-num">{{ i + 1 }}</span>
          </div>

          <!-- Label -->
          <span class="stepper-label">{{ step.label }}</span>
        </div>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.stepper-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  padding: 0;
  margin: 0;
}

.stepper-item {
  position: relative;
  display: flex;
  flex-direction: column;
}

.stepper-line {
  width: 2px;
  height: 16px;
  margin-left: 13px;
  background: #2a2827;
  transition: background 0.3s ease;
}

.stepper-item.completed .stepper-line {
  background: #f59e0b;
}

.stepper-item.active .stepper-line {
  background: #f59e0b;
}

.stepper-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.stepper-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid #2a2827;
  background: #1a1918;
  color: #625a52;
  transition: all 0.3s ease;
}

.stepper-item.active .stepper-circle {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.stepper-item.completed .stepper-circle {
  border-color: #f59e0b;
  background: #f59e0b;
  color: #0f0e0d;
}

.stepper-icon {
  width: 14px;
  height: 14px;
}

.stepper-num {
  font-size: 0.75rem;
  font-weight: 600;
}

.stepper-label {
  font-size: 0.82rem;
  font-weight: 500;
  color: #625a52;
  transition: color 0.3s ease;
}

.stepper-item.active .stepper-label {
  color: #e8e0d8;
}

.stepper-item.completed .stepper-label {
  color: #a99f96;
}
</style>

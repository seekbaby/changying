<template>
  <span class="timer-display" :class="{ overdue, warning }">
    <span class="timer-icon">{{ overdue ? '⏰' : '⏱' }}</span>
    <span class="timer-text">{{ display }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  deadlineAt: { type: Number, default: null },
  showIcon: { type: Boolean, default: true }
})

const now = computed(() => Date.now())

let interval = null
// Reactive clock via interval in parent; this component is simple display
// It re-computes whenever the parent re-renders (via v-if key or similar)
// For standalone use, it can use a setInterval internally

const remaining = computed(() => {
  if (!props.deadlineAt) return Infinity
  return props.deadlineAt - Date.now()
})

const overdue = computed(() => remaining.value <= 0)

const warning = computed(() => {
  return !overdue.value && remaining.value < 300000 // 5 min warning
})

const display = computed(() => {
  if (!props.deadlineAt) return '--'
  const ms = Math.abs(remaining.value)
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const prefix = overdue.value ? '超时 ' : ''
  return `${prefix}${m}:${String(s).padStart(2, '0')}`
})
</script>

<style scoped>
.timer-display {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0fdf4;
  color: #166534;
}
.timer-display.warning {
  background: #fefce8;
  color: #854d0e;
}
.timer-display.overdue {
  background: #fef2f2;
  color: #991b1b;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>

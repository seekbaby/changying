<template>
  <span class="status-badge" :class="colorClass">
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const STATUS_MAP = {
  ARRIVED_WAITING:    { label: '到院等待', color: 'gray' },
  DETECTION_PHOTO:    { label: '检测拍照', color: 'blue' },
  IN_CLINIC_WAITING:  { label: '院内等待', color: 'gray' },
  CONSULTATION:       { label: '面诊',     color: 'blue' },
  PRE_TREATMENT_CARE: { label: '术前护理', color: 'purple' },
  NUMBING:            { label: '敷麻',     color: 'orange' },
  PRE_OP_WAITING:     { label: '术前等待', color: 'yellow' },
  IN_OPERATION:       { label: '术中',     color: 'red' },
  POST_TREATMENT_CARE:{ label: '术后护理', color: 'purple' },
  DINING:             { label: '用餐',     color: 'green' },
  DISCHARGED:         { label: '已离院',   color: 'gray' }
}

const props = defineProps({
  status: { type: String, required: true }
})

const label = computed(() => STATUS_MAP[props.status]?.label || props.status)
const colorClass = computed(() => `status-${STATUS_MAP[props.status]?.color || 'gray'}`)
</script>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.status-gray    { background: #f1f5f9; color: #475569; }
.status-blue    { background: #dbeafe; color: #1d4ed8; }
.status-purple  { background: #f3e8ff; color: #7e22ce; }
.status-orange  { background: #fff7ed; color: #c2410c; }
.status-yellow  { background: #fefce8; color: #854d0e; }
.status-red     { background: #fee2e2; color: #991b1b; }
.status-green   { background: #dcfce7; color: #166534; }
</style>

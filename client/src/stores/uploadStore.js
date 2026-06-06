import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 全局上传追踪器 (v4.0)
 * ─ 追踪所有进行中的录音上传，供 App.vue 浮动进度条使用
 */
export const useUploadStore = defineStore('upload', () => {
  const uploads = ref([])

  const hasActive = computed(() =>
    uploads.value.some(u => u.status === 'uploading' || u.status === 'processing')
  )

  const activeUpload = computed(() =>
    uploads.value.find(u => u.status === 'uploading') || null
  )

  function addUpload(id, fileName) {
    uploads.value.push({
      id,
      fileName,
      progress: 0,
      status: 'uploading'  // uploading | processing | done | error
    })
  }

  function updateProgress(id, progress) {
    const item = uploads.value.find(u => u.id === id)
    if (item) {
      item.progress = Math.min(100, Math.max(0, Math.round(progress)))
    }
  }

  function markProcessing(id) {
    const item = uploads.value.find(u => u.id === id)
    if (item) item.status = 'processing'
  }

  function markDone(id) {
    const item = uploads.value.find(u => u.id === id)
    if (item) {
      item.status = 'done'
      item.progress = 100
    }
  }

  function markError(id, error) {
    const item = uploads.value.find(u => u.id === id)
    if (item) {
      item.status = 'error'
      item.error = error
    }
  }

  function remove(id) {
    uploads.value = uploads.value.filter(u => u.id !== id)
  }

  return {
    uploads, hasActive, activeUpload,
    addUpload, updateProgress, markProcessing, markDone, markError, remove
  }
})

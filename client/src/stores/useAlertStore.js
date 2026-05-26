import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAlertStore = defineStore('alert', () => {
  const alerts = ref([])

  function addAlert(alert) {
    alerts.value.push({ ...alert, id: Date.now(), dismissed: false })
    // 5秒后自动消除
    setTimeout(() => dismiss(alert.id), 5000)
  }

  function dismiss(id) {
    const a = alerts.value.find(a => a.id === id)
    if (a) a.dismissed = true
  }

  function clearAll() {
    alerts.value = []
  }

  return { alerts, addAlert, dismiss, clearAll }
})

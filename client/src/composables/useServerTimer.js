import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * 基于服务器截止时间戳的计时器钩子
 * 手机锁屏/切应用回来后自动重算，永远准确
 *
 * 使用: const { minutes, seconds, isOverdue, overdueMinutes } = useServerTimer(deadlineAt)
 */
export function useServerTimer(deadlineAt) {
  const now = ref(Date.now())
  let timer = null

  const remaining = computed(() => {
    if (!deadlineAt.value) return Infinity
    return deadlineAt.value - now.value
  })

  const minutes = computed(() => {
    const ms = remaining.value
    if (ms <= 0) return 0
    return Math.floor(ms / 60000)
  })

  const seconds = computed(() => {
    const ms = remaining.value
    if (ms <= 0) return 0
    return Math.floor((ms % 60000) / 1000)
  })

  const isOverdue = computed(() => remaining.value <= 0)

  const overdueMinutes = computed(() => {
    if (!isOverdue.value) return 0
    return Math.floor(Math.abs(remaining.value) / 60000)
  })

  const display = computed(() => {
    if (!deadlineAt.value) return '--'
    if (isOverdue.value) return `超时 ${overdueMinutes.value}分`
    return `${minutes.value}:${String(seconds.value).padStart(2, '0')}`
  })

  function tick() {
    now.value = Date.now()
  }

  onMounted(() => {
    tick()
    timer = setInterval(tick, 1000)
    // 页面重新激活时立即重算
    document.addEventListener('visibilitychange', tick)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })

  return { minutes, seconds, isOverdue, overdueMinutes, display, remaining }
}

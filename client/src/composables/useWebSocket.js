import { ref, onMounted, onUnmounted } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'
import { useAlertStore } from '../stores/useAlertStore'
import { useAuthStore } from '../stores/useAuthStore'

export function useWebSocket() {
  const ws = ref(null)
  const connected = ref(false)
  const reconnectTimer = ref(null)
  const pingTimer = ref(null)
  const pendingRequests = ref(new Map())
  const reauthTimer = ref(null)  // ★ 重连后延迟发送 AUTH_LOGIN 的定时器

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${location.host}/ws`

    ws.value = new WebSocket(url)

    ws.value.onopen = () => {
      connected.value = true
      console.log('[WS] 已连接')
      if (reconnectTimer.value) {
        clearTimeout(reconnectTimer.value)
        reconnectTimer.value = null
      }
      startPing()
      // ★★ 连接成功后自动重新登录（续 token）
      tryReauth()
    }

    ws.value.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleMessage(msg)
      } catch (e) {
        console.error('[WS] 解析失败:', e)
      }
    }

    ws.value.onclose = () => {
      connected.value = false
      stopPing()
      if (reauthTimer.value) { clearTimeout(reauthTimer.value); reauthTimer.value = null }
      console.log('[WS] 断开，3秒后重连...')
      reconnectTimer.value = setTimeout(connect, 3000)
    }

    ws.value.onerror = (err) => {
      console.error('[WS] 错误:', err)
    }
  }

  // ★★ 重连后自动登录：用 localStorage 中存储的凭据重新获取 token
  function tryReauth() {
    const auth = useAuthStore()
    if (!auth.staffId || !auth.pin) {
      console.log('[WS] 无存储凭据，跳过自动登录')
      return
    }
    // 延迟 500ms，确保 WS 连接稳定后再发
    reauthTimer.value = setTimeout(async () => {
      try {
        const res = await send('AUTH_LOGIN', { staffId: auth.staffId, pin: auth.pin })
        if (res.success) {
          auth.login(res.payload.token, res.payload.staff, auth.staffId, auth.pin)
          console.log('[WS] 自动重新登录成功:', res.payload.staff?.name)
        } else {
          console.warn('[WS] 自动登录失败（可能密码已变更）:', res.error)
        }
      } catch (e) {
        console.warn('[WS] 自动登录异常:', e.message)
      }
    }, 500)
  }

  // ★ 客户端心跳：每25秒发一次，防服务端踢人
  function startPing() {
    stopPing()
    pingTimer.value = setInterval(() => {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        ws.value.send(JSON.stringify({ action: 'PING' }))
      }
    }, 25000)
  }

  function stopPing() {
    if (pingTimer.value) {
      clearInterval(pingTimer.value)
      pingTimer.value = null
    }
  }

  function handleMessage(msg) {
    const visitStore = useVisitStore()
    const alertStore = useAlertStore()

    switch (msg.action) {
      case 'GLOBAL_STATE_PUSH':
        visitStore.updateFull(msg.payload)
        break

      case 'ALERT_TIMEOUT':
        alertStore.addAlert({
          type: 'timeout',
          ...msg.payload
        })
        break

      default:
        // ACK/ERR 回调
        if (msg.requestId && pendingRequests.value.has(msg.requestId)) {
          const { resolve, reject } = pendingRequests.value.get(msg.requestId)
          pendingRequests.value.delete(msg.requestId)
          if (msg.success === false) {
            reject(new Error(msg.error || '操作失败'))
          } else {
            resolve(msg)
          }
        }
        break
    }
  }

  function send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket未连接'))
        return
      }
      const auth = useAuthStore()
      const requestId = Math.random().toString(36).slice(2, 10)

      pendingRequests.value.set(requestId, { resolve, reject })

      ws.value.send(JSON.stringify({
        action,
        requestId,
        payload,
        token: auth.token
      }))

      // 10秒超时（上传类操作可能较慢）
      setTimeout(() => {
        if (pendingRequests.value.has(requestId)) {
          pendingRequests.value.delete(requestId)
          reject(new Error('请求超时'))
        }
      }, 10000)
    })
  }

  onMounted(() => {
    connect()
    // ★ 页面从后台恢复时重连
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    if (reconnectTimer.value) clearTimeout(reconnectTimer.value)
    if (ws.value) ws.value.close()
    stopPing()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
        console.log('[WS] 页面恢复，重连...')
        connect()
      }
    }
  }

  return { ws, connected, send }
}

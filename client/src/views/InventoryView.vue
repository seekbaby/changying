<template>
  <div class="inv-view">
    <header class="iv-topbar">
      <button class="iv-back" @click="$router.push('/unified')">← 返回</button>
      <h1 class="iv-title">📦 实时库存</h1>
      <span class="iv-refresh" @click="loadData" title="刷新">🔄</span>
    </header>

    <main class="iv-body">
      <div v-if="loading && items.length === 0" class="iv-empty">加载中...</div>
      <div v-else-if="items.length === 0" class="iv-empty">暂无耗材记录</div>

      <div v-else class="iv-grid">
        <div
          v-for="item in items"
          :key="item.id"
          class="iv-card"
          :class="{ 'iv-low': item.available <= item.safety_stock, 'iv-zero': item.available <= 0 }"
        >
          <div class="ivc-name">{{ item.name }}</div>
          <div class="ivc-unit">{{ item.unit }}</div>
          <div class="ivc-stats">
            <div class="ivc-stat">
              <span class="ivcs-label">实物库存</span>
              <span class="ivcs-value">{{ item.current_stock }}</span>
            </div>
            <div class="ivc-stat">
              <span class="ivcs-label">已锁</span>
              <span class="ivcs-value ivcs-locked">{{ item.locked || 0 }}</span>
            </div>
            <div class="ivc-stat ivc-main">
              <span class="ivcs-label">可用</span>
              <span class="ivcs-value" :class="{ 'ivcs-danger': item.available <= item.safety_stock }">
                {{ item.available }}
              </span>
            </div>
          </div>
          <div class="ivc-safety">
            安全库存: {{ item.safety_stock }}
            <span v-if="item.available <= item.safety_stock && item.available > 0" class="ivc-warn">⚠️ 低库存</span>
            <span v-if="item.available <= 0" class="ivc-danger">🚫 已耗尽</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'

const { send, connected } = useWebSocket()
const items = ref([])
const loading = ref(true)
let refreshTimer = null

async function loadData() {
  try {
    const res = await send('INVENTORY_LIST', {})
    if (res.success) items.value = res.payload.items || []
  } catch (e) { /* ignore */ }
  finally { loading.value = false }
}

onMounted(() => {
  // 等 WS 连接认证完成
  const check = setInterval(() => {
    if (connected.value) { clearInterval(check); loadData() }
  }, 200)
  refreshTimer = setInterval(loadData, 30000)
})

onUnmounted(() => { clearInterval(refreshTimer) })
</script>

<style scoped>
.inv-view { min-height: 100vh; background: #f0f2f5; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }

.iv-topbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.iv-back { background: none; border: 1px solid #e5e7eb; padding: 6px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; color: #475569; }
.iv-title { margin: 0; font-size: 18px; font-weight: 700; color: #1e293b; flex: 1; }
.iv-refresh { font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 6px; user-select: none; }
.iv-refresh:active { background: #e5e7eb; }

.iv-body { flex: 1; overflow-y: auto; padding: 12px; }
.iv-empty { text-align: center; color: #94a3b8; padding: 40px 0; font-size: 14px; }

.iv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }

.iv-card { background: #fff; border-radius: 10px; padding: 12px; border: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 8px; }
.iv-card.iv-low { border-left: 3px solid #f59e0b; }
.iv-card.iv-zero { border-left: 3px solid #dc2626; background: #fef2f2; }

.ivc-name { font-weight: 700; font-size: 15px; color: #1e293b; }
.ivc-unit { font-size: 12px; color: #94a3b8; }

.ivc-stats { display: flex; gap: 8px; }
.ivc-stat { flex: 1; text-align: center; }
.ivc-main { flex: 1.4; }
.ivcs-label { display: block; font-size: 11px; color: #94a3b8; }
.ivcs-value { font-size: 20px; font-weight: 700; color: #334155; }
.ivcs-locked { color: #f59e0b; }
.ivcs-danger { color: #dc2626 !important; }

.ivc-safety { font-size: 11px; color: #94a3b8; }
.ivc-warn { color: #f59e0b; font-weight: 600; }
.ivc-danger { color: #dc2626; font-weight: 600; }

@media (max-width: 480px) {
  .iv-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .iv-card { padding: 10px; }
  .ivcs-value { font-size: 18px; }
}
</style>

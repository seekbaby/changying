<template>
  <div class="dashboard">
    <header class="dash-topbar">
      <button class="dash-back" @click="$router.push('/unified')">← 返回</button>
      <h1>📊 运营 Dashboard</h1>
      <span class="dash-range">{{ weekLabel }}</span>
    </header>

    <main class="dash-body" v-if="stats">
      <!-- ══════ 1. 时间黑洞 ══════ -->
      <section class="dash-section">
        <h2 class="ds-title">⚠️ 等待时长监控</h2>
        <div class="timehole-grid">
          <div v-for="(hole, key) in stats.timeHoles" :key="key" 
               class="th-card" :class="'th-' + holeColor(hole)">
            <div class="th-header">
              <span class="th-icon">{{ hole.icon }}</span>
              <span class="th-label">{{ hole.label }}</span>
              <span class="th-threshold">&gt;{{ hole.limitMin }}min</span>
            </div>
            <div class="th-count" :class="{ 'th-alert': hole.count > 0 }">
              {{ hole.count }}<small>人</small>
            </div>
            <div v-if="hole.patients.length" class="th-patients">
              <div v-for="p in hole.patients" :key="p.id" class="th-patient">
                <span class="thp-name">{{ p.guest_name }}</span>
                <span class="thp-elapsed">{{ p.elapsed_min }}min</span>
              </div>
            </div>
            <div v-else class="th-ok">✅ 正常</div>
          </div>
        </div>
      </section>

      <!-- ══════ 2. 护士接诊 ══════ -->
      <section class="dash-section">
        <h2 class="ds-title">👤 护士接诊量</h2>
        <div class="stat-split">
          <div class="stat-col">
            <h3 class="sc-label">今日</h3>
            <table class="stat-table" v-if="stats.nurseStats.today.length">
              <tr v-for="n in stats.nurseStats.today" :key="n.id">
                <td class="st-name">{{ n.name }}</td>
                <td class="st-count">{{ n.visit_count }}人</td>
              </tr>
            </table>
            <p v-else class="st-empty">今日暂无接诊</p>
          </div>
          <div class="stat-col">
            <h3 class="sc-label">本周</h3>
            <table class="stat-table" v-if="stats.nurseStats.week.length">
              <tr v-for="n in stats.nurseStats.week" :key="n.id">
                <td class="st-name">{{ n.name }}</td>
                <td class="st-count">{{ n.visit_count }}人</td>
              </tr>
            </table>
            <p v-else class="st-empty">本周暂无接诊</p>
          </div>
        </div>
      </section>

      <!-- ══════ 3. 医生治疗 ══════ -->
      <section class="dash-section">
        <h2 class="ds-title">👨‍⚕️ 医生治疗量</h2>
        <div class="stat-split">
          <div class="stat-col">
            <h3 class="sc-label">今日</h3>
            <table class="stat-table" v-if="stats.doctorStats.today.length">
              <tr v-for="d in stats.doctorStats.today" :key="d.id">
                <td class="st-name">{{ d.name }}</td>
                <td class="st-count">{{ d.patient_count }}人</td>
                <td class="st-duration">{{ fmtDuration(d.total_duration_ms) }}</td>
              </tr>
            </table>
            <p v-else class="st-empty">今日暂无治疗</p>
          </div>
          <div class="stat-col">
            <h3 class="sc-label">本周</h3>
            <table class="stat-table" v-if="stats.doctorStats.week.length">
              <tr v-for="d in stats.doctorStats.week" :key="d.id">
                <td class="st-name">{{ d.name }}</td>
                <td class="st-count">{{ d.patient_count }}人</td>
                <td class="st-duration">{{ fmtDuration(d.total_duration_ms) }}</td>
              </tr>
            </table>
            <p v-else class="st-empty">本周暂无治疗</p>
          </div>
        </div>
      </section>
    </main>

    <div v-else class="dash-loading">⏳ 加载中...</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore.js'
import { useWebSocket } from '../composables/useWebSocket.js'

const router = useRouter()
const auth = useAuthStore()
const { send, connected } = useWebSocket()

// 权限检查
if (!['admin','manager'].includes(auth.role)) {
  router.replace('/unified')
}

const stats = ref(null)
let refreshTimer = null

const weekLabel = computed(() => {
  if (!stats.value) return ''
  const w = stats.value.weekRange
  return `${w.start} ~ ${w.end}`
})

function holeColor(hole) {
  if (hole.count >= 3) return 'red'
  if (hole.count >= 1) return 'yellow'
  return 'green'
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '--'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

async function fetchStats() {
  try {
    const result = await send('DASHBOARD_STATS', {})
    if (result.success) {
      stats.value = result.payload.stats
    }
  } catch(e) {
    console.warn('[Dashboard] fetch failed:', e.message)
  }
}

onMounted(() => {
  // 等待 WS 连接并完成认证后再获取数据
  watch(connected, (val) => {
    if (val) {
      setTimeout(fetchStats, 500)  // 等 tryReauth 完成
    }
  }, { immediate: true })
  refreshTimer = setInterval(fetchStats, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.dashboard {
  min-height: 100vh; background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.dash-topbar {
  display: flex; align-items: center; padding: 12px 16px;
  background: #fff; border-bottom: 2px solid #e5e7eb;
  position: sticky; top: 0; z-index: 10;
}
.dash-back {
  background: none; border: 1px solid #d1d5db; border-radius: 8px;
  padding: 6px 12px; font-size: 14px; cursor: pointer; color: #475569;
}
.dash-topbar h1 { flex: 1; text-align: center; font-size: 18px; margin: 0; }
.dash-range { font-size: 12px; color: #94a3b8; }

.dash-body { padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.dash-loading { text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 16px; }

.dash-section { background: #fff; border-radius: 12px; padding: 14px; }
.ds-title { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 12px 0; }

/* ── 时间黑洞 ── */
.timehole-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.th-card {
  flex: 1; min-width: 100px; border-radius: 10px; padding: 12px;
  text-align: center; transition: all .2s;
}
.th-red { background: #fef2f2; border: 2px solid #fca5a5; }
.th-yellow { background: #fffbeb; border: 2px solid #fde68a; }
.th-green { background: #f0fdf4; border: 2px solid #bbf7d0; }
.th-header { display: flex; justify-content: center; align-items: center; gap: 4px; margin-bottom: 8px; }
.th-icon { font-size: 20px; }
.th-label { font-size: 13px; font-weight: 600; color: #475569; }
.th-threshold { font-size: 10px; color: #94a3b8; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
.th-count { font-size: 36px; font-weight: 800; color: #16a34a; line-height: 1.1; }
.th-count small { font-size: 14px; font-weight: 400; color: #64748b; margin-left: 2px; }
.th-alert { color: #dc2626; }
.th-ok { font-size: 13px; color: #16a34a; padding: 8px; }
.th-patients { margin-top: 8px; text-align: left; }
.th-patient { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
.thp-name { font-weight: 500; color: #334155; }
.thp-elapsed { color: #dc2626; font-family: monospace; font-weight: 600; }

/* ── 统计表 ── */
.stat-split { display: flex; gap: 12px; }
.stat-col { flex: 1; }
.sc-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; margin: 0 0 8px 0; }
.stat-table { width: 100%; border-collapse: collapse; }
.stat-table td { padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
.st-name { font-weight: 500; color: #334155; }
.st-count { text-align: right; color: #2563eb; font-weight: 600; white-space: nowrap; }
.st-duration { text-align: right; color: #64748b; font-size: 12px; white-space: nowrap; }
.st-empty { font-size: 13px; color: #94a3b8; text-align: center; padding: 12px; }

/* Mobile */
@media(max-width:480px) {
  .dash-topbar { padding: 10px 12px; }
  .dash-topbar h1 { font-size: 16px; }
  .dash-body { padding: 8px; gap: 12px; }
  .timehole-grid { flex-direction: column; gap: 8px; }
  .stat-split { flex-direction: column; gap: 12px; }
}
</style>

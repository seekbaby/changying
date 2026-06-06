<template>
  <div class="rpl-app">
    <!-- ═══ 顶栏 ═══ -->
    <header class="rpl-topbar">
      <button class="rpl-back" @click="$router.push('/unified')">← 返回</button>
      <h1 class="rpl-title">📝 面诊分析报告</h1>
    </header>

    <!-- ═══ 状态筛选 ═══ -->
    <div class="rpl-toolbar">
      <select v-model="statusFilter" class="rpl-filter">
        <option value="all">全部报告</option>
        <option value="completed">✅ 已完成</option>
        <option value="failed">🔴 失败</option>
        <option value="processing">🔵 处理中</option>
      </select>
    </div>

    <!-- ═══ 报告列表 ═══ -->
    <main class="rpl-list">
      <div v-if="filteredReports.length === 0" class="rpl-empty">
        {{ loading ? '加载中...' : '暂无报告' }}
      </div>

      <div v-for="r in filteredReports" :key="r.id" class="rpl-card"
        :class="{ 'rpl-expanded': expandedId === r.id }"
      >
        <div class="rpl-header" @click="toggleCard(r)">
          <span class="rpl-status-dot" :class="'rpl-status-' + r.status"></span>
          <div class="rpl-meta">
            <span class="rpl-guest">{{ r.guest_name }}</span>
            <span class="rpl-assistant" v-if="r.assistant_name">· 👤 {{ r.assistant_name }}</span>
            <span class="rpl-date">· {{ fmtDate(r.visit_date || r.created_at) }}</span>
          </div>
          <span class="rpl-expand">{{ expandedId === r.id ? '▾' : '▸' }}</span>
        </div>

        <div v-if="expandedId === r.id" class="rpl-detail" @click.stop>
          <!-- ★ v6.0: 数据看板 -->
          <div v-if="r.report_markdown && r.status === 'completed'" class="rpl-dashboard">
            <template v-if="parseReportJson(r.report_markdown)">
              <div class="rpl-db-card db-opp">
                <span class="rpl-db-num">{{ parseReportJson(r.report_markdown).data_points?.client_opportunities_count || 0 }}</span>
                <span class="rpl-db-label">💬 机会</span>
              </div>
              <div class="rpl-db-card db-caught">
                <span class="rpl-db-num">{{ parseReportJson(r.report_markdown).data_points?.consultant_caught_count || 0 }}</span>
                <span class="rpl-db-label">✅ 抓取</span>
              </div>
            </template>
          </div>

          <!-- ★ v6.0: JSON 结构化报告 — 4 分析卡片 -->
          <div v-if="r.report_markdown && r.status === 'completed'" class="rpl-report-v6">
            <template v-if="parseReportJson(r.report_markdown)">
              <div class="rpl-v6-wrap" v-for="(q, qKey) in parseReportJson(r.report_markdown).analysis_questions" :key="qKey">
                <div class="rpl-v6-q-title">{{ questionLabel(qKey) }}</div>
                <div class="rpl-v6-q-summary">{{ q.summary }}</div>
                <div class="rpl-v6-evidence" v-if="q.evidence && q.evidence.length">
                  <div class="rpl-v6-ev-item" v-for="(ev, ei) in q.evidence" :key="ei">
                    💬 「{{ ev.quote }}」
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="rpl-error">⚠️ 报告格式异常</div>
          </div>

          <!-- 转录 -->
          <div v-if="r.transcript" class="rpl-transcript">
            <h4 @click="showTranscript[r.id] = !showTranscript[r.id]">
              📝 原始转录 {{ showTranscript[r.id] ? '▾' : '▸' }}
            </h4>
            <pre v-if="showTranscript[r.id]">{{ r.transcript }}</pre>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useWebSocket } from '../composables/useWebSocket.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const { send, connected } = useWebSocket()

const reports = ref([])
const loading = ref(true)
const expandedId = ref(null)
const statusFilter = ref('all')
const showTranscript = reactive({})
let refreshTimer = null

const filteredReports = computed(() => {
  let list = reports.value
  if (statusFilter.value === 'completed') {
    list = list.filter(r => r.status === 'completed')
  } else if (statusFilter.value === 'failed') {
    list = list.filter(r => r.status === 'failed')
  } else if (statusFilter.value === 'processing') {
    list = list.filter(r => ['uploaded','transcribing','analyzing'].includes(r.status))
  }
  return list
})

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'string' ? ts : ts)
  const m = d.getMonth() + 1, day = d.getDate()
  return `${m}/${day}`
}

function toggleCard(r) {
  expandedId.value = expandedId.value === r.id ? null : r.id
}

// ★ v6.0: JSON 报告解析
const QUESTION_LABELS = {
  q1_real_demand: '❶ 客户真正需求',
  q2_proposed_solutions: '❷ 本次提出的方案',
  q3_missed_opportunities: '❸ 遗漏的商业机会',
  q4_business_loss: '❹ 经营视角的损失',
}
function questionLabel(key) { return QUESTION_LABELS[key] || key }

function parseReportJson(md) {
  if (!md) return null
  try { return JSON.parse(md) } catch (_) { return null }
}

async function loadReports() {
  try {
    const result = await send('RECORDING_REPORT_LIST', {})
    if (result.success) {
      reports.value = result.payload.reports || []
    }
  } catch (e) {
    console.warn('[ReportList] load failed:', e.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 等 WS 连接 + reauth 完成再做首次查询
  const check = setInterval(() => {
    if (connected.value) {
      clearInterval(check)
      setTimeout(loadReports, 500)
    }
  }, 200)
  refreshTimer = setInterval(loadReports, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.rpl-app {
  min-height: 100vh; background: #f8fafc;
}
.rpl-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; background: #fff; border-bottom: 1px solid #e2e8f0;
  position: sticky; top: 0; z-index: 10;
}
.rpl-back {
  background: none; border: none; font-size: 16px; cursor: pointer;
  color: #64748b; padding: 0;
}
.rpl-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }

.rpl-toolbar { padding: 12px 16px; }
.rpl-filter {
  padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; background: #fff; color: #475569;
}

.rpl-list { padding: 0 16px 24px; }
.rpl-empty { text-align: center; padding: 60px 0; color: #94a3b8; }

.rpl-card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
  margin-bottom: 8px; overflow: hidden;
}
.rpl-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px; cursor: pointer;
}
.rpl-header:hover { background: #f8fafc; }
.rpl-status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.rpl-status-completed { background: #22c55e; }
.rpl-status-failed { background: #ef4444; }
.rpl-status-uploaded,
.rpl-status-transcribing,
.rpl-status-analyzing { background: #3b82f6; animation: rpl-pulse 1.5s infinite; }
@keyframes rpl-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.rpl-meta { flex: 1; display: flex; align-items: center; gap: 6px; font-size: 14px; }
.rpl-guest { font-weight: 600; color: #1e293b; }
.rpl-assistant { font-size: 12px; color: #6366f1; }
.rpl-date { color: #94a3b8; }
.rpl-expand { color: #94a3b8; }

.rpl-detail { padding: 0 14px 14px; border-top: 1px solid #f1f5f9; }

/* ═══ v6.0: JSON 报告 + 数据看板 ═══ */
.rpl-dashboard {
  display: flex; gap: 8px; margin: 10px 0;
}
.rpl-db-card {
  flex: 1; text-align: center; padding: 10px 6px; border-radius: 10px; color: #fff;
}
.rpl-db-card.db-opp { background: linear-gradient(135deg, #6366f1, #818cf8); }
.rpl-db-card.db-caught { background: linear-gradient(135deg, #22c55e, #4ade80); }
.rpl-db-num { font-size: 24px; font-weight: 800; display: block; }
.rpl-db-label { font-size: 11px; opacity: 0.85; }

.rpl-report-v6 { margin-top: 10px; }
.rpl-v6-wrap {
  background: #f8fafc; border-left: 4px solid #6366f1;
  border-radius: 8px; padding: 10px; margin-bottom: 8px;
}
.rpl-v6-q-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
.rpl-v6-q-summary { font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 6px; padding-left: 6px; border-left: 2px solid #e2e8f0; }
.rpl-v6-evidence { display: flex; flex-direction: column; gap: 4px; }
.rpl-v6-ev-item { font-size: 12px; color: #6366f1; padding: 4px 6px; background: #eff6ff; border-radius: 4px; }

.rpl-transcript { margin-top: 10px; }
.rpl-transcript h4 {
  font-size: 13px; color: #64748b; cursor: pointer; user-select: none;
}
.rpl-transcript pre {
  margin-top: 8px; padding: 10px; background: #f1f5f9; border-radius: 8px;
  font-size: 12px; line-height: 1.6; color: #475569;
  white-space: pre-wrap; max-height: 200px; overflow-y: auto;
}
</style>

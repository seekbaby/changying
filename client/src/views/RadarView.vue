<template>
  <div class="radar-screen" :class="{ 'connection-lost': !connected }">
    <!-- 顶部报警横幅 -->
    <TransitionGroup name="alert-slide" tag="div" class="alert-banner-area">
      <div
        v-for="alert in activeAlerts"
        :key="alert.id"
        class="alert-banner"
        :class="`alert-${alert.type || 'warning'}`"
      >
        <span class="alert-icon">⚠</span>
        <span class="alert-text">{{ alert.message || alert.guest_name + ' 超时未完成' }}</span>
        <button class="alert-dismiss" @click="alertStore.dismiss(alert.id)">✕</button>
      </div>
    </TransitionGroup>

    <!-- 连接状态指示 -->
    <div v-if="!connected" class="connection-banner">
      <span class="pulse-dot"></span> 连接断开，正在重连...
    </div>

    <!-- 标题栏 -->
    <header class="radar-header">
      <h1 class="radar-title">
        <span class="title-icon">📡</span>
        陈杨 雷达大屏
      </h1>
      <div class="radar-meta">
        <span class="meta-badge active">进行中 {{ enrichedVisits.length }}</span>
        <span class="meta-badge vip" v-if="vipCount > 0">VIP {{ vipCount }}</span>
        <span class="meta-badge overdue" v-if="overdueCount > 0">超时 {{ overdueCount }}</span>
        <span class="meta-clock">{{ currentTime }}</span>
      </div>
    </header>

    <!-- 雷达网格 -->
    <section class="radar-grid" v-if="enrichedVisits.length > 0">
      <div
        v-for="visit in enrichedVisits"
        :key="visit.id"
        class="radar-card"
        :class="{
          'card-vip': visit.is_vip,
          'card-overdue': visit.timer.isOverdue,
          'card-normal': !visit.timer.isOverdue && !visit.is_vip,
          'card-selected': selectedVisit && selectedVisit.id === visit.id
        }"
        @click="selectVisit(visit)"
      >
        <!-- VIP 标记 -->
        <div v-if="visit.is_vip" class="vip-ribbon">★ VIP</div>

        <!-- 备注按钮 -->
        <button class="note-badge" @click.stop="selectVisit(visit)" title="添加备注">
          📝 备注
        </button>

        <!-- 客户名 -->
        <div class="card-guest-name">{{ visit.guest_name || visit.name || '--' }}</div>

        <!-- 状态标签 -->
        <div class="card-status" :class="statusClass(visit.status)">
          {{ statusLabel(visit.status) }}
        </div>

        <!-- 倒计时 -->
        <div class="card-timer" :class="{ 'timer-overdue': visit.timer.isOverdue }">
          <span class="timer-label">{{ visit.timer.isOverdue ? '已超时' : '剩余' }}</span>
          <span class="timer-value">{{ visit.timer.display }}</span>
        </div>

        <!-- 所在房间 -->
        <div class="card-room">
          <span class="room-icon">🚪</span>
          <span class="room-name">{{ visitRoomName(visit) }}</span>
        </div>

        <!-- 进度条（可选视觉元素） -->
        <div class="card-progress-bar" v-if="visit.deadline_at && visit.created_at">
          <div
            class="progress-fill"
            :class="{ 'progress-overdue': visit.timer.isOverdue }"
            :style="{ width: visit.timer.progressPercent + '%' }"
          ></div>
        </div>
      </div>
    </section>

    <!-- 备注输入面板 -->
    <Transition name="note-slide">
      <section v-if="selectedVisit" class="note-panel">
        <div class="note-panel-header">
          <span class="note-panel-title">
            📝 备注 — <strong>{{ selectedVisit.guest_name || selectedVisit.name || '--' }}</strong>
          </span>
          <button class="note-panel-close" @click="selectedVisit = null">✕</button>
        </div>
        <div class="note-panel-body">
          <textarea
            v-model="noteText"
            class="note-textarea"
            placeholder="输入备注内容..."
            rows="3"
            :disabled="noteSending"
            @keydown.enter.ctrl="submitNote"
          ></textarea>
          <div class="note-panel-actions">
            <span v-if="noteSuccess" class="note-success">✅ 备注已保存</span>
            <button
              class="note-send-btn"
              :disabled="!noteText.trim() || noteSending"
              @click="submitNote"
            >
              {{ noteSending ? '发送中...' : '发送备注' }}
            </button>
          </div>
        </div>
      </section>
    </Transition>

    <!-- 空状态 -->
    <section class="radar-empty" v-if="enrichedVisits.length === 0">
      <div class="empty-icon">🛰️</div>
      <p>当前无进行中接诊单</p>
      <p class="empty-sub">雷达静默待命中...</p>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'
import { useAlertStore } from '../stores/useAlertStore'
import { useWebSocket } from '../composables/useWebSocket'

// ──────────────────────────────────────
// Stores & WebSocket (只接收，不发送)
// ──────────────────────────────────────
const visitStore = useVisitStore()
const alertStore = useAlertStore()
const { connected, send } = useWebSocket()   // GLOBAL_STATE_PUSH 自动更新 visitStore

// ──────────────────────────────────────
// 备注功能：选中的接诊 + 备注输入
// ──────────────────────────────────────
const selectedVisit = ref(null)
const noteText = ref('')
const noteSending = ref(false)
const noteSuccess = ref(false)

function selectVisit(visit) {
  selectedVisit.value = visit
  noteText.value = ''
  noteSuccess.value = false
}

async function submitNote() {
  const visit = selectedVisit.value
  const content = noteText.value.trim()
  if (!visit || !content) return

  noteSending.value = true
  noteSuccess.value = false
  try {
    await send('NOTE_ADD_GENERAL', {
      visitId: visit.id,
      content
    })
    noteText.value = ''
    noteSuccess.value = true
    setTimeout(() => { noteSuccess.value = false }, 2500)
  } catch (e) {
    console.error('[Radar] 备注发送失败:', e)
  } finally {
    noteSending.value = false
  }
}

// ──────────────────────────────────────
// 服务器时钟（等同于 useServerTimer 逻辑）
// 单一共享 now ref，避免每个卡片独立计时器
// ──────────────────────────────────────
const now = ref(Date.now())
let tickTimer = null

function tick() { now.value = Date.now() }

onMounted(() => {
  tickTimer = setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', tick)
})

// ──────────────────────────────────────
// 当前时间 (HH:MM:SS)
// ──────────────────────────────────────
const currentTime = computed(() => {
  const d = new Date(now.value)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
})

// ──────────────────────────────────────
// 活动报警（未关闭的）
// ──────────────────────────────────────
const activeAlerts = computed(() =>
  alertStore.alerts.filter(a => !a.dismissed)
)

// ──────────────────────────────────────
// 丰富后的接诊数据（含计时器计算）
// ──────────────────────────────────────
const enrichedVisits = computed(() => {
  return visitStore.activeVisits.map(visit => {
    const deadline = visit.deadline_at
    const remaining = deadline ? deadline - now.value : Infinity
    const isOverdue = remaining <= 0
    const minutes = remaining > 0 ? Math.floor(remaining / 60000) : 0
    const seconds = remaining > 0 ? Math.floor((remaining % 60000) / 1000) : 0
    const overdueMinutes = isOverdue ? Math.floor(Math.abs(remaining) / 60000) : 0

    let display = '--'
    if (deadline) {
      display = isOverdue
        ? `超时 ${overdueMinutes}分`
        : `${minutes}:${String(seconds).padStart(2, '0')}`
    }

    // 进度百分比（从创建到截止时间）
    let progressPercent = 0
    if (visit.created_at && deadline) {
      const total = deadline - visit.created_at
      if (total > 0) {
        const elapsed = now.value - visit.created_at
        progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
      }
    }

    return {
      ...visit,
      timer: {
        isOverdue,
        display,
        remaining,
        minutes,
        seconds,
        overdueMinutes,
        progressPercent
      }
    }
  })
})

// ──────────────────────────────────────
// 计数
// ──────────────────────────────────────
const vipCount = computed(() =>
  enrichedVisits.value.filter(v => v.is_vip).length
)

const overdueCount = computed(() =>
  enrichedVisits.value.filter(v => v.timer.isOverdue).length
)

// ──────────────────────────────────────
// 房间名查找
// ──────────────────────────────────────
const roomMap = computed(() => {
  const map = {}
  for (const room of visitStore.rooms) {
    map[room.id] = room.name
  }
  return map
})

function visitRoomName(visit) {
  if (visit.room_name) return visit.room_name
  if (visit.current_room_id) {
    return roomMap.value[visit.current_room_id] || `房间 #${visit.current_room_id}`
  }
  return '未分配'
}

// ──────────────────────────────────────
// 状态映射
// ──────────────────────────────────────
const STATUS_MAP = {
  waiting:    { label: '排队中', class: 'status-waiting' },
  queued:     { label: '排队中', class: 'status-waiting' },
  visiting:   { label: '就诊中', class: 'status-visiting' },
  in_progress:{ label: '就诊中', class: 'status-visiting' },
  consulting: { label: '问诊中', class: 'status-consulting' },
  done:       { label: '已完成', class: 'status-done' },
  completed:  { label: '已完成', class: 'status-done' },
  cancelled:  { label: '已取消', class: 'status-cancelled' },
  paused:     { label: '已暂停', class: 'status-paused' },
  transferred:{ label: '已转诊', class: 'status-transferred' }
}

function statusLabel(status) {
  const s = (status || '').toLowerCase()
  return STATUS_MAP[s]?.label || status || '未知'
}

function statusClass(status) {
  const s = (status || '').toLowerCase()
  return STATUS_MAP[s]?.class || 'status-default'
}
</script>

<style scoped>
/* ═══════════════════════════════════════
   雷达大屏 — 深色主题，高对比度
   ═══════════════════════════════════════ */

.radar-screen {
  min-height: 100vh;
  background: #0a0e17;
  color: #e2e8f0;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', 'PingFang SC', monospace;
  padding: 20px 24px;
  position: relative;
  overflow-x: hidden;
}

/* ── 连接断开 ── */
.connection-lost {
  box-shadow: inset 0 0 120px rgba(220, 38, 38, 0.08);
}

.connection-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.35);
  color: #fca5a5;
  padding: 10px 18px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
}

/* ── 报警横幅 ── */
.alert-banner-area {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  animation: alert-pulse 2s ease-in-out infinite;
}

.alert-banner.alert-timeout,
.alert-banner.alert-warning {
  background: linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(180, 30, 30, 0.18));
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

.alert-banner.alert-info {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(30, 80, 200, 0.15));
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

.alert-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.alert-text {
  flex: 1;
}

.alert-dismiss {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 8px;
  border-radius: 4px;
  opacity: 0.7;
  transition: all 0.2s;
}

.alert-dismiss:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

@keyframes alert-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.15); }
  50% { box-shadow: 0 0 24px rgba(239, 68, 68, 0.35); }
}

/* alert-slide 过渡 */
.alert-slide-enter-active {
  transition: all 0.4s ease-out;
}
.alert-slide-leave-active {
  transition: all 0.3s ease-in;
}
.alert-slide-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.alert-slide-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* ── 标题栏 ── */
.radar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.radar-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.title-icon {
  font-size: 32px;
}

.radar-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.meta-badge {
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.meta-badge.active {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.meta-badge.vip {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.meta-badge.overdue {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.meta-clock {
  font-size: 15px;
  font-weight: 700;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
}

/* ── 雷达网格 ── */
.radar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

/* ── 卡片 ── */
.radar-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 14px;
  padding: 22px 20px 18px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.3s ease;
  overflow: hidden;
}

.radar-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

/* 普通卡片 */
.card-normal {
  border-left: 4px solid #334155;
}

/* VIP 卡片 — 金色边框 */
.card-vip {
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-left: 4px solid #f59e0b;
  background: linear-gradient(135deg, #1a1a0a 0%, #111827 100%);
}

.card-vip:hover {
  box-shadow: 0 0 28px rgba(245, 158, 11, 0.2);
}

/* 超时卡片 — 红色边框 + 脉冲 */
.card-overdue {
  border: 1px solid rgba(239, 68, 68, 0.6);
  border-left: 4px solid #ef4444;
  background: linear-gradient(135deg, #1a0a0a 0%, #111827 100%);
  animation: overdue-pulse 1.5s ease-in-out infinite;
}

.card-overdue:hover {
  box-shadow: 0 0 28px rgba(239, 68, 68, 0.25);
}

@keyframes overdue-pulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);
  }
  50% {
    box-shadow: 0 0 22px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.15);
  }
}

/* VIP 同时超时 — 红色优先（超时 > VIP 标记）但保留金丝 */
.card-vip.card-overdue {
  border: 1px solid rgba(239, 68, 68, 0.6);
  border-left: 4px solid #ef4444;
  background: linear-gradient(135deg, #1a0a0a 0%, #1a1a0a 50%, #111827 100%);
}

/* ── VIP 缎带 ── */
.vip-ribbon {
  position: absolute;
  top: 10px;
  right: -6px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #0f172a;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 14px 3px 10px;
  border-radius: 4px 0 0 4px;
  letter-spacing: 0.05em;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

/* ── 客户名（大号） ── */
.card-guest-name {
  font-size: 22px;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1.2;
  letter-spacing: 0.03em;
  word-break: break-all;
}

/* ── 状态标签 ── */
.card-status {
  display: inline-block;
  align-self: flex-start;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-waiting {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.35);
}

.status-visiting {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.35);
}

.status-consulting {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.35);
}

.status-done,
.status-completed {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.status-cancelled {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.status-paused {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-transferred {
  background: rgba(6, 182, 212, 0.2);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.status-default {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

/* ── 倒计时 ── */
.card-timer {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.timer-label {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.timer-value {
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #e2e8f0;
  letter-spacing: 0.02em;
}

.timer-overdue .timer-value {
  color: #fca5a5;
  animation: timer-blink 1s step-end infinite;
}

@keyframes timer-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── 房间 ── */
.card-room {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #94a3b8;
}

.room-icon {
  font-size: 14px;
}

.room-name {
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* ── 进度条 ── */
.card-progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  margin-top: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 2px;
  transition: width 1s linear;
}

.progress-fill.progress-overdue {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

/* ── 空状态 ── */
.radar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  color: #475569;
  gap: 8px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.radar-empty p {
  font-size: 18px;
  margin: 0;
  font-weight: 500;
}

.empty-sub {
  font-size: 14px !important;
  color: #334155;
}

/* ═══════════════════════════════════════
   备注功能样式
   ═══════════════════════════════════════ */

/* ── 卡片选中状态 ── */
.radar-card.card-selected {
  border-color: #60a5fa !important;
  border-left: 4px solid #3b82f6 !important;
  box-shadow: 0 0 24px rgba(59, 130, 246, 0.35), 0 0 60px rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

/* ── 备注徽章按钮 ── */
.note-badge {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  z-index: 2;
}

.note-badge:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(96, 165, 250, 0.6);
  color: #bfdbfe;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
}

/* ── 备注面板 ── */
.note-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 200;
  background: #0f172a;
  border-top: 2px solid rgba(59, 130, 246, 0.4);
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.6);
  padding: 0;
  max-width: 100vw;
}

.note-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.note-panel-title {
  font-size: 15px;
  color: #e2e8f0;
  letter-spacing: 0.03em;
}

.note-panel-title strong {
  color: #f8fafc;
}

.note-panel-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: all 0.2s;
}

.note-panel-close:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
}

.note-panel-body {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-textarea {
  width: 100%;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 14px;
  font-family: inherit;
  padding: 12px 14px;
  resize: vertical;
  min-height: 64px;
  max-height: 160px;
  transition: border-color 0.2s;
  line-height: 1.5;
}

.note-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.note-textarea::placeholder {
  color: #475569;
}

.note-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.note-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

.note-success {
  font-size: 13px;
  color: #4ade80;
  font-weight: 600;
  animation: note-success-fade 0.3s ease-out;
}

@keyframes note-success-fade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.note-send-btn {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 22px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.03em;
  font-family: inherit;
}

.note-send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
}

.note-send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── 备注面板过渡 ── */
.note-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.note-slide-leave-active {
  transition: all 0.25s ease-in;
}
.note-slide-enter-from {
  opacity: 0;
  transform: translateY(100%);
}
.note-slide-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>

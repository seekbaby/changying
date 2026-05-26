<template>
  <div class="manager-view">
    <!-- ========== TOP STATS PANEL ========== -->
    <section class="stats-panel">
      <div class="stats-header">
        <h2 class="stats-title">今日概览</h2>
        <button class="btn btn-sm btn-primary" @click="openNewVisit">➕ 新建接诊</button>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-today">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="1.8"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ todayTotal }}</span>
          <span class="stat-label">今日接诊</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon stat-progress">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ inProgressCount }}</span>
          <span class="stat-label">进行中</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon stat-done">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ completedCount }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon stat-overdue">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value overdue-val">{{ overdueCount }}</span>
          <span class="stat-label">超时</span>
        </div>
      </div>

      <div class="stat-card stat-avg">
        <div class="stat-icon stat-time">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ avgDuration }}</span>
          <span class="stat-label">平均耗时</span>
        </div>
      </div>
    </section>

    <!-- ========== ROOM MATRIX GRID ========== -->
    <section class="room-matrix">
      <h2 class="matrix-title">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" class="title-icon-svg">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/>
        </svg>
        房间矩阵
        <span class="room-count">{{ visitStore.rooms.length }} 间</span>
      </h2>

      <div class="room-grid">
        <button
          v-for="room in enrichedRooms"
          :key="room.id"
          class="room-tile"
          :class="{
            'tile-free': room.occupancy === 0,
            'tile-partial': room.occupancy > 0 && room.occupancy < room.capacity,
            'tile-full': room.occupancy >= room.capacity,
            'tile-selected': selectedRoomId === room.id
          }"
          @click="selectRoom(room)"
        >
          <div class="tile-header">
            <span class="tile-room-name">{{ room.name }}</span>
            <span class="tile-type-badge">{{ room.type || room.room_type || '诊室' }}</span>
          </div>
          <div class="tile-body">
            <div class="tile-status-dot" :class="room.statusClass"></div>
            <span class="tile-status-text">{{ room.statusText }}</span>
          </div>
          <div class="tile-footer">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" class="tile-person-icon">
              <circle cx="8" cy="5" r="2.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="tile-count">{{ room.occupancy }}/{{ room.capacity }}</span>
          </div>
          <div v-if="room.overdueCount > 0" class="tile-overdue-badge">
            ⏰ {{ room.overdueCount }}
          </div>
        </button>
      </div>
    </section>

    <!-- ========== ROOM DETAIL PANEL ========== -->
    <section v-if="selectedRoom" class="room-detail-panel">
      <div class="detail-top">
        <div class="detail-room-info">
          <h3 class="detail-room-name">{{ selectedRoom.name }}</h3>
          <span class="room-type-tag">{{ selectedRoom.type || selectedRoom.room_type || '诊室' }}</span>
          <span class="room-capacity-tag">容量 {{ selectedRoom.capacity }}</span>
        </div>
        <button class="detail-close-btn" @click="selectedRoomId = null">
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="detail-body">
        <!-- Occupants List -->
        <div v-if="roomOccupants.length > 0" class="occupants-list">
          <div
            v-for="visit in roomOccupants"
            :key="visit.id"
            class="occupant-card"
            :class="{ selected: selectedVisitId === visit.id, overdue: getTimer(visit).isOverdue }"
            @click="selectVisit(visit)"
          >
            <div class="occ-row">
              <span class="occ-name">{{ visit.guest_name }}</span>
              <span v-if="visit.is_vip" class="vip-badge">VIP</span>
              <span class="status-pill" :class="statusClass(visit.current_status)">
                {{ statusLabel(visit.current_status) }}
              </span>
              <span class="occ-timer" :class="{ overdue: getTimer(visit).isOverdue }">
                {{ getTimer(visit).display }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="room-empty-state">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="4" stroke="#cbd5e1" stroke-width="2"/>
            <circle cx="18" cy="20" r="3" fill="#cbd5e1"/>
            <path d="M10 34c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#cbd5e1" stroke-width="2"/>
          </svg>
          <p>此房间空闲</p>
          <p class="sub">无进行中患者</p>
        </div>
      </div>

      <!-- ========== EMERGENCY STATUS ADVANCE (selected visit) ========== -->
      <div v-if="selectedVisitInRoom" class="emergency-panel">
        <div class="emergency-header">
          <h4>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M8 1.5l6 11H2l6-11z" stroke="#f59e0b" stroke-width="1.2" stroke-linejoin="round"/>
              <line x1="8" y1="6" x2="8" y2="8.5" stroke="#f59e0b" stroke-width="1.2" stroke-linecap="round"/>
              <circle cx="8" cy="11" r="0.6" fill="#f59e0b"/>
            </svg>
            应急状态推进 · {{ selectedVisitInRoom.guest_name }}
          </h4>
        </div>

        <!-- Status Flow -->
        <div class="emergency-status-flow">
          <div
            v-for="(s, idx) in STATUS_LIST"
            :key="s.key"
            class="eflow-node"
            :class="{
              done: statusIndex(selectedVisitInRoom.current_status) > idx,
              current: selectedVisitInRoom.current_status === s.key,
              future: statusIndex(selectedVisitInRoom.current_status) < idx
            }"
          >
            <div class="eflow-dot">
              <svg v-if="statusIndex(selectedVisitInRoom.current_status) > idx" viewBox="0 0 16 16" width="14" height="14">
                <circle cx="8" cy="8" r="6" fill="currentColor"/>
                <path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span v-else>{{ idx + 1 }}</span>
            </div>
            <span class="eflow-label">{{ s.label }}</span>
            <div v-if="idx < STATUS_LIST.length - 1" class="eflow-line"></div>
          </div>
        </div>

        <!-- Next Status Advance -->
        <div v-if="nextEmergencyStatus" class="emergency-next">
          <div class="enext-row">
            <span class="enext-arrow">→</span>
            <span class="status-pill large" :class="statusClass(nextEmergencyStatus.key)">
              {{ nextEmergencyStatus.label }}
            </span>
            <div class="duration-input">
              <label>预计时长</label>
              <input
                v-model.number="emergencyDuration"
                type="number"
                min="1"
                max="480"
                placeholder="分钟"
                class="duration-field"
              />
              <span class="duration-unit">分钟</span>
            </div>
            <button
              class="btn btn-emergency"
              :disabled="!selectedVisitInRoom || !nextEmergencyStatus || advancing"
              @click="emergencyAdvance"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                <path d="M8 1.5l6 11H2l6-11z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              </svg>
              {{ advancing ? '推进中...' : '应急推进' }}
            </button>
          </div>
          <p class="enext-warning">⚠ 主管应急操作 — 将记录操作人和时间戳</p>
        </div>

        <!-- Completed status - can discharge -->
        <div v-if="selectedVisitInRoom.current_status !== 'DISCHARGED'" class="emergency-footer">
          <button
            class="btn btn-danger-outline"
            :disabled="discharging"
            @click="emergencyDischarge"
          >
            {{ discharging ? '处理中...' : '强制离院' }}
          </button>
        </div>
        <div v-else class="emergency-footer">
          <span class="discharged-hint">患者已离院</span>
        </div>
      </div>
    </section>

    <!-- ========== EMPTY STATE (no room selected) ========== -->
    <section v-else class="no-room-selected">
      <svg viewBox="0 0 48 48" width="80" height="80" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 2"/>
        <circle cx="24" cy="24" r="8" stroke="#cbd5e1" stroke-width="1.5"/>
        <circle cx="24" cy="24" r="2" fill="#cbd5e1"/>
      </svg>
      <p class="no-room-title">房间矩阵控制台</p>
      <p class="no-room-sub">点击上方房间卡片查看占用详情与应急操作</p>
    </section>
  </div>

  <!-- New Visit Modal -->
  <Teleport to="body">
    <div v-if="showNewVisitModal" class="modal-overlay" @click.self="showNewVisitModal = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>新建接诊单</h3>
          <button class="modal-close" @click="showNewVisitModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>客户姓名 <span class="required">*</span></label>
            <input v-model="newVisitForm.guestName" class="form-input" placeholder="请输入姓名" />
          </div>
          <div class="form-group">
            <label>手机号码</label>
            <input v-model="newVisitForm.guestPhone" class="form-input" placeholder="请输入手机号" />
          </div>
          <div class="form-group">
            <label>接诊护士 <span class="required">*</span></label>
            <select v-model="newVisitForm.assignedNurseId" class="form-input">
              <option :value="null" disabled>请选择护士</option>
              <option v-for="n in nurseList" :key="n.id" :value="n.id">{{ n.name }}</option>
            </select>
          </div>
          <p v-if="newVisitError" class="form-error">{{ newVisitError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showNewVisitModal = false">取消</button>
          <button class="btn btn-primary" :disabled="!newVisitForm.guestName.trim() || creatingVisit" @click="createVisit">
            {{ creatingVisit ? '创建中...' : '确认创建' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useWebSocket } from '../composables/useWebSocket'

const visitStore = useVisitStore()
const auth = useAuthStore()
const { send } = useWebSocket()

// ========== Status Definitions (same as NurseView) ==========
const STATUS_LIST = [
  { key: 'ARRIVED_WAITING',    label: '候诊中',    color: 'blue' },
  { key: 'DETECTION_PHOTO',    label: '检测拍照',  color: 'blue' },
  { key: 'IN_CLINIC_WAITING',  label: '等待就诊',  color: 'blue' },
  { key: 'CONSULTATION',       label: '就诊中',    color: 'green' },
  { key: 'PRE_TREATMENT_CARE', label: '术前护理',  color: 'blue' },
  { key: 'NUMBING',            label: '敷麻药',    color: 'purple' },
  { key: 'PRE_OP_WAITING',     label: '等待手术',  color: 'blue' },
  { key: 'IN_OPERATION',       label: '手术中',    color: 'red' },
  { key: 'POST_TREATMENT_CARE',label: '术后护理',  color: 'blue' },
  { key: 'DINING',             label: '用餐',      color: 'gray' },
  { key: 'DISCHARGED',         label: '已离院',    color: 'gray' }
]

const statusMap = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]))
const statusIndexMap = Object.fromEntries(STATUS_LIST.map((s, i) => [s.key, i]))

function statusLabel(key) {
  return statusMap[key]?.label ?? key
}

function statusClass(key) {
  const s = statusMap[key]
  if (!s) return ''
  return `status-${s.color}`
}

function statusIndex(key) {
  return statusIndexMap[key] ?? -1
}

// ========== Reactive State ==========
const selectedRoomId = ref(null)
const selectedVisitId = ref(null)
const emergencyDuration = ref(15)
const advancing = ref(false)
const discharging = ref(false)

// Create visit
const showNewVisitModal = ref(false)
const newVisitForm = ref({ guestName: '', guestPhone: '', assignedNurseId: null })
const creatingVisit = ref(false)
const newVisitError = ref('')
const nurseList = ref([])

// ========== Server Timer ==========
const now = ref(Date.now())
let timerInterval = null

timerInterval = setInterval(() => {
  now.value = Date.now()
}, 1000)

function onVisibilityChange() {
  now.value = Date.now()
}
document.addEventListener('visibilitychange', onVisibilityChange)

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

function getTimer(visit) {
  const deadline = visit.deadline_at
  if (!deadline) {
    return { display: '--', isOverdue: false }
  }
  const remaining = deadline - now.value
  if (remaining <= 0) {
    const overdueMin = Math.floor(Math.abs(remaining) / 60000)
    return { display: `超时 ${overdueMin}分`, isOverdue: true }
  }
  const min = Math.floor(remaining / 60000)
  const sec = Math.floor((remaining % 60000) / 1000)
  return { display: `${min}:${String(sec).padStart(2, '0')}`, isOverdue: false }
}

// ========== Computed: Stats ==========
const allVisits = computed(() => visitStore.visits)
const activeVisits = computed(() => visitStore.activeVisits)

const todayTotal = computed(() => allVisits.value.length)
const inProgressCount = computed(() => activeVisits.value.length)
const completedCount = computed(() =>
  allVisits.value.filter(v => v.current_status === 'DISCHARGED' || v.closed_at).length
)
const overdueCount = computed(() =>
  activeVisits.value.filter(v => {
    if (!v.deadline_at) return false
    return v.deadline_at <= now.value
  }).length
)
const avgDuration = computed(() => {
  const completed = allVisits.value.filter(v => v.closed_at && v.created_at)
  if (completed.length === 0) return '--'
  const totalMin = completed.reduce((sum, v) => {
    const dur = (v.closed_at - v.created_at) / 60000
    return sum + dur
  }, 0)
  const avg = Math.round(totalMin / completed.length)
  if (avg < 60) return `${avg}分`
  return `${Math.floor(avg / 60)}h ${avg % 60}分`
})

// ========== Computed: Enriched Rooms ==========
function getRoomOccupancy(room) {
  return visitStore.getRoomVisits(room.id).length
}

function getRoomOverdueCount(room) {
  const nowVal = now.value
  return visitStore.getRoomVisits(room.id).filter(v => {
    if (!v.deadline_at) return false
    return v.deadline_at <= nowVal
  }).length
}

const enrichedRooms = computed(() =>
  visitStore.rooms.map(room => {
    const occupancy = getRoomOccupancy(room)
    let statusClass = 'free'
    let statusText = '空闲'

    if (occupancy >= room.capacity) {
      statusClass = 'full'
      statusText = '满'
    } else if (occupancy > 0) {
      statusClass = 'partial'
      statusText = '使用中'
    }

    return {
      ...room,
      occupancy,
      overdueCount: getRoomOverdueCount(room),
      statusClass,
      statusText
    }
  })
)

// ========== Computed: Selected Room ==========
const selectedRoom = computed(() => {
  if (!selectedRoomId.value) return null
  return enrichedRooms.value.find(r => r.id === selectedRoomId.value) || null
})

const roomOccupants = computed(() => {
  if (!selectedRoomId.value) return []
  return visitStore.getRoomVisits(selectedRoomId.value)
})

const selectedVisitInRoom = computed(() => {
  if (!selectedVisitId.value) return null
  return roomOccupants.value.find(v => v.id === selectedVisitId.value) || null
})

const nextEmergencyStatus = computed(() => {
  if (!selectedVisitInRoom.value) return null
  const idx = statusIndex(selectedVisitInRoom.value.current_status)
  if (idx < 0 || idx >= STATUS_LIST.length - 1) return null
  // Don't advance beyond DISCHARGED via status advance
  if (STATUS_LIST[idx + 1].key === 'DISCHARGED') return null
  return STATUS_LIST[idx + 1]
})

// ========== Methods ==========
function selectRoom(room) {
  if (selectedRoomId.value === room.id) {
    selectedRoomId.value = null
    selectedVisitId.value = null
    return
  }
  selectedRoomId.value = room.id
  selectedVisitId.value = null
  emergencyDuration.value = 15
}

function selectVisit(visit) {
  selectedVisitId.value = visit.id
  emergencyDuration.value = 15
}

async function emergencyAdvance() {
  if (!selectedVisitInRoom.value || !nextEmergencyStatus.value) return
  advancing.value = true
  try {
    await send('VISIT_STATUS_ADVANCE', {
      visitId: selectedVisitInRoom.value.id,
      toStatus: nextEmergencyStatus.value.key,
      roomId: selectedVisitInRoom.value.current_room_id,
      expectedDurationMin: emergencyDuration.value,
      managerEmergency: true,
      managerId: auth.staff?.id,
      managerName: auth.name
    })
  } catch (e) {
    console.error('应急推进失败:', e)
  } finally {
    advancing.value = false
  }
}

async function emergencyDischarge() {
  if (!selectedVisitInRoom.value) return
  discharging.value = true
  try {
    await send('VISIT_DISCHARGE', {
      visitId: selectedVisitInRoom.value.id,
      managerEmergency: true,
      managerId: auth.staff?.id,
      managerName: auth.name
    })
    selectedVisitId.value = null
  } catch (e) {
    console.error('强制离院失败:', e)
  } finally {
    discharging.value = false
  }
}

function openNewVisit() {
  newVisitForm.value = { guestName: '', guestPhone: '', assignedNurseId: null }
  newVisitError.value = ''
  loadNurses()
  showNewVisitModal.value = true
}

async function loadNurses() {
  try {
    const res = await fetch('/api/staff')
    const data = await res.json()
    nurseList.value = (Array.isArray(data) ? data : []).filter(s => s.role === 'nurse')
  } catch (e) { /* ignore */ }
}

async function createVisit() {
  if (!newVisitForm.value.guestName.trim()) return
  if (!newVisitForm.value.assignedNurseId) { newVisitError.value = '请选择接诊护士'; return }
  creatingVisit.value = true
  newVisitError.value = ''
  try {
    await send('VISIT_CREATE', {
      guestName: newVisitForm.value.guestName.trim(),
      guestPhone: newVisitForm.value.guestPhone.trim(),
      assignedNurseId: newVisitForm.value.assignedNurseId,
    })
    showNewVisitModal.value = false
  } catch (e) {
    newVisitError.value = e.message || '创建失败'
  } finally {
    creatingVisit.value = false
  }
}
</script>

<style scoped>
/* ========== Layout ========== */
.manager-view {
  min-height: 100vh;
  background: var(--bg, #f8fafc);
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ========== Stats Panel ========== */
.stats-panel {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: all 0.2s ease;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-today {
  background: #dbeafe;
  color: #2563eb;
}

.stat-progress {
  background: #fef3c7;
  color: #d97706;
}

.stat-done {
  background: #dcfce7;
  color: #15803d;
}

.stat-overdue {
  background: #fee2e2;
  color: #dc2626;
}

.stat-time {
  background: #f3e8ff;
  color: #7c3aed;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text, #1e293b);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.overdue-val {
  color: #dc2626;
}

.stat-label {
  font-size: 12px;
  color: var(--text2, #64748b);
  font-weight: 500;
}

/* ========== Room Matrix Section ========== */
.room-matrix {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 22px 24px 24px;
}

.matrix-title {
  margin: 0 0 18px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text, #1e293b);
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon-svg {
  color: #64748b;
}

.room-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--text2, #64748b);
  background: #f1f5f9;
  padding: 2px 10px;
  border-radius: 10px;
  margin-left: auto;
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

/* ========== Room Tile ========== */
.room-tile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px 14px;
  border-radius: 14px;
  border: 2px solid var(--border, #e2e8f0);
  background: var(--bg-card, #fff);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  font-family: inherit;
  text-align: left;
  color: inherit;
}

.room-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.room-tile:active {
  transform: translateY(0);
}

/* Free (green) */
.tile-free {
  border-color: #bbf7d0;
  background: linear-gradient(135deg, #f0fdf4 0%, #fff 100%);
}

.tile-free .tile-status-dot {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
}

/* Partial (yellow) */
.tile-partial {
  border-color: #fde68a;
  background: linear-gradient(135deg, #fffbeb 0%, #fff 100%);
}

.tile-partial .tile-status-dot {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
}

/* Full (red) */
.tile-full {
  border-color: #fecaca;
  background: linear-gradient(135deg, #fef2f2 0%, #fff 100%);
}

.tile-full .tile-status-dot {
  background: #ef4444;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
  animation: pulse-red 2s ease-in-out infinite;
}

.tile-selected {
  border-color: #2563eb !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15), 0 6px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.3); }
  50% { box-shadow: 0 0 18px rgba(239, 68, 68, 0.5); }
}

.tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tile-room-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.tile-type-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--text2, #64748b);
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 6px;
}

.tile-body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tile-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tile-status-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

.tile-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text2, #64748b);
  font-size: 13px;
}

.tile-person-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.tile-overdue-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 1px 8px;
  border-radius: 10px;
}

/* ========== Room Detail Panel ========== */
.room-detail-panel {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  overflow: hidden;
}

.detail-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.detail-room-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-room-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.room-type-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--primary, #2563eb);
  background: #eff6ff;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #bfdbfe;
}

.room-capacity-tag {
  font-size: 12px;
  color: var(--text2, #64748b);
  background: #f8fafc;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.detail-close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px;
  color: #94a3b8;
  flex-shrink: 0;
}

.detail-close-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.detail-body {
  padding: 16px 24px;
  min-height: 100px;
}

/* ========== Occupant Cards ========== */
.occupants-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.occupant-card {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--bg-card, #fff);
}

.occupant-card:hover {
  border-color: #93c5fd;
  background: #f0f7ff;
}

.occupant-card.selected {
  border-color: #2563eb;
  background: #f0f7ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.occupant-card.overdue {
  border-left: 3px solid #ef4444;
}

.occ-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}

.occ-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

.vip-badge {
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

/* Status Pills */
.status-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.status-pill.large {
  font-size: 13px;
  padding: 4px 14px;
  border-radius: 12px;
}

.status-blue  { background: #dbeafe; color: #1d4ed8; }
.status-green { background: #dcfce7; color: #15803d; }
.status-purple { background: #f3e8ff; color: #7c3aed; }
.status-red   { background: #fee2e2; color: #b91c1c; }
.status-gray  { background: #f1f5f9; color: #64748b; }

.occ-timer {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2, #64748b);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.occ-timer.overdue {
  color: #dc2626;
  font-weight: 600;
}

/* ========== Room Empty State ========== */
.room-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  color: #94a3b8;
  gap: 8px;
}

.room-empty-state p {
  margin: 0;
  font-size: 14px;
}

.room-empty-state .sub {
  font-size: 12px;
  color: #cbd5e1;
}

/* ========== Emergency Panel ========== */
.emergency-panel {
  border-top: 2px solid #fde68a;
  background: #fffbeb;
  padding: 20px 24px;
}

.emergency-header {
  margin-bottom: 16px;
}

.emergency-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Emergency Status Flow (compact) */
.emergency-status-flow {
  display: flex;
  align-items: flex-start;
  gap: 0;
  overflow-x: auto;
  padding: 8px 0 6px;
  margin-bottom: 16px;
}

.eflow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 40px;
  position: relative;
}

.eflow-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  z-index: 1;
  flex-shrink: 0;
}

.eflow-node.done .eflow-dot {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.eflow-node.current .eflow-dot {
  background: #fff;
  border-color: #2563eb;
  color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.eflow-node.future .eflow-dot {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #cbd5e1;
}

.eflow-line {
  position: absolute;
  top: 12px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e2e8f0;
  z-index: 0;
}

.eflow-node.done + .eflow-node .eflow-line,
.eflow-node.done .eflow-line {
  background: #2563eb;
}

.eflow-label {
  font-size: 9px;
  color: #94a3b8;
  text-align: center;
  white-space: nowrap;
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.eflow-node.done .eflow-label,
.eflow-node.current .eflow-label {
  color: #1e293b;
  font-weight: 600;
}

/* Emergency Next Step */
.emergency-next {
  margin-bottom: 14px;
}

.enext-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #fde68a;
  border-radius: 10px;
  flex-wrap: wrap;
}

.enext-arrow {
  font-size: 20px;
  color: #f59e0b;
  font-weight: 700;
}

.duration-input {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.duration-input label {
  font-size: 12px;
  color: var(--text2, #64748b);
}

.duration-field {
  width: 52px;
  padding: 4px 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.duration-field:focus {
  outline: none;
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.duration-unit {
  font-size: 12px;
  color: var(--text2, #64748b);
}

.enext-warning {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;
}

/* Emergency Footer */
.emergency-footer {
  padding-top: 12px;
  border-top: 1px solid #fde68a;
}

.discharged-hint {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
}

/* ========== Buttons ========== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  white-space: nowrap;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-emergency {
  background: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
  font-weight: 600;
}

.btn-emergency:hover:not(:disabled) {
  background: #d97706;
  border-color: #d97706;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
}

.btn-danger-outline {
  background: #fff;
  color: #dc2626;
  border-color: #fecaca;
}

.btn-danger-outline:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #fca5a5;
}

/* ========== No Room Selected ========== */
.no-room-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 20px;
  gap: 10px;
  color: #94a3b8;
}

.no-room-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #64748b;
}

.no-room-sub {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

/* ========== Responsive ========== */
@media (max-width: 1100px) {
  .stats-panel {
    grid-template-columns: repeat(3, 1fr);
  }

  .stat-card.stat-avg {
    grid-column: span 1;
  }
}

@media (max-width: 768px) {
  .manager-view {
    padding: 12px;
    gap: 14px;
  }

  .stats-panel {
    grid-template-columns: repeat(2, 1fr);
  }

  .room-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .enext-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .duration-input {
    margin-left: 0;
  }
}

@media (max-width: 480px) {
  .stats-panel {
    grid-template-columns: 1fr 1fr;
  }

  .stat-card {
    padding: 12px 14px;
    gap: 10px;
  }

  .stat-icon {
    width: 36px;
    height: 36px;
  }

  .stat-value {
    font-size: 20px;
  }
}

/* ========== Modal (shared) ========== */
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center; }
.modal-dialog { background:#fff;border-radius:12px;width:90%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.15); }
.modal-header { display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0; }
.modal-header h3 { margin:0;font-size:16px; }
.modal-close { background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;padding:4px; }
.modal-body { padding:20px; }
.modal-footer { display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid #e2e8f0; }
.stats-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
.stats-title { font-size:16px;font-weight:600;margin:0; }

.btn-sm { padding:6px 14px;font-size:13px; }
</style>

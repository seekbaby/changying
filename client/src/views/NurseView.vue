<template>
  <div class="nurse-view">
    <!-- ========== LEFT PANEL: Visit List ========== -->
    <aside class="left-panel">
      <div class="panel-header">
        <h2 class="panel-title">今日接诊单</h2>
        <span class="visit-count">{{ activeVisits.length }} 位</span>
      </div>

      <div class="visit-list">
        <div
          v-for="visit in sortedVisits"
          :key="visit.id"
          class="visit-card"
          :class="{ selected: selectedVisit?.id === visit.id, vip: visit.is_vip }"
          @click="selectVisit(visit)"
        >
          <div class="card-top">
            <div class="guest-name-row">
              <span class="guest-name">{{ visit.guest_name }}</span>
              <span v-if="visit.is_vip" class="vip-badge">VIP</span>
            </div>
            <span class="status-pill" :class="statusClass(visit.current_status)">
              {{ statusLabel(visit.current_status) }}
            </span>
          </div>
          <div class="card-mid">
            <svg class="room-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M2 4h4v3H2V4zm0 5h4v3H2V9zm8-5h4v3h-4V4zm0 5h4v3h-4V9z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <span class="room-name">{{ roomName(visit.current_room_id) }}</span>
          </div>
          <div class="card-bottom">
            <svg class="timer-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="timer" :class="{ overdue: getTimer(visit).isOverdue }">
              {{ getTimer(visit).display }}
            </span>
          </div>
        </div>

        <div v-if="sortedVisits.length === 0" class="empty-state">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
            <rect x="6" y="8" width="36" height="32" rx="3" stroke="#cbd5e1" stroke-width="2"/>
            <line x1="6" y1="16" x2="42" y2="16" stroke="#cbd5e1" stroke-width="2"/>
            <circle cx="18" cy="28" r="2" fill="#cbd5e1"/>
            <circle cx="30" cy="28" r="2" fill="#cbd5e1"/>
          </svg>
          <p>暂无接诊单</p>
        </div>
      </div>
    </aside>

    <!-- ========== RIGHT PANEL: Status Advance ========== -->
    <main class="right-panel">
      <template v-if="selectedVisit">
        <!-- Selected Guest Header -->
        <div class="detail-header">
          <div class="detail-guest">
            <span class="detail-name">{{ selectedVisit.guest_name }}</span>
            <span v-if="selectedVisit.is_vip" class="vip-badge">VIP</span>
          </div>
          <span class="status-pill large" :class="statusClass(selectedVisit.current_status)">
            {{ statusLabel(selectedVisit.current_status) }}
          </span>
        </div>

        <!-- Timer Bar -->
        <div class="timer-bar" :class="{ overdue: getTimer(selectedVisit).isOverdue }">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span class="timer-label">{{ getTimer(selectedVisit).isOverdue ? '已超时' : '剩余时间' }}</span>
          <span class="timer-value">{{ getTimer(selectedVisit).display }}</span>
        </div>

        <!-- Status Flow Visualization -->
        <div class="section">
          <h3 class="section-title">状态流程</h3>
          <div class="status-flow">
            <div
              v-for="(s, idx) in STATUS_LIST"
              :key="s.key"
              class="flow-node"
              :class="{
                done: statusIndex(selectedVisit.current_status) > idx,
                current: selectedVisit.current_status === s.key,
                future: statusIndex(selectedVisit.current_status) < idx
              }"
            >
              <div class="flow-dot">
                <svg v-if="statusIndex(selectedVisit.current_status) > idx" viewBox="0 0 16 16" width="16" height="16">
                  <circle cx="8" cy="8" r="6" fill="currentColor"/>
                  <path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <template v-else>{{ idx + 1 }}</template>
              </div>
              <span class="flow-label">{{ s.label }}</span>
              <div v-if="idx < STATUS_LIST.length - 1" class="flow-line"></div>
            </div>
          </div>
        </div>

        <!-- Room Selector -->
        <div class="section">
          <h3 class="section-title">所在房间</h3>
          <div class="room-grid">
            <button
              v-for="room in visitStore.rooms"
              :key="room.id"
              class="room-chip"
              :class="{
                active: selectedVisit.current_room_id === room.id,
                full: getRoomOccupancy(room) >= room.capacity && selectedVisit.current_room_id !== room.id
              }"
              :disabled="getRoomOccupancy(room) >= room.capacity && selectedVisit.current_room_id !== room.id"
              @click="changeRoom(room)"
            >
              <span class="room-chip-name">{{ room.name }}</span>
              <span class="room-chip-count">{{ getRoomOccupancy(room) }}/{{ room.capacity }}</span>
            </button>
          </div>
        </div>

        <!-- Next Status Preview -->
        <div v-if="nextStatus" class="section next-step">
          <h3 class="section-title">下一步</h3>
          <div class="next-step-card">
            <span class="arrow">→</span>
            <span class="status-pill" :class="statusClass(nextStatus.key)">{{ nextStatus.label }}</span>
            <div class="duration-input">
              <label>预计时长</label>
              <input
                v-model.number="advanceDuration"
                type="number"
                min="1"
                max="480"
                placeholder="分钟"
                class="duration-field"
              />
              <span class="duration-unit">分钟</span>
            </div>
          </div>
        </div>

        <!-- Conflict Warning -->
        <div v-if="conflictGuard.showConflict.value" class="conflict-banner">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M8 1.5l6.5 11H1.5L8 1.5z" stroke="#dc2626" stroke-width="1.2" stroke-linejoin="round"/>
            <line x1="8" y1="6" x2="8" y2="9" stroke="#dc2626" stroke-width="1.2" stroke-linecap="round"/>
            <circle cx="8" cy="11.5" r="0.75" fill="#dc2626"/>
          </svg>
          <span>
            {{ conflictGuard.conflictInfo.value?.roomName }} 已满
            ({{ conflictGuard.conflictInfo.value?.occupied }}/{{ conflictGuard.conflictInfo.value?.capacity }})
          </span>
          <button class="dismiss-btn" @click="conflictGuard.dismiss()">知道了</button>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="empty-detail">
        <svg viewBox="0 0 48 48" width="64" height="64" fill="none">
          <circle cx="24" cy="24" r="20" stroke="#cbd5e1" stroke-width="2"/>
          <path d="M24 14v10l6 4" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>请选择左侧接诊单</p>
        <p class="sub">查看并推进客户状态</p>
      </div>

      <!-- Bottom Action Buttons -->
      <div class="bottom-actions">
        <button class="btn btn-outline" @click="openNewVisit">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          新建接诊单
        </button>
        <button
          class="btn btn-handover"
          :disabled="!selectedVisit || selectedVisit.current_status === 'DISCHARGED' || handoverLoading"
          @click="openHandover"
        >
          <span>🔄</span>
          {{ handoverLoading ? '交接中...' : '交接' }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="!selectedVisit || !nextStatus || advancing"
          @click="advanceStatus"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ advancing ? '推进中...' : '推进状态' }}
        </button>
        <button
          class="btn btn-danger"
          :disabled="!selectedVisit || selectedVisit.current_status === 'DISCHARGED' || discharging"
          @click="openDischarge"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M6 2h4M2 4h12M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ discharging ? '处理中...' : '离院' }}
        </button>
      </div>
    </main>

    <!-- ========== MODALS ========== -->

    <!-- New Visit Modal -->
    <Teleport to="body">
      <div v-if="showNewVisitModal" class="modal-overlay" @click.self="showNewVisitModal = false">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>新建接诊单</h3>
            <button class="modal-close" @click="showNewVisitModal = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
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
              <label>接诊护士</label>
              <input :value="auth.name" class="form-input" disabled />
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

    <!-- Discharge Confirm Modal -->
    <Teleport to="body">
      <div v-if="showDischargeModal" class="modal-overlay" @click.self="showDischargeModal = false">
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h3>确认离院</h3>
            <button class="modal-close" @click="showDischargeModal = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="confirm-text">
              确定将 <strong>{{ selectedVisit?.guest_name }}</strong> 标记为离院吗？
            </p>
            <p class="confirm-sub">此操作不可撤销</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showDischargeModal = false">取消</button>
            <button class="btn btn-danger" :disabled="discharging" @click="dischargeVisit">
              {{ discharging ? '处理中...' : '确认离院' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Handover Modal -->
    <Teleport to="body">
      <div v-if="showHandoverModal" class="modal-overlay" @click.self="showHandoverModal = false">
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h3>🔄 交接接诊单</h3>
            <button class="modal-close" @click="showHandoverModal = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="confirm-text">
              将 <strong>{{ selectedVisit?.guest_name }}</strong> 交接给其他护士
            </p>
            <div class="form-group" style="margin-top:12px">
              <label>目标护士 <span class="required">*</span></label>
              <select v-model="targetNurseId" class="form-input">
                <option value="" disabled selected>请选择护士</option>
                <option v-for="n in handoverNurses" :key="n.id" :value="n.id">
                  {{ n.name || n.nickname || n.id }}
                </option>
              </select>
            </div>
            <p v-if="handoverError" class="form-error">{{ handoverError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showHandoverModal = false">取消</button>
            <button class="btn btn-primary" :disabled="!targetNurseId || handoverLoading" @click="confirmHandover">
              {{ handoverLoading ? '交接中...' : '确认交接' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useWebSocket } from '../composables/useWebSocket'
import { useConflictGuard } from '../composables/useConflictGuard'

const visitStore = useVisitStore()
const auth = useAuthStore()
const { send } = useWebSocket()
const conflictGuard = useConflictGuard()

// ========== Status Definitions ==========
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
  { key: 'DISCHARGED',         label: '已离院',    color: 'gray' },
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
const selectedVisitId = ref(null)
const advanceDuration = ref(15)
const showNewVisitModal = ref(false)
const showDischargeModal = ref(false)
const creatingVisit = ref(false)
const advancing = ref(false)
const discharging = ref(false)
const newVisitError = ref('')

// Handover state
const showHandoverModal = ref(false)
const handoverNurses = ref([])
const targetNurseId = ref('')
const handoverLoading = ref(false)
const handoverError = ref('')

const newVisitForm = ref({
  guestName: '',
  guestPhone: '',
})

// ========== Server Timer (centralized) ==========
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

// ========== Computed ==========
const activeVisits = computed(() =>
  visitStore.visits.filter(v => !v.closed_at)
)

const sortedVisits = computed(() =>
  [...activeVisits.value].sort((a, b) => {
    // VIP first, then by status order
    if (a.is_vip && !b.is_vip) return -1
    if (!a.is_vip && b.is_vip) return 1
    return statusIndex(a.current_status) - statusIndex(b.current_status)
  })
)

const selectedVisit = computed(() =>
  selectedVisitId.value
    ? visitStore.visits.find(v => v.id === selectedVisitId.value)
    : null
)

const nextStatus = computed(() => {
  if (!selectedVisit.value) return null
  const idx = statusIndex(selectedVisit.value.current_status)
  if (idx < 0 || idx >= STATUS_LIST.length - 1) return null
  return STATUS_LIST[idx + 1]
})

// ========== Methods ==========
function selectVisit(visit) {
  selectedVisitId.value = visit.id
  advanceDuration.value = 15
  conflictGuard.dismiss()
}

function roomName(roomId) {
  if (!roomId) return '未分配'
  const room = visitStore.rooms.find(r => r.id === roomId)
  return room?.name ?? '未知房间'
}

function getRoomOccupancy(room) {
  return visitStore.visits.filter(
    v => v.current_room_id === room.id && !v.closed_at
  ).length
}

async function changeRoom(room) {
  if (!selectedVisit.value) return

  // Conflict pre-check
  const result = conflictGuard.checkRoom(room.id, selectedVisit.value.id)
  if (!result.ok) return

  // If no conflict, we don't send to server yet — room change
  // happens as part of status advancement
  // (Per spec, roomId is sent with VISIT_STATUS_ADVANCE)
}

function openNewVisit() {
  newVisitForm.value = { guestName: '', guestPhone: '' }
  newVisitError.value = ''
  showNewVisitModal.value = true
}

async function createVisit() {
  if (!newVisitForm.value.guestName.trim()) return
  creatingVisit.value = true
  newVisitError.value = ''
  try {
    await send('VISIT_CREATE', {
      guestName: newVisitForm.value.guestName.trim(),
      guestPhone: newVisitForm.value.guestPhone.trim(),
      assignedNurseId: auth.staff?.id,
    })
    showNewVisitModal.value = false
  } catch (e) {
    newVisitError.value = e.message ?? '创建失败，请重试'
  } finally {
    creatingVisit.value = false
  }
}

async function advanceStatus() {
  if (!selectedVisit.value || !nextStatus.value) return
  advancing.value = true
  try {
    await send('VISIT_STATUS_ADVANCE', {
      visitId: selectedVisit.value.id,
      toStatus: nextStatus.value.key,
      roomId: selectedVisit.value.current_room_id,
      expectedDurationMin: advanceDuration.value,
    })
  } catch (e) {
    console.error('推进状态失败:', e)
  } finally {
    advancing.value = false
  }
}

function openDischarge() {
  if (!selectedVisit.value) return
  showDischargeModal.value = true
}

async function dischargeVisit() {
  if (!selectedVisit.value) return
  discharging.value = true
  try {
    await send('VISIT_DISCHARGE', {
      visitId: selectedVisit.value.id,
    })
    showDischargeModal.value = false
    selectedVisitId.value = null
  } catch (e) {
    console.error('离院操作失败:', e)
  } finally {
    discharging.value = false
  }
}

// ========== Handover ==========
async function openHandover() {
  if (!selectedVisit.value) return
  showHandoverModal.value = true
  targetNurseId.value = ''
  handoverError.value = ''
  await loadNurses()
}

async function loadNurses() {
  try {
    const res = await fetch('/api/staff')
    const data = await res.json()
    const staffList = data.staff || data || []
    const currentId = auth.staff?.id
    handoverNurses.value = staffList.filter(
      s => s.role === 'nurse' && s.id !== currentId
    )
  } catch (e) {
    console.error('加载护士列表失败:', e)
    handoverNurses.value = []
  }
}

async function confirmHandover() {
  if (!selectedVisit.value || !targetNurseId.value) return
  handoverLoading.value = true
  handoverError.value = ''
  try {
    await send('VISIT_HANDOVER', {
      visitId: selectedVisit.value.id,
      toNurseId: targetNurseId.value,
    })
    showHandoverModal.value = false
    // Brief success feedback & refresh — the store will auto-update via WS
  } catch (e) {
    handoverError.value = e.message ?? '交接失败，请重试'
  } finally {
    handoverLoading.value = false
  }
}
</script>

<style scoped>
/* ========== Layout ========== */
.nurse-view {
  display: flex;
  height: 100vh;
  background: var(--bg, #f8fafc);
  overflow: hidden;
}

/* ========== Left Panel ========== */
.left-panel {
  width: 320px;
  min-width: 320px;
  background: var(--bg-card, #fff);
  border-right: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

.visit-count {
  font-size: 12px;
  color: var(--text2, #64748b);
  background: #f1f5f9;
  padding: 2px 10px;
  border-radius: 10px;
}

.visit-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ========== Visit Card ========== */
.visit-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.visit-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
}

.visit-card.selected {
  border-color: #2563eb;
  box-shadow: 0 2px 12px rgba(37, 99, 235, 0.15);
  background: #f0f7ff;
}

.visit-card.vip {
  border-left: 3px solid #f59e0b;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.guest-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.guest-name {
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

.card-mid {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  color: var(--text2, #64748b);
  font-size: 13px;
}

.room-icon,
.timer-icon {
  flex-shrink: 0;
  color: #94a3b8;
}

.card-bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text2, #64748b);
}

.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.timer.overdue {
  color: #dc2626;
  font-weight: 600;
}

/* ========== Empty State ========== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #94a3b8;
  gap: 12px;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

/* ========== Right Panel ========== */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow-y: auto;
  position: relative;
  min-width: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.detail-guest {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

/* Timer Bar */
.timer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  margin-bottom: 24px;
  color: #15803d;
}

.timer-bar.overdue {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.timer-label {
  font-size: 13px;
  font-weight: 500;
}

.timer-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

/* ========== Sections ========== */
.section {
  margin-bottom: 24px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

/* Status Flow */
.status-flow {
  display: flex;
  align-items: flex-start;
  gap: 0;
  overflow-x: auto;
  padding: 8px 0;
}

.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 48px;
  position: relative;
}

.flow-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  z-index: 1;
  flex-shrink: 0;
}

.flow-node.done .flow-dot {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.flow-node.current .flow-dot {
  background: #fff;
  border-color: #2563eb;
  color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.flow-node.future .flow-dot {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #cbd5e1;
}

.flow-line {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e2e8f0;
  z-index: 0;
}

.flow-node.done + .flow-node .flow-line,
.flow-node.done .flow-line {
  background: #2563eb;
}

.flow-label {
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
  white-space: nowrap;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-node.done .flow-label,
.flow-node.current .flow-label {
  color: #1e293b;
  font-weight: 600;
}

/* Room Grid */
.room-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.room-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: var(--bg-card, #fff);
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #1e293b);
  transition: all 0.15s ease;
}

.room-chip:hover:not(:disabled) {
  border-color: #93c5fd;
  background: #f0f7ff;
}

.room-chip.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}

.room-chip.full {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f1f5f9;
}

.room-chip-name {
  font-weight: 500;
}

.room-chip-count {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 6px;
}

.room-chip.active .room-chip-count {
  background: #dbeafe;
  color: #1d4ed8;
}

/* Next Step */
.next-step-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
}

.next-step-card .arrow {
  font-size: 20px;
  color: #2563eb;
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
  width: 56px;
  padding: 4px 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.duration-field:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.duration-unit {
  font-size: 12px;
  color: var(--text2, #64748b);
}

/* Conflict Banner */
.conflict-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
  margin-top: 12px;
}

.dismiss-btn {
  margin-left: auto;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff;
  color: #dc2626;
  cursor: pointer;
}

/* ========== Empty Detail ========== */
.empty-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94a3b8;
}

.empty-detail p {
  margin: 0;
  font-size: 15px;
}

.empty-detail .sub {
  font-size: 13px;
  color: #cbd5e1;
}

/* ========== Bottom Actions ========== */
.bottom-actions {
  display: flex;
  gap: 10px;
  padding-top: 20px;
  margin-top: auto;
  border-top: 1px solid var(--border, #e2e8f0);
  flex-shrink: 0;
}

/* ========== Buttons ========== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-danger {
  background: #fff;
  color: #dc2626;
  border-color: #fecaca;
}

.btn-danger:hover:not(:disabled) {
  background: #fef2f2;
}

.btn-outline {
  background: #fff;
  color: var(--text, #1e293b);
  border-color: var(--border, #e2e8f0);
}

.btn-outline:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-handover {
  background: #fff;
  color: #7c3aed;
  border-color: #ddd6fe;
}

.btn-handover:hover:not(:disabled) {
  background: #f5f3ff;
  border-color: #c4b5fd;
}

/* ========== Modal ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-dialog {
  background: #fff;
  border-radius: 14px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.2s ease;
}

.modal-dialog.modal-sm {
  width: 360px;
}

@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.modal-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px;
  color: #94a3b8;
}

.modal-close:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 18px;
}

/* Form */
.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text, #1e293b);
  margin-bottom: 6px;
}

.required {
  color: #dc2626;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text, #1e293b);
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.form-input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.form-error {
  color: #dc2626;
  font-size: 13px;
  margin: 0;
}

/* Confirm Text */
.confirm-text {
  font-size: 15px;
  color: var(--text, #1e293b);
  margin: 0 0 4px;
}

.confirm-sub {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}
</style>

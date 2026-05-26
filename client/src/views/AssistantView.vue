<template>
  <div class="assistant-view">
    <!-- ========== LEFT PANEL: Visit List ========== -->
    <aside class="left-panel">
      <div class="panel-header">
        <h2 class="panel-title">今日接诊单</h2>
        <span class="visit-count">{{ activeVisits.length }} 位</span>
        <button class="btn btn-sm btn-primary" @click="openNewVisit" style="margin-left:auto">➕ 新建</button>
      </div>

      <div class="visit-list">
        <div
          v-for="visit in sortedVisits"
          :key="visit.id"
          class="visit-card"
          :class="{
            selected: selectedVisit?.id === visit.id,
            vip: visit.is_vip,
            locked: lockedVisitIds.has(visit.id)
          }"
          @click="selectVisit(visit)"
        >
          <div class="card-top">
            <div class="guest-name-row">
              <span class="guest-name">{{ visit.guest_name }}</span>
              <span v-if="visit.is_vip" class="vip-badge">VIP</span>
              <span v-if="lockedVisitIds.has(visit.id)" class="locked-badge">
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" stroke-width="1.2"/>
                </svg>
                已开单
              </span>
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

    <!-- ========== RIGHT PANEL: Treatment Plan Entry ========== -->
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

        <!-- Lock Banner (if already submitted) -->
        <div v-if="isLocked" class="lock-banner">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="8" cy="10" r="1" fill="currentColor"/>
          </svg>
          <span>治疗方案已提交，不可修改</span>
        </div>

        <!-- ===== Treatment Plan Form ===== -->
        <div class="section">
          <h3 class="section-title">
            治疗方案
            <span v-if="isLocked" class="section-badge locked">已锁定</span>
          </h3>
          <textarea
            v-model="treatmentPlan"
            class="plan-textarea"
            :disabled="isLocked"
            :placeholder="isLocked ? '' : '请输入治疗方案，包括项目名称、部位、数量、备注等…'"
            rows="6"
          ></textarea>
        </div>

        <!-- ===== Emotion Tags ===== -->
        <div class="section">
          <h3 class="section-title">情绪标签</h3>
          <div class="emotion-tags">
            <button
              v-for="tag in EMOTION_TAGS"
              :key="tag.key"
              class="emotion-pill"
              :class="{
                active: selectedEmotions.includes(tag.key),
                disabled: isLocked
              }"
              :disabled="isLocked"
              @click="toggleEmotion(tag.key)"
            >
              {{ tag.emoji }} {{ tag.label }}
            </button>
          </div>
        </div>

        <!-- ===== Submit Plan Button ===== -->
        <div v-if="!isLocked" class="section submit-section">
          <button
            class="btn btn-primary btn-lg"
            :disabled="!canSubmit || submittingPlan"
            @click="submitTreatmentPlan"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M2 10l3 3 9-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ submittingPlan ? '提交中…' : '确认开单' }}
          </button>
          <p v-if="submitError" class="form-error">{{ submitError }}</p>
        </div>

        <!-- ===== Note Timeline ===== -->
        <div class="section">
          <h3 class="section-title">
            备注时间线
            <button
              class="refresh-btn"
              :disabled="loadingTimeline"
              @click="fetchTimeline"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
                :class="{ spinning: loadingTimeline }">
                <path d="M1 8a7 7 0 0 1 12.22-4.72M15 8a7 7 0 0 1-12.22 4.72"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M3 2v4.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              刷新
            </button>
          </h3>

          <!-- Timeline -->
          <div v-if="timelineEntries.length > 0" class="timeline">
            <div
              v-for="(entry, idx) in timelineEntries"
              :key="idx"
              class="timeline-item"
              :class="{ 'is-plan': entry.type === 'treatment_plan' }"
            >
              <div class="timeline-dot">
                <svg v-if="entry.type === 'treatment_plan'" viewBox="0 0 16 16" width="14" height="14">
                  <circle cx="8" cy="8" r="6" fill="#2563eb"/>
                  <path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg v-else viewBox="0 0 16 16" width="14" height="14">
                  <circle cx="8" cy="8" r="5" fill="#94a3b8"/>
                </svg>
              </div>

              <div class="timeline-line" v-if="idx < timelineEntries.length - 1"></div>

              <div class="timeline-content">
                <div class="timeline-meta">
                  <span class="timeline-author">{{ entry.author }}</span>
                  <span class="timeline-role">{{ entry.role }}</span>
                  <span class="timeline-time">{{ formatTime(entry.time) }}</span>
                </div>
                <div v-if="entry.plan" class="timeline-plan">
                  <div class="timeline-plan-label">治疗方案</div>
                  <p class="timeline-plan-text">{{ entry.plan }}</p>
                  <div v-if="entry.emotionTags && entry.emotionTags.length" class="timeline-emotions">
                    <span
                      v-for="et in entry.emotionTags"
                      :key="et"
                      class="emotion-pill-sm"
                    >{{ emotionLabel(et) }}</span>
                  </div>
                </div>
                <p v-else class="timeline-body">{{ entry.content }}</p>
              </div>
            </div>
          </div>

          <!-- Empty timeline -->
          <div v-else-if="!loadingTimeline" class="timeline-empty">
            <p>暂无备注记录</p>
          </div>

          <!-- Loading -->
          <div v-if="loadingTimeline" class="timeline-loading">
            <p>加载中…</p>
          </div>
        </div>

        <!-- ===== Add General Note ===== -->
        <div class="section">
          <h3 class="section-title">添加备注</h3>
          <div class="note-input-row">
            <textarea
              v-model="generalNote"
              class="note-textarea"
              placeholder="输入备注内容…"
              rows="3"
            ></textarea>
            <button
              class="btn btn-outline btn-send"
              :disabled="!generalNote.trim() || sendingNote"
              @click="sendGeneralNote"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M2 2l12 6-12 6 3-6-3-6z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ sendingNote ? '发送中…' : '发送' }}
            </button>
          </div>
          <p v-if="noteError" class="form-error">{{ noteError }}</p>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="empty-detail">
        <svg viewBox="0 0 48 48" width="64" height="64" fill="none">
          <circle cx="24" cy="16" r="10" stroke="#cbd5e1" stroke-width="2"/>
          <path d="M14 38c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
          <rect x="18" y="32" width="12" height="14" rx="2" stroke="#cbd5e1" stroke-width="2"/>
        </svg>
        <p>请选择左侧接诊单</p>
        <p class="sub">录入治疗方案并查看备注时间线</p>
      </div>
    </main>
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
            <label>接诊人员</label>
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
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useWebSocket } from '../composables/useWebSocket'

const visitStore = useVisitStore()
const auth = useAuthStore()
const { send } = useWebSocket()

// ========== Constants ==========
const EMOTION_TAGS = [
  { key: 'afraid_pain',  label: '怕疼',  emoji: '😣' },
  { key: 'in_hurry',     label: '赶时间', emoji: '⏰' },
  { key: 'nervous',      label: '紧张',  emoji: '😰' },
  { key: 'relaxed',      label: '放松',  emoji: '😌' },
  { key: 'satisfied',    label: '满意',  emoji: '😊' },
  { key: 'hesitant',     label: '犹豫',  emoji: '🤔' },
]

const emotionMap = Object.fromEntries(EMOTION_TAGS.map(t => [t.key, t]))

// Status definitions (mirrored from NurseView for display)
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

function statusLabel(key) {
  return statusMap[key]?.label ?? key
}

function statusClass(key) {
  const s = statusMap[key]
  if (!s) return ''
  return `status-${s.color}`
}

// ========== Reactive State ==========
const selectedVisitId = ref(null)
const treatmentPlan = ref('')
const selectedEmotions = ref([])
const generalNote = ref('')

const submittingPlan = ref(false)
const sendingNote = ref(false)
const submitError = ref('')
const noteError = ref('')

// Track which visits have submitted treatment plans (locally)
const lockedVisitIds = ref(new Set())

// Timeline
const timelineEntries = ref([])
const loadingTimeline = ref(false)

// Create visit
const showNewVisitModal = ref(false)
const newVisitForm = ref({ guestName: '', guestPhone: '' })
const creatingVisit = ref(false)
const newVisitError = ref('')

// ========== Computed ==========
const activeVisits = computed(() =>
  visitStore.visits.filter(v => !v.closed_at)
)

const sortedVisits = computed(() =>
  [...activeVisits.value].sort((a, b) => {
    if (a.is_vip && !b.is_vip) return -1
    if (!a.is_vip && b.is_vip) return 1
    return 0
  })
)

const selectedVisit = computed(() =>
  selectedVisitId.value
    ? visitStore.visits.find(v => v.id === selectedVisitId.value)
    : null
)

const isLocked = computed(() =>
  selectedVisitId.value ? lockedVisitIds.value.has(selectedVisitId.value) : false
)

const canSubmit = computed(() =>
  treatmentPlan.value.trim().length > 0 && !isLocked.value
)

// ========== Methods ==========
function selectVisit(visit) {
  if (selectedVisitId.value === visit.id) return

  selectedVisitId.value = visit.id

  // Restore saved plan & emotions for this visit
  const saved = savedPlans.value.get(visit.id)
  if (saved) {
    treatmentPlan.value = saved.plan
    selectedEmotions.value = [...saved.emotionTags]
  } else {
    treatmentPlan.value = ''
    selectedEmotions.value = []
  }

  generalNote.value = ''
  submitError.value = ''
  noteError.value = ''

  // Fetch timeline for this visit
  fetchTimeline()
}

// Track unsaved plan data per visit so switching doesn't lose work
const savedPlans = ref(new Map())

// Auto-save draft when values change (for switching visits)
watch([treatmentPlan, selectedEmotions], () => {
  if (!selectedVisitId.value) return
  if (lockedVisitIds.value.has(selectedVisitId.value)) return
  savedPlans.value.set(selectedVisitId.value, {
    plan: treatmentPlan.value,
    emotionTags: [...selectedEmotions.value],
  })
}, { deep: true })

function toggleEmotion(key) {
  if (isLocked.value) return
  const idx = selectedEmotions.value.indexOf(key)
  if (idx >= 0) {
    selectedEmotions.value.splice(idx, 1)
  } else {
    selectedEmotions.value.push(key)
  }
}

function emotionLabel(key) {
  return emotionMap[key]?.label ?? key
}

function roomName(roomId) {
  if (!roomId) return '未分配'
  const room = visitStore.rooms.find(r => r.id === roomId)
  return room?.name ?? '未知房间'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ========== API Calls ==========
async function fetchTimeline() {
  if (!selectedVisitId.value) return
  loadingTimeline.value = true
  try {
    const res = await send('NOTE_FETCH_TIMELINE', {
      visitId: selectedVisitId.value,
    })
    // Assume response has .notes array or .payload.notes
    const notes = res?.payload?.notes ?? res?.notes ?? []
    timelineEntries.value = notes.map(n => ({
      type: n.type ?? 'general',
      author: n.author ?? n.staff_name ?? '未知',
      role: n.role ?? '',
      time: n.created_at ?? n.time ?? Date.now(),
      content: n.content ?? '',
      plan: n.plan ?? '',
      emotionTags: n.emotionTags ?? n.emotion_tags ?? [],
    }))
  } catch (e) {
    console.error('获取时间线失败:', e)
    timelineEntries.value = []
  } finally {
    loadingTimeline.value = false
  }
}

async function submitTreatmentPlan() {
  if (!selectedVisitId.value || !canSubmit.value) return

  submittingPlan.value = true
  submitError.value = ''

  try {
    await send('NOTE_ADD_TREATMENT_PLAN', {
      visitId: selectedVisitId.value,
      plan: treatmentPlan.value.trim(),
      emotionTags: [...selectedEmotions.value],
    })

    // Lock this visit
    lockedVisitIds.value = new Set([...lockedVisitIds.value, selectedVisitId.value])

    // Clear draft
    savedPlans.value.delete(selectedVisitId.value)

    // Refresh timeline to show the newly added plan
    await fetchTimeline()
  } catch (e) {
    submitError.value = e.message ?? '提交失败，请重试'
  } finally {
    submittingPlan.value = false
  }
}

async function sendGeneralNote() {
  if (!selectedVisitId.value || !generalNote.value.trim()) return

  sendingNote.value = true
  noteError.value = ''

  try {
    await send('NOTE_ADD_GENERAL', {
      visitId: selectedVisitId.value,
      content: generalNote.value.trim(),
    })

    // Clear input
    generalNote.value = ''

    // Refresh timeline
    await fetchTimeline()
  } catch (e) {
    noteError.value = e.message ?? '发送失败，请重试'
  } finally {
    sendingNote.value = false
  }
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
    newVisitError.value = e.message || '创建失败'
  } finally {
    creatingVisit.value = false
  }
}
</script>

<style scoped>
/* ========== Layout ========== */
.assistant-view {
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

.visit-card.locked {
  border-left: 3px solid #2563eb;
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
  flex-wrap: wrap;
  min-width: 0;
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

.locked-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 600;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 1px 6px;
  border-radius: 4px;
}

/* Status Pills */
.status-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
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
  color: var(--text2, #64748b);
  font-size: 13px;
}

.room-icon {
  flex-shrink: 0;
  color: #94a3b8;
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
  padding: 24px 28px;
  overflow-y: auto;
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

/* ========== Lock Banner ========== */
.lock-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 20px;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 8px;
}

.section-badge.locked {
  background: #dbeafe;
  color: #1d4ed8;
}

/* ========== Treatment Plan Textarea ========== */
.plan-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text, #1e293b);
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.plan-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.plan-textarea:disabled {
  background: #f8fafc;
  color: #64748b;
  cursor: not-allowed;
  resize: none;
}

.plan-textarea::placeholder {
  color: #94a3b8;
}

/* ========== Emotion Tags ========== */
.emotion-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.emotion-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: 20px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text2, #64748b);
  transition: all 0.15s ease;
  font-family: inherit;
}

.emotion-pill:hover:not(:disabled) {
  border-color: #93c5fd;
  background: #f0f7ff;
  color: #1d4ed8;
}

.emotion-pill.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}

.emotion-pill.disabled,
.emotion-pill:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Small emotion pills for timeline */
.emotion-pill-sm {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid #bfdbfe;
}

/* ========== Submit Section ========== */
.submit-section {
  padding-top: 4px;
}

/* ========== Refresh Button ========== */
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: var(--text2, #64748b);
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  border-color: #93c5fd;
  color: #2563eb;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ========== Timeline ========== */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

.timeline-item {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 16px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  background: #fff;
  border-radius: 50%;
}

.timeline-line {
  position: absolute;
  left: 13px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: #e2e8f0;
  z-index: 0;
}

.timeline-content {
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
}

.timeline-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.timeline-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

.timeline-role {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}

.timeline-time {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
}

.timeline-body {
  margin: 0;
  font-size: 13px;
  color: var(--text, #1e293b);
  line-height: 1.5;
}

/* Treatment plan entry in timeline */
.timeline-item.is-plan .timeline-content {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
}

.timeline-plan-label {
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.timeline-plan-text {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text, #1e293b);
  line-height: 1.5;
  white-space: pre-wrap;
}

.timeline-emotions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.timeline-empty,
.timeline-loading {
  text-align: center;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 13px;
}

.timeline-empty p,
.timeline-loading p {
  margin: 0;
}

/* ========== Note Input ========== */
.note-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.note-textarea {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text, #1e293b);
  resize: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.note-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.note-textarea::placeholder {
  color: #94a3b8;
}

.btn-send {
  flex-shrink: 0;
  align-self: flex-end;
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
  font-family: inherit;
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

.btn-outline {
  background: #fff;
  color: var(--text, #1e293b);
  border-color: var(--border, #e2e8f0);
}

.btn-outline:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-lg {
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 600;
}

/* ========== Form Error ========== */
.form-error {
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
}

/* ========== Modal ========== */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal-dialog {
  background: #fff; border-radius: 12px; width: 90%; max-width: 420px;
  box-shadow: 0 8px 32px rgba(0,0,0,.15);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
}
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-close {
  background: none; border: none; font-size: 18px; cursor: pointer;
  color: #94a3b8; padding: 4px;
}
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px; border-top: 1px solid #e2e8f0;
}
.required { color: #dc2626; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 4px; }
.form-input {
  width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px;
  font-size: 14px; box-sizing: border-box;
}
.form-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.btn-sm { padding: 6px 14px; font-size: 13px; }
</style>

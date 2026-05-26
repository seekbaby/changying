<template>
  <div class="unified-app">
    <!-- ═══════════ TOP BAR ═══════════ -->
    <header class="topbar">
      <div class="topbar-left" @click="showLogout = !showLogout">
        <span class="topbar-avatar">{{ avatarEmoji }}</span>
        <span class="topbar-name">{{ auth.name }}</span>
        <span class="topbar-role">{{ roleLabel }}</span>
      </div>
      <div class="topbar-center">
        <div class="topbar-stat upper">⏳ 等待 {{ waitingCount }}人</div>
        <div class="topbar-stat lower">👥 在院 {{ activeCount }}人</div>
      </div>
      <div class="topbar-right">
        <button class="btn-dashboard" v-if="canDashboard" @click="$router.push('/dashboard')" title="运营Dashboard">📊</button>
        <button class="btn-admin" v-if="canAdmin" @click="$router.push('/admin')" title="管理面板">⚙</button>
        <button class="btn-inventory" @click="$router.push('/inventory')" title="实时库存">📦</button>
        <button class="btn-customer-history" @click="showCustomerHistory = true" title="顾客历史">📋</button>
        <button v-if="canCreate" class="btn-add" @click="openNewVisit">＋</button>
        <button v-if="showLogout" class="btn-logout" @click="doLogout">退出</button>
      </div>
    </header>

    <!-- ═══════════ VISIT LIST (scrollable) ═══════════ -->
    <main class="visit-list" ref="listRef">
      <div v-if="sortedVisits.length === 0" class="empty-state">
        <div class="empty-icon">🛰️</div>
        <p>暂无在院顾客</p>
      </div>

      <div
        v-for="v in sortedVisits"
        :key="v.id"
        class="visit-item"
        :class="{ selected: selectedId === v.id, expanded: expandedId === v.id, vip: v.is_vip }"
        @click="toggleExpand(v)"
      >
        <!-- Collapsed row: two-line layout for mobile readability -->
        <div class="visit-row">
          <div class="vr-line1">
            <div class="vr-name">
              <span v-if="v.is_vip" class="vip-dot">★</span>
              {{ v.guest_name }}
            </div>
            <span class="vr-status" :class="statusClass(v.current_status)">
              {{ statusLabel(v.current_status) }}
            </span>
            <span class="vr-timer">{{ timerDisplay(v) }}</span>
          </div>
          <div class="vr-line2">
            <span class="vr-room">{{ roomName(v.current_room_id) }}</span>
            <span class="vr-nurse">{{ v.nurse_name || '--' }}</span>
            <span v-if="v.current_doctor_name" class="vr-doctor">👨‍⚕️{{ v.current_doctor_name }}</span>
            <button class="vr-photo-btn" @click.stop="openPhotoModule(v)">📱照</button>
            <button class="vr-consult-btn" disabled title="面诊记录（即将开放）">🎙</button>
          </div>
        </div>

        <!-- Expanded: Notes + Status change -->
        <div v-if="expandedId === v.id" class="visit-detail" @click.stop>
          <!-- Notes timeline -->
          <div class="detail-notes">
            <div v-if="notes[v.id]?.length" class="notes-list">
              <div v-for="n in notes[v.id]" :key="n.id" class="note-item">
                <span class="note-author">{{ n.author_name || '系统' }}</span>
                <span class="note-time">{{ fmtTime(n.created_at) }}</span>
                <p class="note-content">{{ noteContent(n) }}</p>
              </div>
            </div>
            <p v-else class="notes-empty">暂无备注</p>
          </div>

          <!-- Add note (all roles) -->
          <div class="detail-add-note">
            <input v-model="noteInput[v.id]" class="note-input" placeholder="添加备注..." 
              @keyup.enter="addNote(v.id)" />
            <button class="btn-note-send" @click="addNote(v.id)" :disabled="!noteInput[v.id]?.trim()">发送</button>
          </div>

          <!-- Treatment plan input (assistant only, for CONSULTATION exit) -->
          <div v-if="auth.role === 'assistant' && v.current_status === 'CONSULTATION'" class="detail-treatment">
            <div class="dt-label">💉 治疗方案（面诊结束前必须录入）</div>
            <textarea v-model="treatmentPlan[v.id]" class="dt-textarea" 
              placeholder="录入治疗方案内容..." rows="3"></textarea>
            <button class="btn-treatment-save" @click="saveTreatmentPlan(v.id)" 
              :disabled="!treatmentPlan[v.id]?.trim()">
              保存方案
            </button>
            <p v-if="treatmentPlanSaved[v.id]" class="dt-saved">✅ 方案已保存，可以推进状态</p>
          </div>

          <!-- Current status info -- removed per user request; status shown in dropdown below -->

          <!-- Status change -->
          <div v-if="canAdvance && v.current_status !== 'DISCHARGED'" class="detail-advance">
            <span class="detail-section-label">🔄 状态变更</span>
            <div class="da-controls">
              <select v-model="advanceTarget[v.id]" class="advance-select">
                <option v-for="s in allStatuses()" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
              <span class="advance-time">⏱ {{ fmtTime(v.status_entered_at) }}</span>
              <button class="btn-advance" @click="doAdvance(v.id)"
                :disabled="advanceTarget[v.id] === v.current_status">
                确认
              </button>
            </div>
          </div>

          <!-- ★ v2.5: 治疗医生（独立于状态推进，任何状态下都可选） -->
          <div class="detail-doctor">
            <span class="detail-section-label">👨‍⚕️ 治疗医生</span>
            <div class="da-controls">
              <select v-model="doctorTarget[v.id]" class="doctor-select">
                <option :value="null">无</option>
                <option v-for="d in doctorList" :key="d.id" :value="d.id">{{ d.name }}{{ d.department ? '·'+d.department : '' }}</option>
              </select>
              <button class="btn-doctor-save" @click="doSetDoctor(v.id)">保存</button>
              <span v-if="v.current_doctor_name" class="dd-current">当前：{{ v.current_doctor_name }}</span>
            </div>
          </div>

          <!-- ★ v3.0: 耗材开单锁货（仅医助/主管） -->
          <div v-if="canLockInventory" class="detail-inventory">
            <span class="detail-section-label">📦 耗材开单</span>
            <div class="inv-lock-row">
              <select v-model="invForm[v.id].itemId" class="advance-select" style="flex:2">
                <option :value="null" disabled>选择耗材</option>
                <option v-for="item in inventoryList" :key="item.id" :value="item.id">
                  {{ item.name }}（可用:{{ item.available }}）
                </option>
              </select>
              <input v-model.number="invForm[v.id].qty" class="form-input" type="number" placeholder="数量" style="width:60px" min="1" />
              <button class="btn-doctor-save" @click="doLockItem(v.id)" :disabled="!invForm[v.id].itemId || !invForm[v.id].qty || invForm[v.id].qty <= 0">锁货</button>
            </div>
          </div>

          <!-- ★ v3.0: 耗材明细 + 核销（全员可见） -->
          <div v-if="visitInventory[v.id]?.length" class="detail-inventory">
            <span class="detail-section-label">📦 已锁耗材</span>

            <!-- 护士核销 -->
            <div v-if="auth.role === 'nurse'" class="inv-verify-area">
              <div class="detail-section-label">🔍 核销确认</div>
              <div v-for="row in visitInventory[v.id]" :key="'vfy-'+row.id" class="inv-locked-row">
                <span class="ilr-name">{{ row.item_name }}</span>
                <span class="ilr-qty">开{{ row.qty_ordered }} / 核{{ row.qty_verified || 0 }}</span>
                <input v-model.number="verifyQtys[v.id][row.id]" class="form-input" type="number" placeholder="实操" style="width:60px" min="0" />
                <button class="btn-doctor-save" @click="doVerify(v.id, row.id)" :disabled="!verifyQtys[v.id][row.id] || verifyQtys[v.id][row.id] <= 0">核</button>
              </div>
            </div>

            <div class="inv-locked-list">
              <div v-for="row in visitInventory[v.id]" :key="row.id" class="inv-locked-row" :class="{ 'inv-pending': row.pending > 0 }">
                <span class="ilr-name">{{ row.item_name }}</span>
                <span class="ilr-qty">开{{ row.qty_ordered }} / 核{{ row.qty_verified || 0 }}</span>
                <span v-if="row.pending > 0" class="ilr-pending">差{{ row.pending }}</span>
                <span v-else class="ilr-done">✅</span>
              </div>
            </div>
          </div>

          <!-- Room change -->
          <div v-if="canAdvance" class="detail-room-change">
            <span class="detail-section-label">🏠 所在位置</span>
            <div class="da-controls">
              <select v-model="roomTarget[v.id]" class="advance-select" @change="doRoomChange(v.id)">
                <option :value="null" disabled>变更区域...</option>
                <option v-for="r in allRooms" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <label v-if="auth.role === 'manager'" class="force-label">
                <input type="checkbox" v-model="forceRoom[v.id]" /> 强制
              </label>
            </div>
          </div>

          <!-- Handover -->
          <div v-if="canHandover" class="detail-handover">
            <span class="detail-section-label">👤 交接他人</span>
            <div class="da-controls">
              <select v-model="handoverTarget[v.id]" class="handover-select">
                <option :value="null" disabled>选择人员...</option>
                <option v-for="s in handoverList" :key="s.id" :value="s.id">{{ s.name }} ({{ roleLabelMap[s.role] }})</option>
              </select>
              <button class="btn-handover" @click="doHandover(v.id)" :disabled="!handoverTarget[v.id]">交接</button>
            </div>
          </div>

          <!-- Past states -->
          <div class="detail-history">
            <div class="dh-title">已经过状态</div>
            <div class="dh-path">{{ statusHistory[v.id]?.join(' → ') || '—' }}</div>
          </div>
        </div>
      </div>
    </main>

    <!-- ═══════════ BOTTOM BAR: Active Rooms ═══════════ -->
    <footer class="bottombar">
      <div class="room-scroll" ref="roomScrollRef">
        <div
          v-for="r in activeRooms"
          :key="r.id"
          class="room-pill"
          :class="{ active: roomOverlayId === r.id, full: r.occupied >= r.capacity }"
          @click="toggleRoomOverlay(r.id)"
        >
          <span class="rp-name">{{ r.name }}</span>
          <span class="rp-timer" v-if="r.primaryVisit">{{ roomTimerDisplay(r) }}</span>
          <span class="rp-count">{{ r.occupied }}/{{ r.capacity }}</span>
        </div>
        <div v-if="activeRooms.length === 0" class="room-empty">暂无活跃房间</div>
      </div>

      <!-- Room timer overlay -->
      <div v-if="roomOverlayId" class="room-overlay" @click="roomOverlayId = null">
        <div class="room-overlay-card">
          <div class="roc-header">{{ roomName(roomOverlayId) }}</div>
          <div class="roc-timer">{{ roomTimerBig }}</div>
          <div class="roc-visitors">
            <div v-for="v in roomVisitors(roomOverlayId)" :key="v.id" class="roc-visitor">
              {{ v.guest_name }} · {{ statusLabel(v.current_status) }}
            </div>
          </div>
        </div>
      </div>
    </footer>

    <!-- ═══════════ New Visit Modal ═══════════ -->
    <Teleport to="body">
      <div v-if="showNewVisitModal" class="modal-overlay" @click.self="showNewVisitModal = false">
        <div class="modal-dialog">
          <div class="modal-header"><h3>新增顾客</h3><button class="modal-close" @click="showNewVisitModal = false">✕</button></div>
          <div class="modal-body">
            <div class="form-group">
              <label>姓名 <span class="req">*</span></label>
              <input v-model="nvForm.guestName" class="form-input" placeholder="顾客姓名" />
            </div>
            <div class="form-group">
              <label>当前状态</label>
              <select v-model="nvForm.toStatus" class="form-input">
                <option v-for="s in allStatuses()" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>所在区域</label>
              <select v-model="nvForm.roomId" class="form-input">
                <option :value="null">等候区（默认）</option>
                <option v-for="r in allRooms.filter(r => r.id !== 8)" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label v-if="auth.role === 'manager' || auth.role === 'reception'">接诊护士 <span class="req">*</span></label>
              <label v-else>接诊护士</label>
              <select v-if="auth.role === 'manager' || auth.role === 'reception'" v-model="nvForm.nurseId" class="form-input">
                <option :value="null" disabled>选择护士</option>
                <option v-for="n in nurseList" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
              <span v-else class="form-static">{{ auth.name }}</span>
            </div>
            <p v-if="nvError" class="form-error">{{ nvError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showNewVisitModal = false">取消</button>
            <button class="btn btn-primary" :disabled="!canSubmitNewVisit || creatingVisit" @click="createVisit">
              {{ creatingVisit ? '创建中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 手机照模块 -->
    <PhotoModule
      v-if="showPhotoModule && photoVisit"
      :visit-id="photoVisit.id"
      :guest-name="photoVisit.name"
      @close="showPhotoModule = false"
    />

    <!-- 顾客历史+照片对比 -->
    <CustomerHistory
      v-if="showCustomerHistory"
      @close="showCustomerHistory = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import { useVisitStore } from '../stores/useVisitStore'
import { useWebSocket } from '../composables/useWebSocket'
import PhotoModule from './PhotoModule.vue'
import CustomerHistory from './CustomerHistory.vue'

const router = useRouter()
const auth = useAuthStore()
const visitStore = useVisitStore()
const { send, connected } = useWebSocket()

// ══════ Role labels ══════
const roleLabelMap = { doctor:'医生', nurse:'护士', manager:'主管', assistant:'医助', reception:'前台', admin:'管理员' }
const roleLabel = computed(() => roleLabelMap[auth.role] || auth.role)
const avatarEmoji = computed(() => {
  const map = { doctor:'🩻', nurse:'🩺', manager:'📋', assistant:'💊', reception:'🏷️', admin:'⚙️' }
  return map[auth.role] || '👤'
})
const canCreate = computed(() => ['reception','nurse','manager','admin'].includes(auth.role))
const canAdvance = computed(() => ['reception','nurse','assistant','manager','admin'].includes(auth.role))
const canHandover = computed(() => ['nurse','assistant','manager','admin'].includes(auth.role))
const canDashboard = computed(() => ['admin','manager'].includes(auth.role))  // v3.0
const canAdmin = computed(() => ['admin','manager'].includes(auth.role))  // v3.0: 管理员+主管可进管理后台
const canLockInventory = computed(() => ['assistant','manager'].includes(auth.role))  // v3.0
const showPhotoModule = ref(false)
const showCustomerHistory = ref(false)
const photoVisit = ref(null)

function openPhotoModule(v) {
  photoVisit.value = { id: v.id, name: v.guest_name }
  showPhotoModule.value = true
}

// ══════ Status constants ══════
const STATUS_MAP = {
  ARRIVED_WAITING:'到院等待', DETECTION_PHOTO:'检测拍照', IN_CLINIC_WAITING:'院内等待',
  CONSULTATION:'面诊', PRE_TREATMENT_CARE:'术前护理', NUMBING:'敷麻',
  PRE_OP_WAITING:'术前等待', IN_OPERATION:'术中', POST_TREATMENT_CARE:'术后护理',
  DINING:'用餐', DISCHARGED:'已离院'
}
const STATUS_COLORS = {
  ARRIVED_WAITING:'gray', DETECTION_PHOTO:'blue', IN_CLINIC_WAITING:'gray',
  CONSULTATION:'blue', PRE_TREATMENT_CARE:'purple', NUMBING:'orange',
  PRE_OP_WAITING:'yellow', IN_OPERATION:'red', POST_TREATMENT_CARE:'purple',
  DINING:'green', DISCHARGED:'gray'
}
const ROOM_ORDER = ['1诊室','2诊室','激光室','注射室','敷麻区','休息区A','休息区B','用餐区','等候区']

function statusLabel(k) { return STATUS_MAP[k] || k }
function statusClass(k) { return 'st-' + (STATUS_COLORS[k] || 'gray') }

// ══════ Timer ══════
const now = ref(Date.now())
let timerInterval = null
onMounted(() => {
  timerInterval = setInterval(() => now.value = Date.now(), 1000)
  // ★ v3.0: 等 WS 连接就绪后预取库存数据，避免展开详情时下拉为空
  const invCheck = setInterval(() => {
    if (connected.value) { clearInterval(invCheck); fetchInventory() }
  }, 200)
})

// ★ v2.5: 医生列表
const doctorList = ref([])
const doctorTarget = reactive({})
let doctorFetched = false

// ★ v3.0: 耗材
const inventoryList = ref([])
const invForm = reactive({})  // { [visitId]: { itemId, qty } }
const visitInventory = reactive({})  // { [visitId]: [rows] }
let inventoryFetched = false

// ★ v3.0: 护士核销
const verifyQtys = reactive({})  // { [visitId]: { [rowId]: qty } }

async function fetchDoctorList() {
  try {
    const result = await send('DOCTOR_LIST', {})
    if (result.success) {
      doctorList.value = result.payload.doctors || []
      doctorFetched = true
    }
  } catch(e) { console.warn('[DocList] fetch failed:', e.message) }
}
onUnmounted(() => { clearInterval(timerInterval) })

function isOverdue(v) {
  return false  // 统一正计时，无超时概念
}

function timerDisplay(v) {
  if (!v.status_entered_at) return '--'
  // 统一正计时：当前状态累计时长
  const elapsed = Math.floor((now.value - v.status_entered_at) / 1000)
  const m = Math.floor(elapsed / 60), s = elapsed % 60
  return `${m}:${String(s).padStart(2,'0')}`
}

function roomName(roomId) {
  const r = visitStore.rooms.find(r => r.id === roomId)
  return r ? r.name : '--'
}

// ══════ Computed visits ══════
const sortedVisits = computed(() => {
  const list = visitStore.visits.filter(v => !v.closed_at)
  const order = Object.keys(STATUS_MAP)
  return [...list].sort((a,b) => order.indexOf(a.current_status) - order.indexOf(b.current_status))
})

const activeCount = computed(() =>
  visitStore.visits.filter(v => !v.closed_at).length
)

const waitingCount = computed(() =>
  visitStore.visits.filter(v => 
    !v.closed_at && ['ARRIVED_WAITING','IN_CLINIC_WAITING','PRE_OP_WAITING'].includes(v.current_status)
  ).length
)

// ══════ Expand / Notes ══════
const expandedId = ref(null)
const selectedId = ref(null)
const notes = reactive({})
const noteInput = reactive({})
const advanceTarget = reactive({})
const roomTarget = reactive({})
const handoverTarget = reactive({})
const forceRoom = reactive({})
const allRooms = computed(() => visitStore.rooms || [])
const handoverList = ref([])
const statusHistory = reactive({})
const treatmentPlan = reactive({})
const treatmentPlanSaved = reactive({})

function toggleExpand(v) {
  if (expandedId.value === v.id) {
    expandedId.value = null
    selectedId.value = null
  } else {
    expandedId.value = v.id
    selectedId.value = v.id
    if (!notes[v.id]) fetchNotes(v.id)
    if (!noteInput[v.id]) noteInput[v.id] = ''
    // 初始化房间选择为当前房间、状态选择为当前状态（每次展开都刷）
    roomTarget[v.id] = v.current_room_id
    advanceTarget[v.id] = v.current_status
    doctorTarget[v.id] = v.current_doctor_id || null  // ★ v2.5: 初始化医生下拉
    // 确保医生列表已加载
    if (!doctorFetched) fetchDoctorList()
    // ★ v3.0: 加载耗材列表（全员都需要看到已锁耗材状态）
    if (!inventoryFetched) fetchInventory()
    // ★ 初始化耗材表单（否则模板访问 invForm[v.id].itemId 时 undefined 崩溃白屏）
    if (canLockInventory.value && !invForm[v.id]) invForm[v.id] = { itemId: null, qty: '' }
    if (!visitInventory[v.id]) fetchVisitInventory(v.id)
    // ★ 护士核销: 初始化 verifyQtys 嵌套对象
    if (auth.role === 'nurse' && !verifyQtys[v.id]) verifyQtys[v.id] = {}
    // 加载交接列表和状态历史
    if (handoverList.value.length === 0) fetchStaffList()
    if (!statusHistory[v.id]) fetchHistory(v.id)
  }
}

async function fetchNotes(visitId) {
  try {
    const res = await send('NOTE_FETCH_TIMELINE', { visitId })
    if (res.success && res.payload?.timeline) {
      notes[visitId] = res.payload.timeline
    }
  } catch(e) { /* ignore */ }
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
}

function noteContent(n) {
  if (n.note_type === 'treatment_plan' || n.note_type === 'emotion_tag') {
    try { const o = JSON.parse(n.content); return typeof o === 'object' ? (o.treatment || o.join?.(', ') || n.content) : n.content }
    catch { return n.content }
  }
  return n.content
}

async function addNote(visitId) {
  const txt = (noteInput[visitId] || '').trim()
  if (!txt) return
  try {
    await send('NOTE_ADD_GENERAL', { visitId, content: txt })
    noteInput[visitId] = ''
    await fetchNotes(visitId)
  } catch(e) { /* ignore */ }
}

// ══════ Status change ══════
function allStatuses() {
  return Object.keys(STATUS_MAP)
}

async function doRoomChange(visitId) {
  const to = roomTarget[visitId]
  if (!to) return
  try {
    const result = await send('VISIT_ROOM_CHANGE', { 
      visitId, newRoomId: to,
      forceByManager: forceRoom[visitId] || false
    })
    if (!result.success) {
      alert(result.error || '变更房间失败')
      // 回退到当前房间
      const v = visitStore.visits.find(v => v.id === visitId)
      if (v) roomTarget[visitId] = v.current_room_id
      return
    }
    // 同步到新房间ID
    roomTarget[visitId] = to
  } catch(e) {
    alert(e.message || '变更房间失败')
    // 回退到当前房间
    const v = visitStore.visits.find(v => v.id === visitId)
    if (v) roomTarget[visitId] = v.current_room_id
  }
}

async function doAdvance(visitId) {
  const to = advanceTarget[visitId]
  if (!to) return
  try {
    // 离院需要确认 + ★ v3.0 平账检查
    if (to === 'DISCHARGED') {
      // 检查耗材账是否平
      try {
        const bal = await send('INVENTORY_BALANCE', { visitId })
        if (bal.success && !bal.payload.balanced) {
          const items = bal.payload.unsettled || []
          const msg = items.map(i => `${i.itemName}：开${i.ordered} 核${i.verified}（差${i.diff}）`).join('\n')
          alert('账不平，无法离院！\n\n' + msg + '\n\n请先完成耗材核销。')
          return
        }
      } catch(e) { /* 检查失败仍允许离院 */ }
      if (!confirm('确认离院？')) return
      await send('VISIT_DISCHARGE', { visitId })
      advanceTarget[visitId] = null
      expandedId.value = null
      return
    }
    const result = await send('VISIT_STATUS_ADVANCE', { 
      visitId, toStatus: to,
      expectedDurationMin: null
    })
    if (!result.success) {
      alert(result.error || '状态变更失败')
      return
    }
    advanceTarget[visitId] = null
    expandedId.value = null
  } catch(e) {
    alert(e.message || '状态变更失败')
  }
}

// ★ v2.5: 独立设置/切换治疗医生
async function doSetDoctor(visitId) {
  const doctorId = doctorTarget[visitId]
  try {
    const result = await send('VISIT_SET_DOCTOR', { visitId, doctorId })
    if (!result.success) alert(result.error || '设置医生失败')
  } catch(e) { alert(e.message || '设置医生失败') }
}

// ★ v3.0: 耗材开单
async function fetchInventory() {
  try {
    const res = await send('INVENTORY_LIST', {})
    if (res.success) inventoryList.value = res.payload.items || []
    inventoryFetched = true
  } catch(e) { console.warn('[Inv] load fail:', e.message) }
}

async function fetchVisitInventory(visitId) {
  try {
    const res = await send('INVENTORY_VISIT', { visitId })
    if (res.success) visitInventory[visitId] = res.payload.rows || []
  } catch(e) { console.warn('[Inv] visit load fail:', e.message) }
}

async function doLockItem(visitId) {
  const f = invForm[visitId]
  if (!f || !f.itemId || !f.qty || f.qty <= 0) return
  try {
    const res = await send('INVENTORY_LOCK', { visitId, items: [{ itemId: f.itemId, qty: f.qty, source: 'pre_op' }] })
    if (res.success) {
      invForm[visitId] = { itemId: null, qty: '' }
      await fetchVisitInventory(visitId)
      await fetchInventory()  // 刷新可用库存
    } else alert(res.error || '锁货失败')
  } catch(e) { alert(e.message || '锁货失败') }
}

// ★ v3.0: 护士核销
async function doVerify(visitId, rowId) {
  const qty = (verifyQtys[visitId] || {})[rowId]
  if (!qty || qty <= 0) return
  try {
    const res = await send('INVENTORY_VERIFY', { visitId, items: [{ rowId, verifiedQty: qty }] })
    if (res.success) {
      verifyQtys[visitId][rowId] = 0
      await fetchVisitInventory(visitId)
      await fetchInventory()
    } else alert(res.error || '核销失败')
  } catch(e) { alert(e.message || '核销失败') }
}

async function fetchStaffList() {
  try {
    const result = await send('STAFF_LIST', {})
    if (result.success) handoverList.value = result.payload.staff || []
  } catch(e) { /* ignore */ }
}

async function fetchHistory(visitId) {
  try {
    const result = await send('NOTE_FETCH_HISTORY', { visitId })
    if (result.success) statusHistory[visitId] = result.payload.history || []
  } catch(e) { /* ignore */ }
}

async function doHandover(visitId) {
  const to = handoverTarget[visitId]
  if (!to) return
  try {
    const result = await send('VISIT_HANDOVER', { visitId, toNurseId: to })
    if (!result.success) {
      alert(result.error || '交接失败')
      return
    }
    handoverTarget[visitId] = null
  } catch(e) {
    alert(e.message || '交接失败')
  }
}

async function saveTreatmentPlan(visitId) {
  const plan = (treatmentPlan[visitId] || '').trim()
  if (!plan) return
  try {
    const result = await send('NOTE_ADD_TREATMENT_PLAN', { visitId, plan })
    if (result.success) {
      treatmentPlanSaved[visitId] = true
    } else {
      alert(result.error || '保存失败')
    }
  } catch(e) {
    alert(e.message || '保存失败')
  }
}

// ══════ New Visit ══════
const showNewVisitModal = ref(false)
const nvForm = ref({ guestName:'', toStatus:'ARRIVED_WAITING', nurseId:null, roomId:null })
const creatingVisit = ref(false)
const nvError = ref('')
const nurseList = ref([])

const canSubmitNewVisit = computed(() => {
  if (!nvForm.value.guestName.trim()) return false
  if ((auth.role === 'manager' || auth.role === 'reception') && !nvForm.value.nurseId) return false
  return true
})

async function openNewVisit() {
  nvForm.value = { guestName:'', toStatus:'ARRIVED_WAITING', nurseId:null, roomId:null }
  nvError.value = ''
  showNewVisitModal.value = true
  if (auth.role === 'manager' || auth.role === 'reception') await loadNurseList()
}

async function loadNurseList() {
  try {
    const res = await fetch('/api/staff')
    const data = await res.json()
    nurseList.value = (Array.isArray(data) ? data : [])
      .filter(s => s.role === 'nurse' || s.role === 'assistant' || s.role === 'manager')
  } catch(e) { /* ignore */ }
}

async function createVisit() {
  if (!canSubmitNewVisit.value) return
  creatingVisit.value = true
  nvError.value = ''
  try {
    const nurseId = (auth.role === 'manager' || auth.role === 'reception') ? nvForm.value.nurseId : auth.staff?.id
    const result = await send('VISIT_CREATE', {
      guestName: nvForm.value.guestName.trim(),
      assignedNurseId: nurseId,
      toStatus: nvForm.value.toStatus,
      roomId: nvForm.value.roomId,
    })
    // ★ 房间已由后端 create() 直接设置，无需再发 VISIT_ROOM_CHANGE
    if (!result.success) {
      nvError.value = result.error || '创建失败'
      return
    }
    showNewVisitModal.value = false
  } catch(e) {
    nvError.value = e.message || '创建失败'
  } finally {
    creatingVisit.value = false
  }
}

// ══════ Bottom Bar: Active Rooms ══════
const roomOverlayId = ref(null)

const activeRooms = computed(() => {
  // 占用房间排在前面，空房间在后；同状态按 ROOM_ORDER 排序
  return visitStore.rooms
    .filter(r => r.is_active !== 0)
    .map(r => {
      const count = visitStore.visits.filter(v => v.current_room_id === r.id && !v.closed_at).length
      return { ...r, occupied: count }
    })
    .sort((a, b) => {
      // 占用房间优先
      if (a.occupied > 0 && b.occupied === 0) return -1
      if (b.occupied > 0 && a.occupied === 0) return 1
      // 同为占用或同为空 → 按 ROOM_ORDER
      return ROOM_ORDER.indexOf(a.name) - ROOM_ORDER.indexOf(b.name)
    })
})

function roomTimerDisplay(r) {
  const v = visitStore.visits.find(v => v.current_room_id === r.id && !v.closed_at)
  if (!v || !v.status_entered_at) return ''
  const elapsed = Math.floor((now.value - v.status_entered_at) / 1000)
  const m = Math.floor(elapsed / 60), s = elapsed % 60
  return `${m}:${String(s).padStart(2,'0')}`
}

const roomTimerBig = computed(() => {
  if (!roomOverlayId.value) return ''
  const v = visitStore.visits.find(v => v.current_room_id === roomOverlayId.value && !v.closed_at)
  if (!v) return ''
  return timerDisplay(v)
})

function roomVisitors(roomId) {
  return visitStore.visits.filter(v => v.current_room_id === roomId && !v.closed_at)
}

function toggleRoomOverlay(roomId) {
  roomOverlayId.value = roomOverlayId.value === roomId ? null : roomId
}

// ══════ Logout ══════
const showLogout = ref(false)
function doLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
/* ══════ Layout ══════ */
.unified-app {
  display: flex; flex-direction: column; height: 100vh; height: 100dvh;
  background: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
/* ══════ TOP BAR ══════ */
.topbar {
  display: flex; align-items: center; padding: 8px 12px;
  background: #fff; border-bottom: 1px solid #e5e7eb; gap: 10px; flex-shrink: 0;
}
.topbar-left {
  display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0;
}
.topbar-avatar { font-size: 24px; }
.topbar-name { font-weight: 600; font-size: 14px; white-space: nowrap; }
.topbar-role { font-size: 11px; color: #94a3b8; background: #f1f5f9; padding: 1px 8px; border-radius: 10px; }
.topbar-center { display: flex; flex-direction: column; align-items: center; flex: 1; }
.topbar-stat { font-size: 12px; }
.topbar-stat.upper { color: #f59e0b; font-weight: 600; }
.topbar-stat.lower { color: #64748b; }
.topbar-right { display: flex; align-items: center; gap: 6px; }
.btn-add {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #2563eb; color: #fff; font-size: 22px; font-weight: 300;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.btn-logout {
  font-size: 11px; padding: 4px 10px; border: 1px solid #e5e7eb; background: #fff;
  border-radius: 6px; color: #ef4444; cursor: pointer;
}
.btn-customer-history {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #1e293b; color: #e0e0e0; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.btn-dashboard {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #7c3aed; color: #fff; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.btn-admin {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #475569; color: #fff; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.btn-inventory {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #0ea5e9; color: #fff; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

/* ══════ VISIT LIST ══════ */
.visit-list {
  flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px;
}
.visit-item {
  background: #fff; border-radius: 10px; padding: 10px 12px;
  border: 1px solid #e5e7eb; cursor: pointer; transition: all .15s;
}
.visit-item.selected { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.15); }
.visit-item.vip { border-left: 3px solid #f59e0b; }
.visit-item.expanded { border-color: #2563eb; }
.visit-row {
  display: flex; flex-direction: column; gap: 4px;
}
.vr-line1 {
  display: flex; align-items: center; gap: 8px;
}
.vr-line2 {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b;
}
.vr-name { font-weight: 600; font-size: 16px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vip-dot { color: #f59e0b; margin-right: 2px; }
.vr-status { font-size: 12px; padding: 3px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.vr-timer { font-family: monospace; font-size: 15px; color: #16a34a; white-space: nowrap; flex-shrink: 0; }
.vr-timer.overdue { color: #dc2626; animation: pulse 1s infinite; }
.vr-room { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.vr-room::before { content: '📍'; margin-right: 1px; font-size: 10px; }
.vr-nurse { font-size: 11px; color: #64748b; white-space: nowrap; }
.vr-nurse::before { content: '👤'; margin-right: 1px; font-size: 10px; }
.vr-doctor { font-size: 11px; color: #0ea5e9; white-space: nowrap; font-weight: 500; }

/* ★ v2.5: 治疗医生（独立区域） */
.detail-doctor {
  display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #f8fafc; border-radius: 8px;
}
.dd-current { font-size: 12px; color: #94a3b8; }
.doctor-select {
  padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  background: #fff; color: #1e293b; font-size: 14px; min-width: 120px; flex: 1;
}
.btn-doctor-save {
  padding: 10px 14px; border: none; border-radius: 8px;
  background: #2563eb; color: #fff; font-size: 14px; cursor: pointer; font-weight: 600;
  flex-shrink: 0;
}
.da-controls {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.vr-photo-btn {
  background: #2563eb; border: none; color: #fff;
  font-size: 11px; cursor: pointer;
  padding: 3px 8px; border-radius: 6px; line-height: 1;
  flex-shrink: 0; white-space: nowrap; font-weight: 500;
  margin-left: auto;
}
.vr-photo-btn:hover { background: #1d4ed8; }
.vr-consult-btn {
  background: #64748b; border: none; color: #cbd5e1;
  font-size: 11px; padding: 3px 8px; border-radius: 6px; line-height: 1;
  flex-shrink: 0; white-space: nowrap; font-weight: 500;
  cursor: not-allowed; opacity: 0.5;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

/* ★ v3.0: 耗材开单 */
.detail-inventory { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #fefce8; border-radius: 8px; }
.inv-lock-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.inv-locked-list { display: flex; flex-direction: column; gap: 4px; }
.inv-locked-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #fff; border-radius: 6px; font-size: 13px; }
.inv-locked-row.inv-pending { border-left: 3px solid #f59e0b; }
.ilr-name { font-weight: 600; color: #334155; }
.ilr-qty { color: #64748b; font-family: monospace; }
.ilr-pending { color: #d97706; font-weight: 600; font-size: 12px; }
.ilr-done { color: #16a34a; }

/* ══════ Status colors ══════ */
.st-gray { background:#f1f5f9; color:#475569; }
.st-blue { background:#dbeafe; color:#1d4ed8; }
.st-purple { background:#f3e8ff; color:#7e22ce; }
.st-orange { background:#fff7ed; color:#c2410c; }
.st-yellow { background:#fefce8; color:#854d0e; }
.st-red { background:#fee2e2; color:#991b1b; }
.st-green { background:#dcfce7; color:#166534; }

/* ══════ Expanded detail ══════ */
.visit-detail {
  margin-top: 12px; padding-top: 12px; border-top: 2px solid #e5e7eb;
  display: flex; flex-direction: column; gap: 14px;
}
.detail-notes { max-height: 180px; overflow-y: auto; background: #f8fafc; border-radius: 8px; padding: 8px; }
.notes-list { display: flex; flex-direction: column; gap: 8px; }
.note-item { font-size: 13px; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #f1f5f9; }
.note-author { font-weight: 600; color: #2563eb; margin-right: 6px; }
.note-time { color: #94a3b8; font-size: 11px; }
.note-content { margin-top: 4px; color: #334155; line-height: 1.5; }
.notes-empty { font-size: 13px; color: #94a3b8; text-align: center; padding: 16px; }
.detail-add-note { display: flex; gap: 8px; }
.note-input { flex: 1; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; }
.btn-note-send {
  padding: 10px 16px; border: none; border-radius: 8px; background: #2563eb;
  color: #fff; font-size: 14px; cursor: pointer;
}
.btn-note-send:disabled { opacity: .5; cursor: not-allowed; }

/* Section labels */
.detail-section-label {
  font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 4px;
  display: flex; align-items: center; gap: 4px;
}

.detail-advance { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #f0fdf4; border-radius: 8px; }
.advance-time { font-size: 12px; color: #64748b; white-space: nowrap; font-family: monospace; flex-shrink: 0; }
.advance-select { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff; min-width: 0; }
.btn-advance {
  padding: 10px 16px; border: none; border-radius: 8px; background: #16a34a;
  color: #fff; font-size: 14px; cursor: pointer; font-weight: 600; flex-shrink: 0;
}
.btn-advance:disabled { opacity: .4; }

.detail-room-change { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #eff6ff; border-radius: 8px; }
.detail-handover { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #fff7ed; border-radius: 8px; }
.handover-select { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff; }
.btn-handover {
  padding: 10px 14px; border: none; border-radius: 8px; background: #f59e0b;
  color: #fff; font-size: 14px; cursor: pointer; font-weight: 600;
}
.btn-handover:disabled { opacity: .5; }
.force-label { font-size: 12px; color: #dc2626; display: flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer; font-weight: 500; }
.force-label input { cursor: pointer; width: 16px; height: 16px; }

/* Treatment plan */
.detail-treatment { margin: 8px 0; padding: 10px; background: #fef3c7; border-radius: 8px; }
.dt-label { font-size: 12px; font-weight: 600; color: #92400e; margin-bottom: 6px; }
.dt-textarea { width: 100%; padding: 8px; border: 1px solid #fcd34d; border-radius: 6px; font-size: 13px; resize: vertical; box-sizing: border-box; }
.btn-treatment-save {
  margin-top: 6px; padding: 6px 14px; border: none; border-radius: 6px;
  background: #d97706; color: #fff; font-size: 13px; cursor: pointer;
}
.btn-treatment-save:disabled { opacity: .5; }
.dt-saved { font-size: 12px; color: #16a34a; margin-top: 4px; }
.duration-input {
  width: 56px; padding: 8px 6px; border: 1px solid #e5e7eb; border-radius: 8px;
  font-size: 13px; text-align: center;
}
.duration-input::placeholder { color: #9ca3af; font-size: 11px; }

.detail-history { margin: 4px 0; padding: 10px; background: #f0fdf4; border-radius: 8px; }
.dh-title { font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 4px; }
.dh-path { font-size: 13px; color: #16a34a; line-height: 1.5; }

/* ══════ BOTTOM BAR ══════ */
.bottombar {
  background: #fff; border-top: 1px solid #e5e7eb; padding: 8px 12px;
  flex-shrink: 0; position: relative;
}
.room-scroll {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.room-pill {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 20px; background: #f1f5f9;
  border: 1px solid #e5e7eb; cursor: pointer; font-size: 13px; white-space: nowrap;
  min-width: 0; transition: all .15s;
}
.room-pill.active { background: #dbeafe; border-color: #2563eb; }
.room-pill.full { border-color: #fca5a5; }
.rp-name { font-weight: 600; }
.rp-timer { font-family: monospace; font-size: 13px; color: #16a34a; }
.room-pill.full .rp-timer { color: #dc2626; }
.rp-count { font-size: 11px; color: #94a3b8; }
.room-empty { font-size: 12px; color: #94a3b8; padding: 4px; }

/* Room overlay */
.room-overlay {
  position: absolute; bottom: 100%; left: 0; right: 0;
  background: rgba(0,0,0,.3); display: flex; justify-content: center;
  padding: 12px;
}
.room-overlay-card {
  background: #fff; border-radius: 12px; padding: 16px 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,.15); text-align: center; max-width: 280px; width: 100%;
}
.roc-header { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.roc-timer { font-family: monospace; font-size: 28px; font-weight: 700; color: #16a34a; margin-bottom: 8px; }
.roc-visitors { font-size: 12px; color: #64748b; }
.roc-visitor { padding: 2px 0; }

/* ══════ Modal ══════ */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:999; display:flex; align-items:center; justify-content:center; }
.modal-dialog { background:#fff; border-radius:12px; width:90%; max-width:380px; box-shadow:0 8px 32px rgba(0,0,0,.15); }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #e5e7eb; }
.modal-header h3 { margin:0; font-size:16px; }
.modal-close { background:none; border:none; font-size:18px; cursor:pointer; color:#94a3b8; }
.modal-body { padding:16px 18px; }
.modal-footer { display:flex; gap:8px; justify-content:flex-end; padding:12px 18px; border-top:1px solid #e5e7eb; }
.form-group { margin-bottom:12px; }
.form-group label { display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:4px; }
.req { color:#dc2626; }
.form-input { width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; box-sizing:border-box; background:#fff; }
.form-input:focus { outline:none; border-color:#2563eb; }
.form-error { color:#dc2626; font-size:13px; margin-top:8px; }
.btn { padding:8px 16px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid transparent; }
.btn-outline { background:#fff; border-color:#cbd5e1; color:#475569; }
.btn-primary { background:#2563eb; color:#fff; border-color:#2563eb; }
.btn-primary:disabled { opacity:.5; cursor:not-allowed; }

/* Empty */
.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; color:#94a3b8; }
.empty-icon { font-size:48px; margin-bottom:8px; }

/* Mobile */
@media(max-width:480px) {
  .topbar { padding:6px 10px; }
  .topbar-name { font-size:13px; }
  .btn-add { width:32px; height:32px; font-size:20px; }
  .vr-name { font-size:15px; }
  .vr-timer { font-size:14px; }
  .visit-item { padding: 10px 10px; }
  .visit-detail { gap: 12px; }
  .advance-select, .handover-select, .doctor-select { font-size: 14px; padding: 10px; }
}
</style>

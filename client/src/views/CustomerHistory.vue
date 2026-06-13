<template>
  <Teleport to="body">
    <div class="ch-overlay" @click.self="$emit('close')">
      <div class="ch-container">

        <!-- ═══════ 顶部栏 ═══════ -->
        <header class="ch-topbar">
          <button class="ch-back" @click="$emit('close')">← 返回</button>
          <div class="ch-search">
            <input v-model="searchName" class="ch-search-input" placeholder="输入顾客姓名搜索..." @keyup.enter="doSearch" />
            <button class="ch-search-btn" @click="doSearch">🔍</button>
          </div>
          <span class="ch-customer">{{ searchName ? (customerName + ' · ' + visits.length + '次') : ('全部顾客 ' + visits.length + '条') }}</span>
          <!-- ★ 截屏按钮始终可见 -->
          <button class="ch-screenshot-btn" @click="captureScreenshot" title="截屏保存5框对比">📷 截屏</button>
        </header>

        <!-- ═══════ 上半：顾客缩略图区 (1/4) ═══════ -->
        <div class="ch-top">
          <div v-if="!searched" class="ch-empty">加载中...</div>
          <div v-else-if="visits.length === 0" class="ch-empty">暂无记录</div>
          <div v-else class="ch-visits-row">
            <div v-for="v in visits" :key="v.id" class="ch-visit-mini">
              <div class="ch-vm-header">
                <span class="ch-vm-guest">{{ v.guest_name }}</span>
                <span class="ch-vm-date">{{ v.visit_date }}</span>
              </div>
              <div class="ch-vm-photos">
                <div
                  v-for="p in v.photos" :key="p.id"
                  class="ch-vm-thumb"
                  :class="{ 'ch-vm-selected': isInSlot(p) }"
                  draggable="true"
                  @dragstart="onDrag($event, p)"
                  @click="quickFill(p)"
                >
                  <img :src="'/photos/' + p.thumb_path" />
                  <span class="ch-vm-tag">{{ p.photo_type === 'pre' ? '术' : '后' }}</span>
                </div>
                <span v-if="v.photos.length === 0" class="ch-vm-empty">—</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════ 下半：5 对比槽 (3/4) ═══════ -->
        <div class="ch-bottom" ref="slotsRow">
          <div
            v-for="(slot, si) in slots" :key="si"
            class="ch-slot"
            :class="{ 'ch-slot-hover': dragTarget === si }"
            ref="slotRefs"
            @dragover.prevent="dragTarget = si"
            @dragleave="dragTarget = null"
            @drop="onDrop($event, si)"
          >
            <!-- 已填充 -->
            <div v-if="slot.photo" class="ch-slot-zoom"
              @wheel.prevent="onWheel($event, si)"
              @mousedown="onPanStart($event, si)"
              @mousemove="onPanMove($event, si)"
              @mouseup="endPan"
              @mouseleave="endPan"
              @touchstart.passive="onPinchStart($event, si)"
              @touchmove="onPinchMove($event, si)"
              @touchend="endPan"
            >
              <img
                :ref="el => imgRefs[si] = el"
                :src="'/photos/' + slot.photo.file_path"
                :style="slotStyle(si)"
                draggable="false"
                @load="onImgLoad(si)"
              />
            </div>
            <button v-if="slot.photo" class="ch-slot-x" @click="slots[si] = {}; reset(si)">✕</button>
            <!-- 空槽 -->
            <div v-else class="ch-slot-empty">
              <span class="ch-slot-num">{{ si + 1 }}</span>
              <span class="ch-slot-hint">拖入照片</span>
            </div>
            <!-- 标签 + 缩放指示 -->
            <div v-if="slot.photo" class="ch-slot-info">
              <span>{{ slot.photo.photo_type === 'pre' ? '术前' : '术后' }} · {{ slot.photo.dateLabel }}</span>
              <span class="ch-slot-zoom-label">{{ Math.round(slot.zoom * 100) }}%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'

const emit = defineEmits(['close'])
const { send } = useWebSocket()

const searchName = ref('')
const searched = ref(false)
const customerName = ref('')
const visits = ref([])

// ★ 5 个对比槽
const slots = reactive([
  {}, {}, {}, {}, {}
])
const dragTarget = ref(null)
const slotRefs = ref([])
const imgRefs = reactive({})

// 缩放平移状态
let panning = null
let panSX = 0, panSY = 0, panOX = 0, panOY = 0
let pinchBase = {}

const slotStyle = (si) => {
  const s = slots[si]
  return { transform: `scale(${s.zoom || 1}) translate(${s.panX || 0}px, ${s.panY || 0}px)` }
}
const reset = (si) => {
  slots[si].zoom = 1
  slots[si].panX = 0
  slots[si].panY = 0
}
const isInSlot = (p) => slots.some(s => s.photo?.id === p.id)

onMounted(() => doSearch())

async function doSearch() {
  searched.value = true
  customerName.value = ''
  visits.value = []
  try {
    const r = await send('CUSTOMER_HISTORY', { name: searchName.value.trim() })
    if (r.success) {
      customerName.value = r.payload.customerName || ''
      visits.value = (r.payload.visits || []).map(v => ({
        ...v, photos: (v.photos || []).map(p => ({ ...p, dateLabel: v.visit_date }))
      }))
    }
  } catch {}
}

// ── 拖放 ──
function onDrag(e, photo) {
  e.dataTransfer.setData('text/plain', JSON.stringify({ id: photo.id }))
}

function onDrop(e, si) {
  dragTarget.value = null
  try {
    const { id } = JSON.parse(e.dataTransfer.getData('text/plain'))
    for (const v of visits.value) {
      const p = v.photos.find(p => p.id === id)
      if (p) { slots[si] = { photo: p, zoom: 1, panX: 0, panY: 0 }; return }
    }
  } catch {}
}

// 点击即填充下一个空槽
function quickFill(photo) {
  for (let i = 0; i < 5; i++) {
    if (!slots[i].photo) { slots[i] = { photo, zoom: 1, panX: 0, panY: 0 }; return }
  }
}

// ── 缩放/平移 ──
function onWheel(e, si) {
  e.preventDefault()
  const d = e.deltaY > 0 ? 0.85 : 1.15
  slots[si].zoom = Math.max(0.3, Math.min(5, (slots[si].zoom || 1) * d))
}
function onPanStart(e, si) {
  if (e.button !== 0) return; e.preventDefault()
  panning = si; panSX = e.clientX; panSY = e.clientY
  panOX = slots[si].panX || 0; panOY = slots[si].panY || 0
}
function onPanMove(e, si) {
  if (panning !== si) return
  const z = slots[si].zoom || 1
  slots[si].panX = panOX + (e.clientX - panSX) / z
  slots[si].panY = panOY + (e.clientY - panSY) / z
}
function endPan() { panning = null }

function onPinchStart(e, si) {
  if (e.touches.length !== 2) return
  pinchBase[si] = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
}
function onPinchMove(e, si) {
  if (e.touches.length !== 2 || !pinchBase[si]) return
  e.preventDefault()
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
  slots[si].zoom = Math.max(0.3, Math.min(5, (slots[si].zoom || 1) * (d / pinchBase[si])))
  pinchBase[si] = d
}
function onImgLoad(si) {
  // 图片加载后重置缩放
}

// ── 截屏：5 框完整合成 ──
async function captureScreenshot() {
  const row = slotRefs.value
  if (!row || !row.length) return

  // 等所有可见图的加载
  const imgWait = []
  for (let i = 0; i < 5; i++) {
    const img = imgRefs[i]
    const slot = slots[i]
    if (slot.photo && img && !img.complete) {
      imgWait.push(new Promise(r => { img.onload = r }))
    }
  }
  if (imgWait.length) await Promise.all(imgWait)

  const canvas = document.createElement('canvas')
  const padding = 0  // ★ 无间隙
  const slotEl = row[0]
  if (!slotEl) return
  const slotW = slotEl.clientWidth
  const slotH = slotEl.clientHeight

  canvas.width = slotW * 5 + padding * 4
  canvas.height = slotH
  const ctx = canvas.getContext('2d')

  // 深色背景
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 5; i++) {
    const s = slots[i]
    const img = imgRefs[i]
    if (!s.photo || !img) continue

    const ox = i * slotW
    const z = s.zoom || 1
    const px = s.panX || 0
    const py = s.panY || 0

    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, 0, slotW, slotH)
    ctx.clip()
    ctx.translate(ox + slotW / 2, slotH / 2)
    ctx.scale(z, z)
    ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.translate(px, py)
    ctx.drawImage(img, 0, 0)
    ctx.restore()

    // 底部标签
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(ox, slotH - 22, slotW, 22)
    ctx.fillStyle = '#64ffda'
    ctx.font = '11px sans-serif'
    ctx.fillText((s.photo.photo_type === 'pre' ? '术前' : '术后') + ' · ' + s.photo.dateLabel, ox + 6, slotH - 7)
  }

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `对比5框_${new Date().toISOString().slice(0,10)}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
</script>

<style scoped>
.ch-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.ch-container {
  width: 100%; max-width: 1200px; height: 96vh;
  background: #1a1a2e; border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden;
}

/* ── topbar ── */
.ch-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: #16213e; border-bottom: 1px solid #0f3460;
  flex-shrink: 0;
}
.ch-back {
  background: none; border: 1px solid #0f3460; color: #e0e0e0;
  padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.ch-search { display: flex; flex: 1; gap: 4px; }
.ch-search-input {
  flex: 1; padding: 4px 8px; border-radius: 6px; border: 1px solid #0f3460;
  background: #0a0a1a; color: #e0e0e0; font-size: 13px;
}
.ch-search-btn {
  background: #0f3460; border: none; color: #e0e0e0;
  padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.ch-customer { color: #64ffda; font-size: 13px; white-space: nowrap; }
.ch-screenshot-btn {
  background: #2563eb; border: none; color: #fff; padding: 5px 14px;
  border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
  flex-shrink: 0;
}
.ch-screenshot-btn:hover { background: #1d4ed8; }

/* ── top: 顾客缩略图行 (1/4) ── */
.ch-top {
  flex: 1; overflow-x: auto; overflow-y: hidden;
  padding: 6px 10px; border-bottom: 1px solid #0f3460;
  display: flex; align-items: flex-start;
}
.ch-empty { color: #64748b; font-size: 13px; padding: 20px; }
.ch-visits-row {
  display: flex; gap: 8px; height: 100%;
}
.ch-visit-mini {
  min-width: 150px; max-width: 220px; flex-shrink: 0;
  background: #16213e; border-radius: 6px; padding: 6px 8px;
  border: 1px solid #0f3460; overflow: hidden;
  display: flex; flex-direction: column;
}
.ch-vm-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.ch-vm-guest { color: #ffa726; font-weight: 600; font-size: 13px; }
.ch-vm-date { color: #64ffda; font-size: 12px; }
.ch-vm-photos {
  display: flex; flex-wrap: wrap; gap: 3px; flex: 1; align-content: flex-start;
}
.ch-vm-thumb {
  width: 48px; height: 48px; border-radius: 3px; overflow: hidden;
  position: relative; cursor: pointer; border: 1px solid #0f3460;
  flex-shrink: 0;
}
.ch-vm-thumb:hover { border-color: #64ffda; }
.ch-vm-selected { border-color: #22c55e !important; outline: 1px solid #22c55e; }
.ch-vm-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ch-vm-tag {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.6); color: #e0e0e0; font-size: 9px;
  text-align: center; padding-bottom: 1px;
}
.ch-vm-empty { color: #475569; font-size: 12px; }

/* ── bottom: 5 对比框 (3/4) ── */
.ch-bottom {
  flex: 3; display: flex; flex-direction: row;
}
.ch-slot {
  flex: 1; position: relative; overflow: hidden;
  background: #000;
  /* ★ 无 border，无 gap —— 紧贴 */
  transition: outline 0.15s;
}
.ch-slot-hover { outline: 2px solid #64ffda; outline-offset: -1px; z-index: 1; }

/* zoom 容器 */
.ch-slot-zoom {
  width: 100%; height: 100%; cursor: grab; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.ch-slot-zoom:active { cursor: grabbing; }
.ch-slot img {
  max-width: none; max-height: none;
  transform-origin: center center;
  user-select: none; -webkit-user-drag: none;
}

/* 空槽 */
.ch-slot-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 2px; height: 100%;
}
.ch-slot-num {
  font-size: 28px; color: #1e293b; font-weight: 700;
}
.ch-slot-hint { font-size: 11px; color: #334155; }

/* 标签 */
.ch-slot-x {
  position: absolute; top: 2px; right: 2px; z-index: 2;
  background: rgba(0,0,0,0.65); color: #ef4444; border: none;
  width: 20px; height: 20px; border-radius: 50%;
  font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.ch-slot-info {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 1;
  display: flex; justify-content: space-between; align-items: center;
  padding: 2px 6px; background: rgba(0,0,0,0.65); pointer-events: none;
  font-size: 10px; color: #64ffda;
}
.ch-slot-zoom-label { color: #94a3b8; }
</style>

<template>
  <!-- 全屏 overlay -->
  <Teleport to="body">
    <div class="ch-overlay" @click.self="$emit('close')">
      <div class="ch-container">

        <!-- ═══════ 顶部栏 ═══════ -->
        <header class="ch-topbar">
          <button class="ch-back" @click="$emit('close')">← 返回</button>
          <div class="ch-search">
            <input
              v-model="searchName"
              class="ch-search-input"
              placeholder="输入顾客姓名搜索..."
              @keyup.enter="doSearch"
            />
            <button class="ch-search-btn" @click="doSearch" :disabled="searching">🔍</button>
          </div>
          <span v-if="customerName" class="ch-customer">{{ customerName }} · {{ visits.length }}次到院</span>
        </header>

        <!-- ═══════ 主体：左右分栏 ═══════ -->
        <div class="ch-body">
          <!-- ── 左侧：到院记录列表 ── -->
          <div class="ch-left" ref="leftPanel">
            <div v-if="searched && loading" class="ch-empty">搜索中...</div>
            <div v-else-if="searched && visits.length === 0 && searchName" class="ch-empty">未找到该顾客的记录</div>
            <div v-else-if="searched && visits.length === 0" class="ch-empty">暂无到院记录</div>
            <div v-else-if="!searched" class="ch-empty">加载中...</div>

            <div
              v-for="(v, vi) in visits"
              :key="v.id"
              class="ch-visit-card"
            >
              <div class="ch-visit-header">
                <span class="ch-visit-date">{{ fmtDate(v.visit_date) }}</span>
                <span class="ch-visit-duration">{{ v.totalMin }}分钟</span>
                <button class="ch-rec-btn" @click.stop="openRecording(v)" title="面诊录音">🎙</button>
              </div>
              <div class="ch-visit-doctors" v-if="v.doctors.length">
                <span v-for="d in v.doctors" :key="d.id" class="ch-doctor-tag">
                  👨‍⚕️{{ d.doctor_name }}
                  <template v-if="d.procedure_name">·{{ d.procedure_name }}</template>
                </span>
              </div>
              <div class="ch-visit-path">{{ v.statusPath.join(' → ') }}</div>

              <!-- 照片缩略图（可拖拽） -->
              <div class="ch-photos-row">
                <div
                  v-for="p in v.photos"
                  :key="p.id"
                  class="ch-photo-thumb"
                  draggable="true"
                  @dragstart="onDragStart($event, p, vi)"
                  @click="previewPhoto(p)"
                >
                  <img :src="'/photos/' + p.thumb_path" :alt="p.photo_type" />
                  <span class="ch-photo-type">{{ p.photo_type === 'pre' ? '术前' : '术后' }}</span>
                </div>
                <div v-if="v.photos.length === 0" class="ch-no-photos">无照片</div>
              </div>
            </div>
          </div>

          <!-- ── 右侧：对比区 ── -->
          <div class="ch-right">
            <div class="ch-compare-title">📸 照片对比</div>
            <div class="ch-compare-slots">
              <div
                class="ch-slot"
                :class="{ 'ch-slot-hover': dragOverSlot === 0, 'ch-slot-filled': compareA }"
                @dragover.prevent="dragOverSlot = 0"
                @dragleave="dragOverSlot = null"
                @drop="onDrop($event, 0)"
              >
                <template v-if="compareA">
                  <img :src="'/photos/' + compareA.thumb_path" />
                  <span class="ch-slot-label">{{ compareA.photo_type === 'pre' ? '术前' : '术后' }} · {{ compareA.dateLabel }}</span>
                  <button class="ch-slot-remove" @click="compareA = null">✕</button>
                </template>
                <template v-else>
                  <span class="ch-slot-hint">拖入照片对比</span>
                </template>
              </div>
              <div
                class="ch-slot"
                :class="{ 'ch-slot-hover': dragOverSlot === 1, 'ch-slot-filled': compareB }"
                @dragover.prevent="dragOverSlot = 1"
                @dragleave="dragOverSlot = null"
                @drop="onDrop($event, 1)"
              >
                <template v-if="compareB">
                  <img :src="'/photos/' + compareB.thumb_path" />
                  <span class="ch-slot-label">{{ compareB.photo_type === 'pre' ? '术前' : '术后' }} · {{ compareB.dateLabel }}</span>
                  <button class="ch-slot-remove" @click="compareB = null">✕</button>
                </template>
                <template v-else>
                  <span class="ch-slot-hint">拖入照片对比</span>
                </template>
              </div>
            </div>
            <button v-if="compareA || compareB" class="ch-compare-clear" @click="compareA = null; compareB = null">
              清除对比
            </button>
          </div>
        </div>

        <!-- ═══════ 大图预览 ═══════ -->
        <div v-if="previewSrc" class="ch-preview-overlay" @click="previewSrc = null">
          <img :src="previewSrc" class="ch-preview-img" @click.stop />
        </div>
      </div>
      <!-- ═══════ Recording Modal (v4.0) ═══════ -->
    <RecordingView v-if="recordingVisit"
      :visit-id="recordingVisit.id"
      :guest-name="recordingVisit.guest_name"
      @close="recordingVisit = null" />
  </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'
import RecordingView from './RecordingView.vue'

const emit = defineEmits(['close'])
const { send } = useWebSocket()

const searchName = ref('')
const searched = ref(false)
const loading = ref(false)
const customerName = ref('')
const visits = ref([])

// 对比区
const compareA = ref(null)
const compareB = ref(null)
const dragOverSlot = ref(null)

// 大图预览
const previewSrc = ref(null)

// v4.0 录音
const recordingVisit = ref(null)
function openRecording(v) {
  console.log('[CH] 🎙 打开录音按钮被点击:', v.id, v.guest_name)
  console.log('[CH] recordingVisit 赋值前:', recordingVisit.value?.id)
  recordingVisit.value = v
  console.log('[CH] recordingVisit 赋值后:', recordingVisit.value?.id)
}

// ★ v3.0: 打开即自动加载全部顾客历史
onMounted(() => { doSearch() })

function fmtDate(d) {
  if (!d) return ''
  return d  // visit_date is already 'YYYY-MM-DD' format
}

async function doSearch() {
  const name = searchName.value.trim()
  // ★ v3.0: 空 name = 全部顾客历史（回车触发仍需输入）

  loading.value = true
  searched.value = true
  visits.value = []
  customerName.value = ''
  compareA.value = null
  compareB.value = null

  try {
    const result = await send('CUSTOMER_HISTORY', { name })
    if (result.success) {
      customerName.value = result.payload.customerName || name
      visits.value = (result.payload.visits || []).map(v => ({
        ...v,
        // 给每张照片打上日期标签用于对比展示
        photos: (v.photos || []).map(p => ({ ...p, dateLabel: v.visit_date }))
      }))
    }
  } catch (e) {
    // ignore
  } finally {
    loading.value = false
  }
}

// ══════ 拖拽 ══════
function onDragStart(e, photo, visitIdx) {
  e.dataTransfer.setData('text/plain', JSON.stringify({ photo, visitIdx }))
  e.dataTransfer.effectAllowed = 'copy'
}

function onDrop(e, slotIdx) {
  dragOverSlot.value = null
  try {
    const data = JSON.parse(e.dataTransfer.getData('text/plain'))
    const target = slotIdx === 0 ? 'compareA' : 'compareB'
    if (target === 'compareA') compareA.value = data.photo
    else compareB.value = data.photo
  } catch (e) {
    // invalid drop
  }
}

// ══════ 预览 ══════
function previewPhoto(photo) {
  previewSrc.value = '/photos/' + photo.thumb_path
}
</script>

<style scoped>
.ch-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ch-container {
  width: 100%; max-width: 1100px;
  height: 95vh;
  background: #1a1a2e;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* topbar */
.ch-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}
.ch-back {
  background: none; border: 1px solid #0f3460; color: #e0e0e0;
  padding: 6px 12px; border-radius: 6px; cursor: pointer;
  font-size: 13px;
}
.ch-search {
  display: flex; flex: 1; gap: 6px;
}
.ch-search-input {
  flex: 1; padding: 6px 10px; border-radius: 6px;
  border: 1px solid #0f3460; background: #0a0a1a; color: #e0e0e0;
  font-size: 14px;
}
.ch-search-btn {
  background: #0f3460; border: none; color: #e0e0e0;
  padding: 6px 14px; border-radius: 6px; cursor: pointer;
}
.ch-customer {
  color: #64ffda; font-size: 14px; white-space: nowrap;
}

/* body */
.ch-body {
  flex: 1; display: flex; overflow: hidden;
}

/* left panel */
.ch-left {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  border-right: 1px solid #0f3460;
}
.ch-empty {
  color: #64748b; text-align: center; padding: 40px 0; font-size: 14px;
}

/* visit card */
.ch-visit-card {
  background: #16213e;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid #0f3460;
}
.ch-visit-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.ch-visit-date {
  color: #64ffda; font-weight: 600; font-size: 14px;
}
.ch-visit-duration {
  color: #64748b; font-size: 12px;
}
.ch-rec-btn {
  background: none; border: 1px solid #64ffda; color: #64ffda;
  padding: 2px 8px; border-radius: 4px; font-size: 14px;
  cursor: pointer; margin-left: auto;
}
.ch-rec-btn:hover { background: rgba(100,255,218,0.1); }
.ch-visit-doctors {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;
}
.ch-doctor-tag {
  font-size: 12px; color: #ffa726; background: rgba(255,167,38,0.1);
  padding: 1px 6px; border-radius: 4px;
}
.ch-visit-path {
  font-size: 12px; color: #94a3b8; margin-bottom: 8px;
}

/* photo thumbnails */
.ch-photos-row {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.ch-photo-thumb {
  width: 60px; height: 60px;
  border-radius: 4px; overflow: hidden;
  position: relative; cursor: grab;
  border: 1px solid #0f3460;
}
.ch-photo-thumb:active { cursor: grabbing; }
.ch-photo-thumb img {
  width: 100%; height: 100%; object-fit: cover;
}
.ch-photo-type {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.6); color: #e0e0e0;
  font-size: 10px; text-align: center; padding: 1px 0;
}
.ch-no-photos {
  color: #64748b; font-size: 12px;
}

/* right panel */
.ch-right {
  width: 340px; padding: 12px; display: flex;
  flex-direction: column;
}
.ch-compare-title {
  color: #64ffda; font-size: 14px; font-weight: 600; margin-bottom: 10px;
}
.ch-compare-slots {
  display: flex; flex-direction: column; gap: 8px; flex: 1;
}
.ch-slot {
  flex: 1; min-height: 150px;
  border: 2px dashed #0f3460; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  background: #0a0a1a;
  transition: border-color 0.2s;
}
.ch-slot-hover { border-color: #64ffda; }
.ch-slot-filled { border-style: solid; border-color: #0f3460; }
.ch-slot img {
  width: 100%; height: 100%; object-fit: contain;
}
.ch-slot-label {
  position: absolute; bottom: 4px; left: 4px;
  background: rgba(0,0,0,0.7); color: #64ffda;
  font-size: 11px; padding: 2px 6px; border-radius: 3px;
}
.ch-slot-remove {
  position: absolute; top: 4px; right: 4px;
  background: rgba(0,0,0,0.7); color: #ef4444; border: none;
  width: 22px; height: 22px; border-radius: 50%;
  font-size: 12px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.ch-slot-hint {
  color: #475569; font-size: 13px;
}
.ch-compare-clear {
  margin-top: 8px; padding: 6px 0; background: none;
  border: 1px solid #0f3460; color: #64748b;
  border-radius: 6px; cursor: pointer; font-size: 12px;
}

/* preview */
.ch-preview-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.9);
  z-index: 2000; display: flex; align-items: center; justify-content: center;
}
.ch-preview-img {
  max-width: 90vw; max-height: 90vh; object-fit: contain;
  border-radius: 8px;
}
</style>

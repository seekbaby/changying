<template>
  <Teleport to="body">
    <div class="rec-overlay" @click.self="$emit('close')">
      <div class="rec-modal">
        <!-- 顶栏 -->
        <div class="rec-header">
          <button class="rec-back" @click="$emit('close')">← 返回</button>
          <span class="rec-title">🎙 {{ guestName }} · 面诊录音</span>
          <label class="rec-upload-btn">
            + 上传录音
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.webm"
              style="display:none"
              @change="onFileSelected"
              :disabled="uploading"
            />
          </label>
        </div>

        <!-- 上传进度 -->
        <div v-if="uploading" class="rec-progress">
          <div class="rec-spinner"></div>
          <span>上传中...</span>
        </div>

        <!-- 录音列表 -->
        <div class="rec-list">
          <div v-if="recordings.length === 0 && !uploading" class="rec-empty">
            暂无面诊录音<br/>
            <span class="rec-empty-hint">点击「+ 上传录音」开始</span>
          </div>

          <div
            v-for="rec in recordings"
            :key="rec.id"
            class="rec-card"
            :class="{ 'rec-active': expandedId === rec.id }"
          >
            <!-- 录音概要 -->
            <div class="rec-summary" @click="expandedId = expandedId === rec.id ? null : rec.id">
              <span class="rec-status-dot" :class="'rec-status-' + rec.status"></span>
              <span class="rec-filename">{{ rec.file_path }}</span>
              <span class="rec-date">{{ fmtTime(rec.created_at) }}</span>
              <span class="rec-status-text">{{ statusText(rec.status) }}</span>
              <button class="rec-delete" @click.stop="doDelete(rec.id)" title="删除">🗑</button>
            </div>

            <!-- 展开详情 -->
            <div v-if="expandedId === rec.id" class="rec-detail">
              <!-- 转写文本 -->
              <div v-if="rec.transcript" class="rec-section">
                <div class="rec-section-title">📝 转写文本</div>
                <div class="rec-transcript">{{ rec.transcript }}</div>
              </div>

              <!-- AI分析报告 -->
              <div v-if="rec.status === 'completed' && rec.report_json" class="rec-section">
                <div class="rec-section-title">🤖 AI分析报告</div>
                <div class="rec-report" v-html="renderReport(rec.report_json)"></div>
              </div>

              <!-- 错误信息 -->
              <div v-if="rec.error_message" class="rec-section rec-error-box">
                <div class="rec-section-title">⚠️ 处理错误</div>
                <div class="rec-error">{{ rec.error_message }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'

const props = defineProps({
  visitId: { type: Number, required: true },
  guestName: { type: String, required: true }
})
const emit = defineEmits(['close'])
const { send } = useWebSocket()

const recordings = ref([])
const expandedId = ref(null)
const uploading = ref(false)

// 加载录音列表
async function loadRecordings() {
  try {
    const result = await send('RECORDING_LIST', { visitId: props.visitId })
    if (result.success) recordings.value = result.payload.recordings || []
  } catch (e) {
    console.warn('[Rec] 加载失败:', e.message)
  }
}

onMounted(loadRecordings)

// ★ 组件销毁时清除轮询定时器，防止定时器泄露堆叠
onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

// 轮询进行中的录音（最多轮询 10 分钟，防止异常状态永久轮询）
let pollTimer = null
let pollCount = 0
const MAX_POLL_COUNT = 200  // 3秒 × 200 = 600秒 = 10分钟硬上限

watch(recordings, (list) => {
  const hasPending = list.some(r => ['uploaded','transcribing','analyzing'].includes(r.status))
  if (hasPending && !pollTimer) {
    pollCount = 0
    pollTimer = setInterval(() => {
      pollCount++
      if (pollCount >= MAX_POLL_COUNT) {
        // ★ 安全锁：轮询超过 10 分钟，停止轮询，避免因 status 永久卡死导致无限请求
        console.warn('[Rec] 轮询超时（10分钟），停止自动刷新，请手动刷新页面')
        clearInterval(pollTimer)
        pollTimer = null
        return
      }
      loadRecordings()
    }, 3000)
  } else if (!hasPending && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}, { deep: true })

// 文件上传 — 前端直传 OSS
async function onFileSelected(e) {
  const file = e.target.files[0]
  if (!file) return

  uploading.value = true
  try {
    // 1. 获取 OSS Policy
    const pRes = await fetch('/api/recordings/oss-policy')
    const pData = await pRes.json()
    if (!pData.success) throw new Error('获取上传凭证失败')

    const { host, ossObjectName, OSSAccessKeyId, policy, signature } = pData.policy

    // 2. 直传 OSS — 仅必要字段
    await new Promise((resolve, reject) => {
      const fd = new FormData()
      fd.append('key', ossObjectName)
      fd.append('policy', policy)
      fd.append('OSSAccessKeyId', OSSAccessKeyId)
      fd.append('signature', signature)
      fd.append('success_action_status', '200')
      fd.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', host)
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 204) resolve()
        else reject(new Error(`OSS 上传失败 (${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('OSS 网络错误'))
      xhr.send(fd)
    })

    // 3. 通知后端启流水线
    const nRes = await fetch('/api/recordings/notify-uploaded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitId: props.visitId,
        guestName: props.guestName,
        ossObjectName,
        fileSize: file.size,
        asrMode: 'standard',
      }),
    })
    const nData = await nRes.json()
    if (!nData.success) throw new Error(nData.error || '通知失败')

    setTimeout(loadRecordings, 1000)
  } catch (e) {
    alert('上传失败: ' + e.message)
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

// 删除
async function doDelete(id) {
  if (!confirm('确认删除该录音及分析报告？')) return
  try {
    await send('RECORDING_DELETE', { id })
    await loadRecordings()
  } catch (e) {
    alert('删除失败: ' + e.message)
  }
}

function statusText(s) {
  const map = {
    uploaded: '已上传', transcribing: '转写中', transcribed: '已转写',
    analyzing: '分析中', completed: '已完成', failed: '失败'
  }
  return map[s] || s
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function renderReport(md) {
  // 简单 Markdown → HTML
  return md
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/❌/g, '<span class="rec-bad">❌</span>')
    .replace(/✅/g, '<span class="rec-good">✅</span>')
    .replace(/\n/g, '<br/>')
}
</script>

<style scoped>
.rec-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
}
.rec-modal {
  width: 90vw; max-width: 700px; max-height: 85vh;
  background: #fff; border-radius: 12px;
  display: flex; flex-direction: column; overflow: hidden;
}
.rec-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.rec-back { background: none; border: none; font-size: 15px; cursor: pointer; color: #64748b; }
.rec-title { flex: 1; font-size: 16px; font-weight: 700; color: #1e293b; }
.rec-upload-btn {
  padding: 8px 16px; background: #2563eb; color: #fff;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.rec-progress {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  background: #eff6ff; font-size: 14px; color: #2563eb;
}
.rec-spinner {
  width: 18px; height: 18px; border: 2px solid #bfdbfe;
  border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.rec-list { flex: 1; overflow-y: auto; padding: 12px 16px; }
.rec-empty { text-align: center; padding: 40px 0; color: #94a3b8; font-size: 15px; }
.rec-empty-hint { font-size: 13px; margin-top: 8px; display: block; }

.rec-card {
  border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; overflow: hidden;
}
.rec-card.rec-active { border-color: #2563eb; }
.rec-summary {
  display: flex; align-items: center; gap: 10px; padding: 12px; cursor: pointer;
}
.rec-summary:hover { background: #f8fafc; }
.rec-status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.rec-status-uploaded { background: #f59e0b; }
.rec-status-transcribing, .rec-status-analyzing { background: #3b82f6; animation: pulse 1.5s infinite; }
.rec-status-transcribed { background: #8b5cf6; }
.rec-status-completed { background: #10b981; }
.rec-status-failed { background: #ef4444; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.rec-filename { flex: 1; font-size: 14px; font-weight: 500; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-date { font-size: 12px; color: #94a3b8; }
.rec-status-text { font-size: 12px; color: #64748b; }
.rec-delete { background: none; border: none; cursor: pointer; font-size: 14px; }

.rec-detail { padding: 0 12px 12px; }
.rec-section { margin-top: 10px; }
.rec-section-title { font-size: 14px; font-weight: 700; color: #475569; margin-bottom: 6px; }
.rec-transcript {
  font-size: 13px; line-height: 1.7; color: #334155; background: #f8fafc;
  padding: 10px; border-radius: 8px; white-space: pre-wrap; max-height: 200px; overflow-y: auto;
}
.rec-report {
  font-size: 13px; line-height: 1.8; color: #1e293b;
  background: #f0fdf4; padding: 12px; border-radius: 8px;
}
.rec-report :deep(h3) {
  font-size: 14px; font-weight: 700; color: #15803d; margin: 10px 0 6px;
}
.rec-report :deep(strong) { color: #0f172a; }
.rec-report :deep(.rec-bad) { color: #dc2626; }
.rec-report :deep(.rec-good) { color: #16a34a; }
.rec-error-box { background: #fef2f2; padding: 10px; border-radius: 8px; }
.rec-error { font-size: 13px; color: #dc2626; }
</style>

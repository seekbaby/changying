<template>
  <div class="test-page">
    <header class="page-header">
      <h2 class="page-title">🧪 录音分析测试</h2>
      <p class="page-desc">前端直传 OSS → ASR 转写 → DeepSeek 分析</p>
    </header>

    <div class="content-grid">
      <!-- 左：上传区 -->
      <div class="card upload-card">
        <h3 class="card-title">📤 上传录音</h3>

        <div class="config-row">
          <label class="form-label">
            访客名称
            <input v-model="guestName" class="form-input" placeholder="用于报告标题" />
          </label>
          <label class="form-label">
            ASR 模式
            <select v-model="asrMode" class="form-select">
              <option value="standard">标准版 (¥0.80/h)</option>
              <option value="express">极速版 (¥4.50/h)</option>
            </select>
          </label>
        </div>

        <div
          class="dropzone"
          :class="{ dragging, hasFile: !!file }"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="handleDrop"
          @click="triggerInput"
        >
          <input ref="fileInput" type="file" accept="audio/*" class="hidden-input" @change="handleFileSelect" />
          <template v-if="!file">
            <span class="dropzone-icon">🎵</span>
            <p>拖拽音频文件到此处，或点击选择</p>
            <p class="dropzone-hint">支持 MP3 / WAV / M4A，最大 100MB</p>
          </template>
          <template v-else>
            <span class="dropzone-icon">📁</span>
            <p class="file-name">{{ file.name }}</p>
            <p class="file-size">{{ formatSize(file.size) }}</p>
          </template>
        </div>

        <button class="btn-primary" :disabled="!file || uploading" @click="startUpload">
          <span v-if="uploading" class="spinner"></span>
          <span v-else>🚀 开始分析</span>
        </button>

        <div v-if="uploadProgress > 0 && uploadProgress < 100" class="progress-bar">
          <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
          <span class="progress-text">{{ uploadProgress }}%</span>
        </div>
      </div>

      <!-- 右：结果区 -->
      <div class="card result-card">
        <h3 class="card-title">📊 分析结果</h3>

        <div v-if="pipelineStatus" class="status-bar">
          <span class="status-dot" :class="'dot-' + pipelineStatus"></span>
          <span>{{ statusLabel(pipelineStatus) }}</span>
        </div>

        <div v-if="!pipelineStatus && !errorMsg" class="empty-state">
          <span class="empty-icon">🎙️</span>
          <p>上传录音后，这里会实时显示分析进度和结果</p>
        </div>

        <div v-if="transcript" class="result-section">
          <h4 class="section-title">📝 转写文本</h4>
          <pre class="transcript-text">{{ transcript }}</pre>
        </div>

        <div v-if="reportJson" class="result-section">
          <h4 class="section-title">📈 分析报告</h4>
          <pre class="report-json">{{ formatReport(reportJson) }}</pre>
        </div>

        <div v-if="errorMsg" class="error-box">
          <span class="error-icon">❌</span>
          <p>{{ errorMsg }}</p>
        </div>
      </div>
    </div>

    <div class="card" v-if="history.length">
      <h3 class="card-title">📋 历史记录</h3>
      <table class="history-table">
        <thead>
          <tr><th>ID</th><th>访客</th><th>模式</th><th>状态</th><th>时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="rec in history" :key="rec.id">
            <td>#{{ rec.id }}</td>
            <td>{{ rec.guest_name || '-' }}</td>
            <td><span class="tag" :class="'mode-' + rec.asr_mode">{{ rec.asr_mode || '-' }}</span></td>
            <td><span class="tag" :class="'status-' + rec.status">{{ rec.status }}</span></td>
            <td>{{ formatTime(rec.created_at) }}</td>
            <td><button class="btn-sm" @click="loadRecording(rec.id)">查看</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const BASE = import.meta.env.VITE_API_BASE || ''

const guestName = ref('测试访客')
const asrMode = ref('standard')
const file = ref(null)
const fileInput = ref(null)
const dragging = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const pipelineStatus = ref('')
const transcript = ref('')
const reportJson = ref(null)
const errorMsg = ref('')
const history = ref([])

let pollTimer = null

// ── utils ──
function formatSize(b) {
  if (!b) return '0 B'
  if (b < 1024*1024) return (b/1024).toFixed(1)+' KB'
  return (b/(1024*1024)).toFixed(1)+' MB'
}
function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
}
function statusLabel(s) {
  const m = { uploaded:'📤 已上传', transcribing:'🎙️ 转写中', transcribed:'✅ 转写完成', analyzing:'🤖 分析中', completed:'✅ 完成', error:'❌ 失败', failed:'❌ 失败' }
  return m[s] || s
}
function formatReport(json) {
  const d = json.data_points || {}
  const q = json.analysis_questions || {}
  const lines = [`💡 需求信号: ${d.client_opportunities_count ?? '?'} 个  |  🎯 捕捉: ${d.consultant_caught_count ?? '?'} 个`]
  for (const [k,v] of Object.entries(q)) {
    const label = k.replace(/_/g,' ')
    if (typeof v === 'string') lines.push(`\n📌 ${label}: ${v}`)
    else if (typeof v === 'object' && v !== null) lines.push(`\n📌 ${label}: ${JSON.stringify(v)}`)
  }
  return lines.join('\n')
}

// ── file ──
function triggerInput() { fileInput.value?.click() }
function handleFileSelect(e) { const f = e.target.files?.[0]; if (f) file.value = f }
function handleDrop(e) { dragging.value = false; const f = e.dataTransfer?.files?.[0]; if (f?.type?.startsWith('audio/')) file.value = f }

// ── upload ──
async function startUpload() {
  if (!file.value) return
  uploading.value = true
  uploadProgress.value = 0
  pipelineStatus.value = ''
  transcript.value = ''
  reportJson.value = null
  errorMsg.value = ''

  try {
    // 1. 获取 OSS Policy
    const pRes = await fetch(`${BASE}/api/recordings/oss-policy`)
    const pData = await pRes.json()
    if (!pData.success) throw new Error('获取上传凭证失败')

    const { host, ossObjectName, OSSAccessKeyId, policy, signature } = pData.policy

    // 2. 直传 OSS — 仅必要字段
    pipelineStatus.value = 'uploading'
    await uploadToOss(host, ossObjectName, OSSAccessKeyId, policy, signature, file.value)

    // 3. 通知后端启流水线
    const nRes = await fetch(`${BASE}/api/recordings/notify-uploaded`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitId: 0,
        guestName: guestName.value.trim(),
        ossObjectName,
        fileSize: file.value.size,
        asrMode: asrMode.value,
      }),
    })
    const nData = await nRes.json()
    if (!nData.success) throw new Error(nData.error || '通知后端失败')

    const id = nData.recording.id
    pipelineStatus.value = 'uploaded'
    file.value = null
    uploadProgress.value = 100
    startPolling(id)
  } catch (e) {
    errorMsg.value = e.message
    pipelineStatus.value = 'error'
  } finally {
    uploading.value = false
  }
}

function uploadToOss(host, key, accessKeyId, policy, signature, file) {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('key', key)
    fd.append('policy', policy)
    fd.append('OSSAccessKeyId', accessKeyId)
    fd.append('signature', signature)
    fd.append('success_action_status', '200')
    fd.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', host)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded/e.total)*100)
    }
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 204) resolve()
      else reject(new Error(`OSS 上传失败 (${xhr.status}): ${xhr.responseText?.slice(0,200)}`))
    }
    xhr.onerror = () => reject(new Error('OSS 网络错误'))
    xhr.send(fd)
  })
}

// ── polling ──
function startPolling(id) {
  clearInterval(pollTimer)
  pollTimer = setInterval(() => checkStatus(id), 2000)
  checkStatus(id)
}
async function checkStatus(id) {
  try {
    const r = await fetch(`${BASE}/api/recordings/${id}`)
    const d = await r.json()
    if (!d.success) return
    const rec = d.recording
    pipelineStatus.value = rec.status
    if (rec.transcript) transcript.value = rec.transcript
    if (rec.report_json) {
      try { reportJson.value = typeof rec.report_json === 'string' ? JSON.parse(rec.report_json) : rec.report_json } catch {}
    }
    if (rec.error_message) errorMsg.value = rec.error_message
    if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'error') clearInterval(pollTimer)
  } catch {}
}
function loadRecording(id) {
  clearInterval(pollTimer)
  errorMsg.value = ''; transcript.value = ''; reportJson.value = null; pipelineStatus.value = ''
  startPolling(id)
}

// ── history ──
async function loadHistory() {
  try {
    const r = await fetch(`${BASE}/api/recordings?limit=20`)
    const d = await r.json()
    if (d.success) history.value = d.recordings || []
  } catch {}
}

onMounted(loadHistory)
onUnmounted(() => clearInterval(pollTimer))
</script>

<style scoped>
.test-page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: var(--text); }
.page-desc { font-size: 14px; color: var(--text2); margin-top: 4px; }
.content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text); }

.config-row { display: flex; gap: 16px; margin-bottom: 16px; }
.form-label { flex: 1; font-size: 13px; color: var(--text2); display: flex; flex-direction: column; gap: 4px; }
.form-input,.form-select { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg); color: var(--text); }
.form-select { cursor: pointer; }

.dropzone { border: 2px dashed var(--border); border-radius: 12px; padding: 48px 24px; text-align: center; cursor: pointer; transition: all .2s; margin-bottom: 16px; }
.dropzone:hover { border-color: var(--primary); background: var(--primary-light); }
.dropzone.dragging { border-color: var(--primary); background: var(--primary-light); transform: scale(1.02); }
.dropzone.hasFile { border-style: solid; border-color: var(--success); background: #f0fdf4; }
.dropzone-icon { font-size: 40px; display: block; margin-bottom: 8px; }
.dropzone p { font-size: 14px; color: var(--text); }
.dropzone-hint { font-size: 12px !important; color: var(--text2) !important; margin-top: 4px; }
.file-name { font-weight: 600; }
.file-size { font-size: 12px; color: var(--text2); margin-top: 4px; }
.hidden-input { display: none; }

.btn-primary { width: 100%; padding: 12px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-sm { padding: 4px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 12px; cursor: pointer; }
.btn-sm:hover { background: var(--primary-light); color: var(--primary); }

.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

.progress-bar { height: 8px; background: var(--border); border-radius: 4px; margin-top: 12px; overflow: hidden; position: relative; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width .3s; }
.progress-text { position: absolute; right: 4px; top: -18px; font-size: 12px; color: var(--text2); }

.status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; font-weight: 500; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 1.5s infinite; }
.dot-uploaded,.dot-uploading { background: #f59e0b; }
.dot-transcribing { background: #3b82f6; }
.dot-transcribed { background: #8b5cf6; }
.dot-analyzing { background: #a855f7; }
.dot-completed { background: #10b981; }
.dot-error,.dot-failed { background: #ef4444; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.result-section { margin-bottom: 16px; }
.section-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.transcript-text { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
.report-json { background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }

.empty-state { text-align: center; padding: 40px 20px; color: var(--text2); }
.empty-icon { font-size: 48px; display: block; margin-bottom: 12px; }

.error-box { display: flex; align-items: flex-start; gap: 8px; padding: 12px; background: #fee2e2; border-radius: 8px; color: #991b1b; font-size: 14px; }
.error-icon { flex-shrink: 0; }

.history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.history-table th,.history-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
.history-table th { font-weight: 600; color: var(--text2); font-size: 12px; text-transform: uppercase; }
.history-table tr:hover td { background: var(--bg); }
.tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
.tag.mode-standard { background: #dbeafe; color: #1e40af; }
.tag.mode-express { background: #fae8ff; color: #6b21a8; }
.tag.status-completed { background: #dcfce7; color: #166534; }
.tag.status-error,.tag.status-failed { background: #fee2e2; color: #991b1b; }
.tag.status-transcribing,.tag.status-analyzing { background: #fef3c7; color: #92400e; }
.tag.status-uploaded { background: #e0e7ff; color: #3730a3; }
</style>

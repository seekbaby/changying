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
              <!-- ★ 分析报告置顶 (Task 3) -->
              <div v-if="rec.status === 'completed' && rec.report_json" class="rec-section">
                <div class="rec-section-title">🤖 AI分析报告</div>
                <div class="rec-report" v-html="renderReport(rec.report_json)"></div>
              </div>

              <!-- ★ 转写文本 + 一键互换角色 (Task 1 frontend) -->
              <div v-if="rec.transcript" class="rec-section">
                <div class="rec-section-header">
                  <span class="rec-section-title">📝 转写文本</span>
                  <button
                    v-if="rec.timeline_json"
                    class="rec-ghost-btn"
                    @click="toggleSpeakerSwap(rec.id)"
                    :class="{ 'rec-ghost-active': speakerSwapped[rec.id] }"
                  >
                    🔄 一键互换角色
                  </button>
                </div>
                <div class="rec-transcript" v-html="renderTranscript(rec)"></div>
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
import { ref, onMounted, onUnmounted, watch, reactive } from 'vue'
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
const speakerSwapped = reactive({})  // { [recId]: bool }

// ── 一键互换角色 ──
function toggleSpeakerSwap(recId) {
  speakerSwapped[recId] = !speakerSwapped[recId]
}

// ── 构建转写文本（支持角色互换）──
function renderTranscript(rec) {
  let timeline
  try {
    timeline = typeof rec.timeline_json === 'string' ? JSON.parse(rec.timeline_json) : rec.timeline_json
  } catch {
    // fallback: plain text
    return escapeHtml(rec.transcript || '')
  }

  if (!Array.isArray(timeline) || timeline.length === 0) {
    return escapeHtml(rec.transcript || '')
  }

  const swapped = speakerSwapped[rec.id]
  const speakerLabels = buildSpeakerLabels(timeline, swapped)

  let html = ''
  for (const u of timeline) {
    const sid = u.s
    const label = speakerLabels.get(sid) || '?'
    const mm = String(Math.floor(u.ms / 60000)).padStart(2, '0')
    const ss = String(Math.floor((u.ms % 60000) / 1000)).padStart(2, '0')
    html += `<div class="trl-line"><span class="trl-time">[${mm}:${ss}]</span> <span class="trl-speaker">👤 ${label}：</span>${escapeHtml(u.t)}</div>`
  }
  return html
}

function buildSpeakerLabels(timeline, swapped) {
  const map = new Map()
  const ordered = []
  for (const u of timeline) {
    const sid = u.s
    if (!map.has(sid)) {
      map.set(sid, String.fromCharCode(65 + ordered.length))
      ordered.push(sid)
    }
  }

  if (swapped && ordered.length >= 2) {
    // 互换前两个说话人标签
    const a = ordered[0], b = ordered[1]
    const labelA = map.get(a), labelB = map.get(b)
    map.set(a, labelB)
    map.set(b, labelA)
  }
  return map
}

// ── 加载录音列表 ──
async function loadRecordings() {
  try {
    const result = await send('RECORDING_LIST', { visitId: props.visitId })
    if (result.success) recordings.value = result.payload.recordings || []
  } catch (e) {
    console.warn('[Rec] 加载失败:', e.message)
  }
}

onMounted(loadRecordings)

// ★ 组件销毁时清除轮询定时器
onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

// 轮询进行中的录音
let pollTimer = null
let pollCount = 0
const MAX_POLL_COUNT = 200

watch(recordings, (list) => {
  const hasPending = list.some(r => ['uploaded','transcribing','analyzing'].includes(r.status))
  if (hasPending && !pollTimer) {
    pollCount = 0
    pollTimer = setInterval(() => {
      pollCount++
      if (pollCount >= MAX_POLL_COUNT) {
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

// ── 文件上传 — 前端直传 OSS ──
async function onFileSelected(e) {
  const file = e.target.files[0]
  if (!file) return

  uploading.value = true
  try {
    const pRes = await fetch('/api/recordings/oss-policy')
    const pData = await pRes.json()
    if (!pData.success) throw new Error('获取上传凭证失败')

    const { host, ossObjectName, OSSAccessKeyId, policy, signature } = pData.policy

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

// ── Markdown → HTML 渲染 (v8.0 八维度报告) ──
function renderReport(md) {
  if (!md) return ''

  // 如果存的是旧版 JSON（向后兼容），转 Markdown 显示
  let text = md
  try {
    const parsed = JSON.parse(md)
    if (parsed && typeof parsed === 'object') {
      text = JSON.stringify(parsed, null, 2)
      // 旧版 JSON → 尝试格式化
      return renderLegacyJson(parsed)
    }
  } catch {
    // 不是 JSON，就是 Markdown
    text = md
  }

  return renderMarkdown(text)
}

function renderMarkdown(md) {
  let html = escapeHtml(md)

  // ★ 表格（必须先处理，避免内部元素被后续规则干扰）
  html = html.replace(/\n\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g, (_, header, body) => {
    const hCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `\n<table class="rpt-table"><thead><tr>${hCells}</tr></thead><tbody>${rows}</tbody></table>\n`
  })

  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h5 class="rpt-h5">$1</h5>')
  html = html.replace(/^### (.+)$/gm, '<h4 class="rpt-h4">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="rpt-h3">$1</h3>')

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="rpt-code">$1</code>')

  // 分隔线
  html = html.replace(/^---+$/gm, '<hr class="rpt-hr">')

  // 无序列表
  html = html.replace(/^(\s*)- (.+)$/gm, (_, indent, content) => {
    const depth = Math.floor(indent.length / 2)
    const pad = '  '.repeat(depth)
    return `${pad}<li>${content}</li>`
  })

  // 有序列表
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, (_, indent, content) => {
    const depth = Math.floor(indent.length / 2)
    const pad = '  '.repeat(depth)
    return `${pad}<li>${content}</li>`
  })

  // 段落包装：连续的非标签行
  html = html.replace(/\n\n+/g, '</p><p class="rpt-p">')
  html = '<p class="rpt-p">' + html + '</p>'

  // 清理空段落
  html = html.replace(/<p class="rpt-p"><\/p>/g, '')
  html = html.replace(/<p class="rpt-p">(\s*<br>\s*)*<\/p>/g, '')

  return html
}

// 旧版 JSON 降级渲染
function renderLegacyJson(data) {
  const d = data.data_points || {}
  const q = data.analysis_questions || {}
  const labels = { q1_real_demand: '💡 核心诉求', q2_proposed_solutions: '⚔️ 破局方案', q3_missed_opportunities: '⚠️ 遗漏机会', q4_business_loss: '📉 商业定损' }
  let h = `<div class="rpt-header"><span class="rpt-stat">💡 需求信号: <b>${d.client_opportunities_count ?? '?'}</b></span><span class="rpt-stat">🎯 成功捕捉: <b>${d.consultant_caught_count ?? '?'}</b></span></div>`
  for (const [k, v] of Object.entries(q)) {
    h += `<div class="rpt-card"><div class="rpt-card-title">${labels[k] || k}</div>`
    if (typeof v === 'object' && v !== null) {
      if (v.summary) h += `<p class="rpt-summary">${escapeHtml(v.summary)}</p>`
      if (v.evidence?.length) {
        h += '<div class="rpt-evidence-list">'
        for (const e of v.evidence) h += `<blockquote class="rpt-quote">「${escapeHtml(e.quote || e)}」</blockquote>`
        h += '</div>'
      }
    }
    h += '</div>'
  }
  return h
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
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

/* ★ 转写区头部：标题 + 幽灵按钮 */
.rec-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.rec-section-title { font-size: 14px; font-weight: 700; color: #475569; }
.rec-ghost-btn {
  padding: 4px 12px; border: 1px solid #cbd5e1; border-radius: 6px;
  background: transparent; color: #64748b; font-size: 12px; cursor: pointer;
  transition: all .15s;
}
.rec-ghost-btn:hover { border-color: #2563eb; color: #2563eb; }
.rec-ghost-btn.rec-ghost-active { border-color: #2563eb; background: #eff6ff; color: #2563eb; font-weight: 600; }

/* ★ 转写文本（支持行内结构化渲染） */
.rec-transcript {
  font-size: 13px; line-height: 1.8; color: #334155;
  background: #f8fafc; padding: 10px; border-radius: 8px;
  max-height: 300px; overflow-y: auto;
}
.rec-transcript :deep(.trl-line) { margin-bottom: 2px; }
.rec-transcript :deep(.trl-time) { color: #94a3b8; font-size: 11px; font-family: monospace; }
.rec-transcript :deep(.trl-speaker) { font-weight: 600; color: #2563eb; }

/* ★ 分析报告 Markdown 渲染 (v8.0) */
.rec-report {
  font-size: 13px; line-height: 1.8; color: #1e293b;
  background: #f0fdf4; padding: 12px 16px; border-radius: 8px;
  max-height: 500px; overflow-y: auto;
}
.rec-report :deep(.rpt-h3) { font-size: 15px; font-weight: 700; color: #15803d; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #bbf7d0; }
.rec-report :deep(.rpt-h4) { font-size: 14px; font-weight: 700; color: #16a34a; margin: 12px 0 4px; }
.rec-report :deep(.rpt-h5) { font-size: 13px; font-weight: 600; color: #22c55e; margin: 8px 0 4px; }
.rec-report :deep(.rpt-p) { margin-bottom: 8px; }
.rec-report :deep(.rpt-code) { background: #dcfce7; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: monospace; }
.rec-report :deep(.rpt-hr) { border: none; border-top: 1px solid #86efac; margin: 12px 0; }
.rec-report :deep(.rpt-table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
.rec-report :deep(.rpt-table th) { background: #166534; color: #fff; padding: 6px 10px; text-align: left; font-weight: 600; }
.rec-report :deep(.rpt-table td) { padding: 5px 10px; border-bottom: 1px solid #dcfce7; }
.rec-report :deep(.rpt-table tr:nth-child(even) td) { background: #f0fdf4; }
.rec-report :deep(strong) { color: #0f172a; }
.rec-report :deep(li) { margin-bottom: 2px; }

.rec-error-box { background: #fef2f2; padding: 10px; border-radius: 8px; }
.rec-error { font-size: 13px; color: #dc2626; }
</style>

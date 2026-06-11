<template>
  <div class="oss-admin">
    <header class="page-header">
      <h2 class="page-title">📄 ASR 转写文档</h2>
      <p class="page-desc">火山引擎转写后的文本文件</p>
    </header>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="prefix-selector">
        <label class="toolbar-label">目录：</label>
        <select v-model="prefix" @change="loadFileList" class="form-select">
          <option value="transcripts/">📄 转写文档</option>
          <option value="asr-temp/">🎵 原始录音</option>
        </select>
      </div>
      <div class="toolbar-actions">
        <span class="file-count">共 {{ files.length }} 个文件</span>
        <button class="btn-refresh" @click="loadFileList">🔄 刷新</button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid" v-if="stats">
      <div class="stat-card" v-for="(info, key) in stats" :key="key">
        <span class="stat-label">{{ key }}</span>
        <span class="stat-value">{{ info.count }} 个文件</span>
        <span class="stat-sub">{{ formatSize(info.totalSize) }}</span>
      </div>
    </div>

    <!-- 文件表格 -->
    <div class="card">
      <table class="file-table" v-if="files.length">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>最后修改</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in files" :key="f.name">
            <td class="file-name-cell">
              <span class="file-icon">{{ isText(f.name) ? '📄' : '🎵' }}</span>
              <span class="file-name">{{ f.name }}</span>
            </td>
            <td>{{ formatSize(f.size) }}</td>
            <td>{{ formatDate(f.lastModified) }}</td>
            <td class="actions-cell">
              <button class="btn-download" @click="downloadFile(f)">⬇ 下载</button>
              <button class="btn-preview" v-if="isAudio(f.name)" @click="previewFile(f)">▶ 预览</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">
        <span class="empty-icon">📭</span>
        <p>该目录下暂无文件</p>
      </div>
    </div>

    <!-- 音频预览 -->
    <div v-if="previewUrl" class="preview-bar">
      <h4>🎧 正在预览：{{ previewName }}</h4>
      <audio :src="previewUrl" controls autoplay class="audio-player"></audio>
      <button class="btn-close" @click="previewUrl = ''">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const BASE = import.meta.env.VITE_API_BASE || ''

const prefix = ref('transcripts/')
const files = ref([])
const stats = ref(null)
const loading = ref(false)
const previewUrl = ref('')
const previewName = ref('')

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN')
}

function isAudio(name) {
  return /\.(mp3|wav|m4a|ogg|flac)$/i.test(name)
}

async function loadFileList() {
  loading.value = true
  try {
    const res = await fetch(`${BASE}/api/oss-admin/list?prefix=${encodeURIComponent(prefix.value)}`)
    const data = await res.json()
    if (data.success) {
      files.value = data.files || []
    }
  } catch (e) {
    console.error('加载文件列表失败:', e)
  } finally {
    loading.value = false
  }
}

async function downloadFile(file) {
  try {
    // OSS list 接口已经在 url 字段中附带了签名 URL
    if (file.url) {
      window.open(file.url, '_blank')
      return
    }

    // fallback: 单独请求签名 URL
    const res = await fetch(`${BASE}/api/oss-admin/download?key=${encodeURIComponent(file.name)}`)
    const data = await res.json()
    if (data.success && data.url) {
      window.open(data.url, '_blank')
    }
  } catch (e) {
    console.error('下载失败:', e)
  }
}

function previewFile(file) {
  previewName.value = file.name
  // OSS list 的 url 已经是签名 URL，含 10 分钟有效期
  if (file.url) {
    previewUrl.value = file.url
  }
}

async function loadStats() {
  try {
    const res = await fetch(`${BASE}/api/oss-admin/stats`)
    const data = await res.json()
    if (data.success) {
      stats.value = data.stats
    }
  } catch { /* stats 是管理员功能，失败不报错 */ }
}

onMounted(() => {
  loadFileList()
  loadStats()
})
</script>

<style scoped>
.oss-admin {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
}
.page-desc {
  font-size: 14px;
  color: var(--text2);
  margin-top: 4px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.prefix-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-label {
  font-size: 13px;
  color: var(--text2);
  white-space: nowrap;
}
.form-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.file-count {
  font-size: 13px;
  color: var(--text2);
}
.btn-refresh {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-refresh:hover {
  background: var(--primary-light);
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-label {
  font-size: 12px;
  color: var(--text2);
  text-transform: uppercase;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.stat-sub {
  font-size: 12px;
  color: var(--text2);
}

/* 卡片/表格 */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.file-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.file-table th, .file-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.file-table th {
  font-weight: 600;
  color: var(--text2);
  font-size: 11px;
  text-transform: uppercase;
  background: var(--bg);
}
.file-table tr:hover td {
  background: #f8fafc;
}
.file-table tr:last-child td {
  border-bottom: none;
}
.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-icon {
  font-size: 16px;
}
.file-name {
  word-break: break-all;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}
.actions-cell {
  display: flex;
  gap: 8px;
}
.btn-download, .btn-preview {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-download:hover {
  background: var(--primary-light);
  color: var(--primary);
  border-color: var(--primary);
}
.btn-preview:hover {
  background: #dcfce7;
  color: var(--success);
  border-color: var(--success);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text2);
}
.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

/* 预览条 */
.preview-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-card);
  border-top: 2px solid var(--primary);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 100;
}
.preview-bar h4 {
  font-size: 13px;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}
.audio-player {
  flex: 1;
  height: 36px;
}
.btn-close {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
}
.btn-close:hover {
  background: #fee2e2;
  color: #dc2626;
}
</style>

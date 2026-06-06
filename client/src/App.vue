<template>
  <router-view />

  <!-- v4.0: 浮动上传进度条 -->
  <div v-if="uploadStore.hasActive" class="app-upload-bar"
    @click="activeUpload && showActiveUpload()">
    <div class="aub-inner">
      <div class="aub-progress">
        <div class="aub-fill" :style="{ width: (activeUpload?.progress || 0) + '%' }"></div>
      </div>
      <span class="aub-file">{{ activeUpload?.fileName || '上传中...' }}</span>
      <span class="aub-pct">{{ activeUpload?.progress || 0 }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUploadStore } from './stores/uploadStore'

const uploadStore = useUploadStore()
const activeUpload = computed(() => uploadStore.activeUpload)

// 点击浮动条时的占位（未来可跳转到对应页面）
function showActiveUpload() {
  // 不做跳转，避免干扰用户操作
}
</script>

<style>
/* ─ Global styles ─ */
:root {
  --primary: #2563eb;
  --primary-light: #dbeafe;
  --success: #16a34a;
  --warning: #f59e0b;
  --danger: #dc2626;
  --bg: #f8fafc;
  --bg-card: #fff;
  --text: #1e293b;
  --text2: #64748b;
  --border: #e2e8f0;
}
body {
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

/* ─ v4.0: Floating upload bar ─ */
.app-upload-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 5000;
  background: rgba(15,23,42,0.9);
  padding: 10px 16px;
  cursor: pointer;
}
.aub-inner {
  display: flex; align-items: center; gap: 12px;
  max-width: 600px; margin: 0 auto;
}
.aub-progress {
  flex: 1; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px;
  overflow: hidden;
}
.aub-fill {
  height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1);
  border-radius: 3px; transition: width 0.3s;
}
.aub-file {
  font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 180px;
}
.aub-pct {
  font-size: 13px; font-weight: 600; color: #3b82f6; min-width: 36px; text-align: right;
}
</style>

<template>
  <Teleport to="body">
    <div class="pm-overlay" @click.self="$emit('close')">
      <div class="pm-container">
        <!-- 顶部栏 -->
        <div class="pm-topbar">
          <button class="pm-back" @click="$emit('close')">← 返回</button>
          <span class="pm-title">{{ guestName }} · 手机照 ({{ prePhotos.length + postPhotos.length }}/16)</span>
          <span class="pm-spacer"></span>
        </div>

        <!-- 4×4宫格 -->
        <div class="pm-grid">
          <div
            v-for="idx in 16"
            :key="idx"
            class="pm-slot"
            :class="{ filled: !!slotPhoto(idx-1), empty: !slotPhoto(idx-1) }"
            @click="onSlotClick(idx - 1)"
          >
            <!-- 已填充：缩略图 + 类型标签 -->
            <template v-if="slotPhoto(idx-1)">
              <img
                :src="`/photos/${slotPhoto(idx-1).thumb_path}`"
                :alt="slotPhoto(idx-1).photo_type"
                class="pm-thumb"
                loading="lazy"
                @load="onImageLoad(idx - 1)"
                @error="onImageError(idx - 1)"
              />
              <!-- 上传中遮罩：缩略图正在浏览器加载中 -->
              <div v-if="uploadingSlot === idx - 1" class="pm-loading-overlay">
                <div class="pm-spinner"></div>
              </div>
              <span class="pm-tag" :class="slotPhoto(idx-1).photo_type">
                {{ slotPhoto(idx-1).photo_type === 'pre' ? '术前' : '术后' }}
              </span>
            </template>
            <!-- 空位 -->
            <template v-else>
              <!-- 上传中：环形进度 -->
              <div v-if="uploadingSlot === idx - 1" class="pm-placeholder">
                <div class="pm-spinner"></div>
                <span class="pm-plus" style="font-size:12px">上传中</span>
              </div>
              <!-- 术前 1-6：占位符 + "术前" -->
              <div v-else-if="idx <= 6" class="pm-placeholder">
                <img :src="`/placeholder-${idx}.jpg`" class="pm-placeholder-img" />
                <span class="pm-plus">术前</span>
              </div>
              <!-- 术前 7-8：纯文字"其他" -->
              <div v-else-if="idx <= 8" class="pm-placeholder pm-placeholder-text">
                <span class="pm-label">其他</span>
              </div>
              <!-- 术后 9-14：占位符 + "术后" -->
              <div v-else-if="idx <= 14" class="pm-placeholder">
                <img :src="`/placeholder-${idx - 8}.jpg`" class="pm-placeholder-img" />
                <span class="pm-plus">术后</span>
              </div>
              <!-- 术后 15-16：纯文字"其他" -->
              <div v-else class="pm-placeholder pm-placeholder-text post">
                <span class="pm-label">其他</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 底部：不占空间 -->
        <div class="pm-footer"></div>

        <!-- 拍照/上传选择弹窗 -->
        <div v-if="showSlotPicker" class="pm-modal" @click.self="showSlotPicker = false">
          <div class="pm-modal-box">
            <h3>{{ slotPickerType === 'pre' ? '🔴 术前照' : '🟢 术后照' }}</h3>
            <button class="pm-type-btn cam" @click="pickSlotAction('camera')">📷 拍照</button>
            <button class="pm-type-btn upload" @click="pickSlotAction('gallery')">📁 上传</button>
            <button class="pm-type-btn cancel" @click="showSlotPicker = false">取消</button>
          </div>
        </div>

        <!-- 大图预览 -->
        <div v-if="previewPhoto" class="pm-preview" @click.self="previewPhoto = null">
          <button class="pp-close" @click="previewPhoto = null">✕</button>
          <button class="pp-delete" @click="doDelete(previewPhoto)">🗑</button>
          <img
            :src="`/photos/${previewPhoto.file_path}`"
            class="pp-image"
            @touchstart="onTouchStart"
            @touchend="onTouchEnd"
          />
          <div class="pp-nav">
            <button @click="prevPreview" :disabled="previewIdx === 0">◀</button>
            <span>{{ previewIdx + 1 }} / {{ allPhotos.length }}</span>
            <button @click="nextPreview" :disabled="previewIdx >= allPhotos.length - 1">▶</button>
          </div>
        </div>

        <!-- 加载提示 -->
        <div v-if="uploading" class="pm-loading">上传中...</div>

        <!-- 摄像头取景 (全屏) -->
        <div v-if="cameraState !== 'idle'" class="pm-camera">
          <video
            v-show="cameraState === 'live'"
            ref="videoRef"
            class="pm-camera-video"
            autoplay playsinline muted
          ></video>
          <img
            v-if="cameraState === 'review'"
            :src="capturedDataUrl"
            class="pm-camera-video"
          />
          <!-- 拍照按钮 -->
          <button
            v-if="cameraState === 'live'"
            class="pm-capture-btn"
            @click="doCapture"
          ></button>
          <!-- 重拍 / 确定 -->
          <div v-if="cameraState === 'review'" class="pm-review-bar">
            <button class="pm-review-btn retake" @click="doRetake">重拍</button>
            <button class="pm-review-btn confirm" @click="doConfirm">确定</button>
          </div>
          <!-- 关闭 -->
          <button class="pm-camera-close" @click="closeCamera">✕</button>
        </div>

        <!-- 隐藏的控件 -->
        <input ref="fileInput" type="file" accept="image/*" class="pm-hidden-input" @change="onFileSelected" />
        <video class="pm-hidden-video" autoplay playsinline></video>
        <canvas ref="canvasRef" class="pm-hidden-canvas"></canvas>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { uploadPhoto, createThumbnail, listPhotos, deletePhoto } from '../api/photo';

const props = defineProps({
  visitId: { type: Number, required: true },
  guestName: { type: String, required: true }
});

defineEmits(['close']);

// ── 状态 ──
const rawPhotos = ref([]);
const uploading = ref(false);
const uploadingSlot = ref(-1);        // -1=无, 0-15=正在上传的槽位
const currentSlotIdx = ref(-1);       // 当前操作的槽位索引
const showSlotPicker = ref(false);    // 拍照/上传选择弹窗
const slotPickerType = ref('pre');    // 当前槽位类型
const pendingMode = ref(null);
const pendingType = ref('pre');
const previewPhoto = ref(null);
const previewIdx = ref(0);
const fileInput = ref(null);
const videoRef = ref(null);
const canvasRef = ref(null);
const cameraState = ref('idle');
const capturedDataUrl = ref('');
let capturedFile = null;
let currentStream = null;            // ★ 局部追踪，不用模块级 stream
let touchStartX = 0;

// ── 分组 ──
const prePhotos = computed(() =>
  rawPhotos.value.filter(p => p.photo_type === 'pre').sort((a, b) => a.created_at - b.created_at)
);
const postPhotos = computed(() =>
  rawPhotos.value.filter(p => p.photo_type === 'post').sort((a, b) => a.created_at - b.created_at)
);
const allPhotos = computed(() => [...prePhotos.value, ...postPhotos.value]);

// 槽位映射：0-7→术前，8-15→术后
function slotPhoto(slotIdx) {
  if (slotIdx < 8) {
    return prePhotos.value[slotIdx] || null;
  } else {
    return postPhotos.value[slotIdx - 8] || null;
  }
}

// ── 生命周期 ──
onMounted(async () => { await refreshPhotos(); });
onUnmounted(() => { if (currentStream) currentStream.getTracks().forEach(t => t.stop()); });

async function refreshPhotos() {
  try {
    const result = await listPhotos(props.visitId);
    if (result.success) rawPhotos.value = result.photos || [];
  } catch (e) { console.error('load photos error:', e); }
}

// ── 槽位点击 ──
function onSlotClick(idx) {
  const photo = slotPhoto(idx);
  if (photo) {
    previewIdx.value = allPhotos.value.findIndex(p => p.id === photo.id);
    previewPhoto.value = photo;
  } else {
    const type = idx < 8 ? 'pre' : 'post';
    const count = type === 'pre' ? prePhotos.value.length : postPhotos.value.length;
    if (count >= 8) return;
    pendingType.value = type;
    slotPickerType.value = type;
    currentSlotIdx.value = idx;
    showSlotPicker.value = true;
  }
}

function pickSlotAction(mode) {
  showSlotPicker.value = false;
  pendingMode.value = mode;
  if (mode === 'camera') {
    openCamera();
  } else {
    fileInput.value?.click();
  }
}

// ── 摄像头 ──
async function openCamera() {
  cameraState.value = 'live';
  await nextTick();  // ★ 等待 DOM 渲染 video 元素

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }
    });
  } catch {
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
      alert('无法访问摄像头，请检查权限设置');
      cameraState.value = 'idle';
      return;
    }
  }
  if (videoRef.value) {
    videoRef.value.srcObject = currentStream;
    try { await videoRef.value.play(); } catch {}
  }
}

async function doCapture() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  capturedDataUrl.value = canvas.toDataURL('image/jpeg', 0.9);

  // ★ await toBlob — 确保 capturedFile 在进入审核模式前已有值
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  capturedFile = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

  // 阅后即焚
  canvas.width = 0;
  canvas.height = 0;

  if (video) video.pause();
  cameraState.value = 'review';
}

function doRetake() {
  capturedDataUrl.value = '';
  capturedFile = null;
  cameraState.value = 'live';
  if (videoRef.value) videoRef.value.play();
}

async function doConfirm() {
  if (!capturedFile) {
    alert('照片处理中，请稍后再试');
    return;
  }
  const file = capturedFile;  // ★ 先保存引用
  closeCamera();
  await processAndUpload(file);
}

function closeCamera() {
  cameraState.value = 'idle';
  capturedDataUrl.value = '';
  capturedFile = null;
  if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
}

// ── 文件选择 ──
async function onFileSelected(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  if (!pendingType.value) return;
  await processAndUpload(files[0]);
  e.target.value = '';  // ★ iOS 安全：等上传完成再清空
}

// ── 上传 ──
async function processAndUpload(file) {
  if (!pendingType.value) return;
  const type = pendingType.value;
  const count = type === 'pre' ? prePhotos.value.length : postPhotos.value.length;
  if (count >= 8) { alert(`${type === 'pre' ? '术前' : '术后'}已满8张`); return; }
  uploading.value = true;
  uploadingSlot.value = currentSlotIdx.value;
  try {
    if (!file || !(file instanceof Blob)) {
      throw new Error('图片数据无效，请重拍');
    }
    const thumbBlob = await createThumbnail(file, 300);
    if (!thumbBlob) throw new Error('缩略图生成失败');
    const result = await uploadPhoto(file, thumbBlob, props.visitId, type);
    if (result.success) {
      await refreshPhotos();
      // ★ 不清除 uploadingSlot —— 等 @load 事件触发后由 onImageLoad 清除
    } else {
      uploadingSlot.value = -1;  // 失败立即清除
      alert(result.error || '上传失败');
    }
  } catch (e) {
    console.error('upload error:', e);
    uploadingSlot.value = -1;  // 异常立即清除
    alert(e.message || '上传失败');
  } finally {
    uploading.value = false;
    // ★★ 不在 finally 清除 uploadingSlot —— 缩略图 <img> 还在浏览器下载中
    // onImageLoad(idx) 会在图片实际渲染后清除
  }
}

// ★ 缩略图加载完成：清除上传遮罩
function onImageLoad(idx) {
  if (uploadingSlot.value === idx) {
    uploadingSlot.value = -1;
  }
}
function onImageError(idx) {
  if (uploadingSlot.value === idx) {
    uploadingSlot.value = -1;
  }
}

// ── 预览导航 ──
function prevPreview() {
  if (previewIdx.value > 0) {
    previewIdx.value--;
    previewPhoto.value = allPhotos.value[previewIdx.value];
  }
}
function nextPreview() {
  if (previewIdx.value < allPhotos.value.length - 1) {
    previewIdx.value++;
    previewPhoto.value = allPhotos.value[previewIdx.value];
  }
}
function onTouchStart(e) { touchStartX = e.touches[0].clientX; }
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (dx > 60) prevPreview();
  else if (dx < -60) nextPreview();
}

// ── 删除 ──
async function doDelete(photo) {
  if (!confirm('确认删除这张照片？')) return;
  try {
    await deletePhoto(photo.id);
    previewPhoto.value = null;
    await refreshPhotos();
  } catch (e) { alert(e.message || '删除失败'); }
}
</script>

<style scoped>
/* ── Overlay ── */
.pm-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; }
.pm-container { width: 100%; max-width: 480px; height: 100%; display: flex; flex-direction: column; background: #111; color: #fff; }

/* ── Top bar ── */
.pm-topbar { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #333; flex-shrink: 0; }
.pm-back { background: none; border: none; color: #60a5fa; font-size: 16px; cursor: pointer; }
.pm-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; }
.pm-spacer { width: 60px; }

/* ── Grid 4×4 ── */
.pm-grid {
  flex: 1; overflow-y: auto;
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; padding: 12px;
}
.pm-slot {
  aspect-ratio: 1; border-radius: 8px; overflow: hidden;
  position: relative; cursor: pointer;
  background: #1a1a1a; border: 1px dashed #444;
  display: flex; align-items: center; justify-content: center;
}
.pm-slot.filled { border: 1px solid #333; }
.pm-thumb { width: 100%; height: 100%; object-fit: cover; }
.pm-tag { position: absolute; bottom: 4px; right: 4px; font-size: 10px; padding: 2px 6px; border-radius: 4px; color: #fff; font-weight: 600; }
.pm-tag.pre { background: rgba(239,68,68,0.85); }
.pm-tag.post { background: rgba(34,197,94,0.85); }

/* ── Placeholder ── */
.pm-placeholder { width: 100%; height: 100%; position: relative; }
.pm-placeholder-img { width: 100%; height: 100%; object-fit: cover; opacity: 0.3; }
.pm-plus {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
.pm-placeholder-text { display: flex; align-items: center; justify-content: center; }
.pm-placeholder-text.post { border-color: rgba(34,197,94,0.3); }
.pm-label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.5); }
.pm-placeholder-text.post .pm-label { color: rgba(34,197,94,0.5); }

/* ── Footer ── */
.pm-footer { flex-shrink: 0; min-height: 8px; border-top: 1px solid #333; background: #111; }

/* ── Spinner ── */
.pm-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255,255,255,0.15);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: pm-spin 0.8s linear infinite;
}
@keyframes pm-spin { to { transform: rotate(360deg); } }

/* ── Loading overlay on filled slots ── */
.pm-loading-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 2;
}

/* ── Modal ── */
.pm-modal { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; }
.pm-modal-box { background: #1e1e1e; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 12px; min-width: 240px; text-align: center; }
.pm-modal-box h3 { margin: 0; color: #fff; font-size: 18px; }
.pm-type-btn { padding: 14px; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; color: #fff; }
.pm-type-btn:disabled { opacity: 0.4; }
.pm-type-btn.pre { background: #dc2626; }
.pm-type-btn.post { background: #16a34a; }
.pm-type-btn.cancel { background: #444; }
.pm-type-btn.cam { background: #2563eb; }
.pm-type-btn.upload { background: #6366f1; }

/* ── Preview ── */
.pm-preview { position: fixed; inset: 0; z-index: 10002; background: rgba(0,0,0,0.96); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.pp-close { position: absolute; top: 16px; right: 16px; background: rgba(0,0,0,0.6); border: none; color: #fff; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; z-index: 1; }
.pp-delete { position: absolute; top: 16px; right: 70px; background: rgba(0,0,0,0.6); border: none; color: #fff; font-size: 20px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; z-index: 1; }
.pp-image { max-width: 95%; max-height: 75vh; object-fit: contain; border-radius: 4px; }
.pp-nav { display: flex; align-items: center; gap: 16px; margin-top: 16px; color: #fff; }
.pp-nav button { background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 20px; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
.pp-nav button:disabled { opacity: 0.3; }

/* ── Loading ── */
.pm-loading { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #fff; padding: 8px 20px; border-radius: 20px; font-size: 14px; z-index: 10000; }

/* ── Camera ── */
.pm-camera {
  position: fixed; inset: 0; z-index: 10003;
  background: #000;
  display: flex; align-items: center; justify-content: center;
}
.pm-camera-video {
  width: 100%; height: 100%; object-fit: cover;
}
.pm-capture-btn {
  position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
  width: 72px; height: 72px; border-radius: 50%;
  border: 4px solid #fff; background: rgba(255,255,255,0.25);
  cursor: pointer;
}
.pm-capture-btn:active { background: rgba(255,255,255,0.5); }
.pm-review-bar {
  position: absolute; bottom: 40px; left: 0; right: 0;
  display: flex; justify-content: space-evenly;
}
.pm-review-btn {
  padding: 14px 32px; border-radius: 12px; border: none;
  font-size: 18px; font-weight: 600; cursor: pointer; color: #fff;
}
.pm-review-btn.retake { background: rgba(255,255,255,0.2); }
.pm-review-btn.confirm { background: #16a34a; }
.pm-camera-close {
  position: absolute; top: 16px; right: 16px;
  background: rgba(0,0,0,0.5); border: none; color: #fff;
  font-size: 22px; width: 40px; height: 40px;
  border-radius: 50%; cursor: pointer; z-index: 1;
}

/* ── Hidden ── */
.pm-hidden-input, .pm-hidden-video, .pm-hidden-canvas { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
</style>

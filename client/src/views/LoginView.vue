<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Header -->
      <div class="login-header">
        <h2 class="login-title">长盈</h2>
        <p class="login-subtitle">院内求美者雷达系统</p>
      </div>

      <!-- Unified Login Form -->
      <div class="login-form">
        <!-- Staff Dropdown -->
        <label class="form-label">选择人员</label>
        <div class="select-wrapper">
          <select
            v-model="selectedStaffId"
            class="form-select"
            @change="onStaffChange"
          >
            <option value="" disabled>请选择人员</option>
            <optgroup v-for="group in groupedStaff" :key="group.label" :label="group.label">
              <option
                v-for="s in group.staff"
                :key="s.id"
                :value="s.id"
              >
                {{ s.name }}{{ s.department ? ' · ' + s.department : '' }}
              </option>
            </optgroup>
          </select>
          <span class="select-arrow">▾</span>
        </div>

        <!-- PIN Input (only if selected staff has pin set) -->
        <div v-if="needsPin" class="form-group">
          <label class="form-label">PIN 码</label>
          <input
            ref="pinInput"
            v-model="pin"
            type="password"
            class="form-input"
            placeholder="请输入PIN码"
            maxlength="6"
            autocomplete="off"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- No-PIN hint -->
        <p v-if="selectedStaffId && !needsPin" class="no-pin-hint">
          💡 该账号未设置PIN码，可直接登录
        </p>

        <!-- Error message -->
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <!-- Login Button -->
        <button
          class="login-btn"
          :disabled="!canLogin || loading"
          @click="handleLogin"
        >
          <span v-if="loading" class="spinner"></span>
          <span v-else>登 录</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const authStore = useAuthStore()
const { send } = useWebSocket()

// === Role → route mapping (all roles use unified view)
const roleRouteMap = {
  nurse:     '/unified',
  assistant: '/unified',
  doctor:    '/unified',
  manager:   '/unified',
  reception: '/unified',
  admin:     '/unified'  // v3.0: admin 也进主屏，通过 📊 进Dashboard、通过 ⚙ 进管理面板
}

// === Role display labels ===
const roleLabels = {
  nurse:     '护士',
  assistant: '医助',
  doctor:    '医生',
  manager:   '主管',
  reception: '前台',
  admin:     '管理员'
}

function roleLabel(role) {
  return roleLabels[role] || role
}

// === State ===
const selectedStaffId = ref('')
const pin = ref('')
const staffList = ref([])
const loading = ref(false)
const errorMsg = ref('')
const pinInput = ref(null)

// === Computed ===
const selectedStaff = computed(() =>
  staffList.value.find(s => s.id === selectedStaffId.value) || null
)

const needsPin = computed(() => {
  const s = selectedStaff.value
  return s && s.pin != null && s.pin !== ''
})

// ★ 按角色分组，方便登录查找
const groupedStaff = computed(() => {
  const roleOrder = ['admin', 'manager', 'doctor', 'assistant', 'nurse', 'reception']
  const groups = {}
  for (const s of staffList.value) {
    const key = s.role
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return roleOrder
    .filter(r => groups[r]?.length)
    .map(r => ({ label: roleLabels[r] || r, staff: groups[r] }))
})

const canLogin = computed(() => {
  if (!selectedStaffId.value) return false
  // If staff has pin, pin must be entered
  if (needsPin.value) return pin.value.trim().length > 0
  // No pin needed — can login directly
  return true
})

// === Methods ===
function onStaffChange() {
  errorMsg.value = ''
  pin.value = ''

  // Focus PIN input if needed
  if (needsPin.value) {
    nextTick(() => pinInput.value?.focus())
  }
}

async function handleLogin() {
  if (!canLogin.value || loading.value) return

  loading.value = true
  errorMsg.value = ''

  try {
    const payload = {
      staffId: selectedStaffId.value,
      pin: pin.value.trim()
    }

    const res = await send('AUTH_LOGIN', payload)

    if (!res.success) {
      errorMsg.value = res.error || '登录失败'
      return
    }

    // Server returns { payload: { token, staff } }
    const { token, staff } = res.payload
    authStore.login(token, staff, selectedStaffId.value, pin.value.trim())

    // Navigate based on backend-returned role
    const target = roleRouteMap[staff?.role] || '/'
    router.push(target)
  } catch (err) {
    errorMsg.value = err.message || '连接失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function fetchStaffList() {
  try {
    const res = await fetch('/api/staff')
    if (!res.ok) throw new Error('获取人员列表失败')
    const data = await res.json()
    staffList.value = data || []
  } catch (err) {
    console.error('[Login] 获取人员列表失败:', err)
  }
}

// === Lifecycle ===
onMounted(() => {
  fetchStaffList()

  // If already logged in, redirect to role-based route
  if (authStore.isLoggedIn) {
    const target = roleRouteMap[authStore.role] || '/'
    router.push(target)
  }
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8edf5 0%, #dce3f0 100%);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
  padding: 36px 32px 32px;
  overflow: hidden;
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.login-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text, #1e293b);
  letter-spacing: 0.5px;
}

.login-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text2, #64748b);
}

/* Login form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Form elements */
.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text2, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 12px 36px 12px 14px;
  border: 2px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 15px;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  appearance: none;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-select:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.select-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text2, #64748b);
  font-size: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 18px;
  letter-spacing: 6px;
  text-align: center;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  font-family: 'Courier New', monospace;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.form-input::placeholder {
  letter-spacing: 0;
  font-size: 14px;
  font-family: inherit;
}

.no-pin-hint {
  margin: -4px 0 4px;
  font-size: 13px;
  color: var(--text2, #64748b);
  text-align: center;
}

.error-msg {
  margin: -4px 0 4px;
  font-size: 13px;
  color: var(--danger, #dc2626);
  text-align: center;
}

/* Login button */
.login-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  margin-top: 4px;
}

.login-btn:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 480px) {
  .login-card {
    padding: 28px 20px 24px;
    border-radius: 12px;
  }
}
</style>

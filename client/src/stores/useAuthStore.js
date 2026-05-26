import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const staff = ref(JSON.parse(localStorage.getItem('staff') || 'null'))
  const staffId = ref(localStorage.getItem('staffId') || '')
  const pin = ref(localStorage.getItem('pin') || '')
  const isAdmin = ref(false)

  const role = computed(() => staff.value?.role || '')
  const name = computed(() => staff.value?.name || '')
  const isLoggedIn = computed(() => !!token.value)

  function login(t, s, sid, p) {
    token.value = t
    staff.value = s
    staffId.value = sid || ''
    pin.value = p || ''
    localStorage.setItem('token', t)
    localStorage.setItem('staff', JSON.stringify(s))
    if (sid) localStorage.setItem('staffId', sid)
    if (p) localStorage.setItem('pin', p)
  }

  function logout() {
    token.value = ''
    staff.value = null
    staffId.value = ''
    pin.value = ''
    isAdmin.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('staff')
    localStorage.removeItem('staffId')
    localStorage.removeItem('pin')
  }

  function setAdmin(v) {
    isAdmin.value = v
  }

  return { token, staff, staffId, pin, isAdmin, role, name, isLoggedIn, login, logout, setAdmin }
})

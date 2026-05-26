import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useVisitStore = defineStore('visit', () => {
  const visits = ref([])       // 今日所有接诊单
  const rooms = ref([])        // 房间状态

  const activeVisits = computed(() => visits.value.filter(v => !v.closed_at))
  const vipVisits = computed(() => visits.value.filter(v => v.is_vip && !v.closed_at))

  function updateFull(data) {
    if (data.visits) visits.value = data.visits
    if (data.rooms) rooms.value = data.rooms
  }

  function getVisit(id) {
    return visits.value.find(v => v.id === id)
  }

  function getRoomVisits(roomId) {
    return visits.value.filter(v => v.current_room_id === roomId && !v.closed_at)
  }

  return { visits, rooms, activeVisits, vipVisits, updateFull, getVisit, getRoomVisits }
})

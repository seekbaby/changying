import { ref } from 'vue'
import { useVisitStore } from '../stores/useVisitStore'

/**
 * 前端冲突预检（第一道闸）
 * 在护士选房间时，先检查本地快照中的占用情况
 */
export function useConflictGuard() {
  const showConflict = ref(false)
  const conflictInfo = ref(null)

  function checkRoom(roomId, excludeVisitId = null) {
    const visitStore = useVisitStore()
    const room = visitStore.rooms.find(r => r.id === roomId)
    if (!room) return { ok: false, reason: '房间不存在' }

    const occupants = visitStore.visits.filter(
      v => v.current_room_id === roomId && !v.closed_at && v.id !== excludeVisitId
    )

    if (occupants.length >= room.capacity) {
      conflictInfo.value = {
        roomName: room.name,
        occupied: occupants.length,
        capacity: room.capacity,
        occupants: occupants.map(v => ({
          guestName: v.guest_name,
          deadlineAt: v.deadline_at,
          status: v.current_status
        }))
      }
      showConflict.value = true
      return { ok: false, conflict: conflictInfo.value }
    }

    return { ok: true }
  }

  function dismiss() {
    showConflict.value = false
    conflictInfo.value = null
  }

  return { showConflict, conflictInfo, checkRoom, dismiss }
}

/**
 * 冲突检测器 —— 双层防护的第二道闸（服务端原子校验）
 * 检查房间capacity是否超出
 */
const { db } = require('../database/init');

class ConflictDetector {
  /**
   * 检查某房间是否可以再容纳一个客户
   * @param {number} roomId
   * @param {number} excludeVisitId - 排除当前接诊单（换房时不跟自己冲突）
   * @returns {{ ok: boolean, occupied: number, capacity: number, conflicts?: array }}
   */
  checkRoomCapacity(roomId, excludeVisitId = null) {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!room) return { ok: false, reason: '房间不存在' };
    
    const today = new Date().toISOString().slice(0, 10);
    let sql = `SELECT v.*, s.name as nurse_name 
               FROM visits v 
               LEFT JOIN staff s ON v.assigned_nurse_id = s.id
               WHERE v.current_room_id = ? 
               AND v.visit_date = ?
               AND v.closed_at IS NULL`;
    const params = [roomId, today];
    
    if (excludeVisitId) {
      sql += ' AND v.id != ?';
      params.push(excludeVisitId);
    }
    
    const conflicts = db.prepare(sql).all(...params);
    const occupied = conflicts.length;
    
    if (occupied >= room.capacity) {
      return {
        ok: false,
        occupied,
        capacity: room.capacity,
        reason: `房间"${room.name}"已满 (${occupied}/${room.capacity})`,
        conflicts: conflicts.map(c => ({
          visitId: c.id,
          guestName: c.guest_name,
          nurseName: c.nurse_name,
          status: c.current_status
        }))
      };
    }
    
    return { ok: true, occupied, capacity: room.capacity };
  }

  /**
   * 获取所有房间的当前占用状态（用于前端矩阵渲染）
   */
  getRoomStatusAll() {
    const rooms = db.prepare('SELECT * FROM rooms WHERE is_active = 1 ORDER BY sort_order').all();
    return rooms.map(room => {
      const visits = db.prepare(
        `SELECT v.id, v.guest_name, v.current_status, v.status_entered_at, v.deadline_at,
                s.name as nurse_name
         FROM visits v
         LEFT JOIN staff s ON v.assigned_nurse_id = s.id
         WHERE v.current_room_id = ? AND v.closed_at IS NULL`
      ).all(room.id);
      
      return {
        ...room,
        occupied: visits.length,
        visits
      };
    });
  }
}

module.exports = new ConflictDetector();

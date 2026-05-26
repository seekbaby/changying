/**
 * 超时预警触发器
 * 当计时器触发时，标记接诊单、广播ALERT_TIMEOUT事件
 */
const { db } = require('../database/init');

class AlertEngine {
  trigger(visitId, broadcastFn) {
    // 标记已触发
    db.prepare('UPDATE visits SET alert_triggered = 1 WHERE id = ?').run(visitId);
    
    // 获取详细信息
    const visit = db.prepare(`
      SELECT v.*, r.name as room_name
      FROM visits v
      LEFT JOIN rooms r ON v.current_room_id = r.id
      WHERE v.id = ?
    `).get(visitId);
    
    if (!visit) return;
    
    const now = Date.now();
    const overtimeMin = Math.floor((now - visit.deadline_at) / 60000);
    
    broadcastFn('ALERT_TIMEOUT', {
      visitId: visit.id,
      guestName: visit.guest_name,
      roomName: visit.room_name || '未知',
      status: visit.current_status,
      overtimeMin: Math.max(0, overtimeMin)
    });
  }
}

module.exports = new AlertEngine();

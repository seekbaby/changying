/**
 * 内存快照管理 —— 全局状态的读写封装
 * 写DB后同步更新内存Map，广播时从内存读取（零查询延迟）
 */
const { db } = require('../database/init');

class StateSnapshot {
  constructor() {
    this.visits = new Map();  // visitId → visit object
    this.rooms = [];           // 房间状态数组
    this._dirty = false;
  }

  /** 全量刷新（启动时或每日重置时） */
  refresh() {
    const today = new Date().toISOString().slice(0, 10);
    
    // 今日进行中接诊单
    const visits = db.prepare(`
      SELECT v.*, s.name as nurse_name, a.name as assistant_name, sd.name as current_doctor_name
      FROM visits v
    LEFT JOIN staff s ON v.assigned_nurse_id = s.id
    LEFT JOIN staff a ON v.assigned_assistant_id = a.id
    LEFT JOIN staff sd ON v.current_doctor_id = sd.id
    WHERE v.visit_date = ? AND v.closed_at IS NULL
    `).all(today);
    
    this.visits.clear();
    for (const v of visits) {
      this.visits.set(v.id, v);
    }
    
    // 房间状态
    const rooms = db.prepare('SELECT * FROM rooms WHERE is_active = 1 ORDER BY sort_order').all();
    this.rooms = rooms.map(room => {
      const roomVisits = visits.filter(v => v.current_room_id === room.id);
      return {
        ...room,
        occupied: roomVisits.length,
        visitIds: roomVisits.map(v => v.id)
      };
    });
    
    this._dirty = false;
  }

  /** 更新单个接诊单（状态变更后调用） */
  updateVisit(visit) {
    this.visits.set(visit.id, visit);
    this._dirty = true;
  }

  /** 移除离院接诊单 */
  removeVisit(visitId) {
    this.visits.delete(visitId);
    this._dirty = true;
  }

  /** 获取全局快照（用于广播） */
  getSnapshot() {
    if (this._dirty) {
      // 重新计算房间占用
      const visits = [...this.visits.values()];
      this.rooms = this.rooms.map(room => {
        const roomVisits = visits.filter(v => v.current_room_id === room.id);
        return { ...room, occupied: roomVisits.length, visitIds: roomVisits.map(v => v.id) };
      });
      this._dirty = false;
    }
    
    return {
      visits: [...this.visits.values()],
      rooms: this.rooms
    };
  }
}

module.exports = new StateSnapshot();

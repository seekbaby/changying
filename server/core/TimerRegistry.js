/**
 * 服务端计时器管理器
 * 为每个有 deadline 的接诊单注册超时检测
 */
class TimerRegistry {
  constructor() {
    this.timers = new Map();  // visitId → { timer, deadline, callback }
    this.checkInterval = setInterval(() => this.tick(), 10000); // 每10秒扫描
  }

  /**
   * 登记一个接诊单的计时器
   * @param {number} visitId
   * @param {number} deadlineAt - Unix毫秒时间戳
   * @param {function} onTimeout - 超时回调
   */
  register(visitId, deadlineAt, onTimeout) {
    this.unregister(visitId);
    
    if (!deadlineAt) return;
    
    const delay = deadlineAt - Date.now();
    if (delay <= 0) {
      // 已经超时，立即触发
      onTimeout(visitId);
      return;
    }
    
    const timer = setTimeout(() => {
      onTimeout(visitId);
      this.timers.delete(visitId);
    }, delay);
    
    this.timers.set(visitId, { timer, deadline: deadlineAt, callback: onTimeout });
  }

  /** 注销某接诊单的计时器 */
  unregister(visitId) {
    const entry = this.timers.get(visitId);
    if (entry) {
      clearTimeout(entry.timer);
      this.timers.delete(visitId);
    }
  }

  /** 定期扫描：发现已触发但未清除的（兜底） */
  tick() {
    const now = Date.now();
    for (const [visitId, entry] of this.timers) {
      if (now >= entry.deadline) {
        clearTimeout(entry.timer);
        entry.callback(visitId);
        this.timers.delete(visitId);
      }
    }
  }

  /** 服务启动时恢复所有进行中接诊单的计时器 */
  recover(broadcastFn) {
    const db = require('../database/init').db;
    const today = new Date().toISOString().slice(0, 10);
    const active = db.prepare(
      `SELECT id, deadline_at FROM visits 
       WHERE visit_date = ? AND closed_at IS NULL AND deadline_at IS NOT NULL AND alert_triggered = 0`
    ).all(today);
    
    for (const v of active) {
      this.register(v.id, v.deadline_at, broadcastFn);
    }
    console.log(`[Timer] 恢复 ${active.length} 个计时器`);
  }

  shutdown() {
    clearInterval(this.checkInterval);
    for (const [, entry] of this.timers) {
      clearTimeout(entry.timer);
    }
    this.timers.clear();
  }
}

module.exports = new TimerRegistry();

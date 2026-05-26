/**
 * Dashboard 运营统计服务 v3.0
 * 
 * 输出三类数据：
 * 1. 时间黑洞 — 超时等待患者（敷麻>50min / 院内等待>30min / 术前等待>15min）
 * 2. 护士接诊量 — 今日/本周每人接诊人数
 * 3. 医生治疗量+时长 — 今日/本周每人治疗人数+累计时长
 */

const { db } = require('../database/init');

class DashboardService {
  getStats() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // ── Week range ──
    const d = new Date();
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7)); // Monday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekStart = monday.toISOString().slice(0, 10);
    const weekEnd = sunday.toISOString().slice(0, 10);

    // ══════ 1. 在院患者（用于时间黑洞计算）══════
    const activeVisits = db.prepare(`
      SELECT v.id, v.guest_name, v.current_status, v.status_entered_at, v.visit_date,
             s.name as nurse_name
      FROM visits v
      LEFT JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.closed_at IS NULL AND v.visit_date = ?
    `).all(today);

    // 时间黑洞阈值（分钟）
    const THRESHOLDS = {
      NUMBING: { limit: 50, label: '敷麻超时', icon: '💉' },
      IN_CLINIC_WAITING: { limit: 30, label: '院内等待', icon: '⏳' },
      PRE_OP_WAITING: { limit: 15, label: '术前等待', icon: '🔪' },
    };

    const timeHoles = {};
    for (const [status, cfg] of Object.entries(THRESHOLDS)) {
      const over = activeVisits
        .filter(v => v.current_status === status)
        .map(v => {
          const elapsed = (now - v.status_entered_at) / 60000;
          return { ...v, elapsed_min: Math.round(elapsed) };
        })
        .filter(v => v.elapsed_min > cfg.limit)
        .sort((a, b) => b.elapsed_min - a.elapsed_min);

      timeHoles[status] = {
        label: cfg.label,
        icon: cfg.icon,
        limitMin: cfg.limit,
        count: over.length,
        patients: over,
      };
    }

    // ══════ 2. 护士接诊统计 ══════
    const nurseToday = db.prepare(`
      SELECT s.id, s.name, COUNT(*) as visit_count
      FROM visits v
      JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.visit_date = ?
      GROUP BY s.id
      ORDER BY visit_count DESC
    `).all(today);

    const nurseWeek = db.prepare(`
      SELECT s.id, s.name, COUNT(*) as visit_count
      FROM visits v
      JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.visit_date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY visit_count DESC
    `).all(weekStart, weekEnd);

    // ══════ 3. 医生治疗统计 ══════
    const doctorToday = db.prepare(`
      SELECT s.id, s.name,
             COUNT(DISTINCT vd.visit_id) as patient_count,
             SUM(CASE WHEN vd.ended_at IS NOT NULL 
                 THEN vd.ended_at - vd.started_at
                 ELSE ? - vd.started_at END) as total_duration_ms
      FROM visit_doctors vd
      JOIN staff s ON vd.doctor_id = s.id
      JOIN visits v ON vd.visit_id = v.id
      WHERE v.visit_date = ?
      GROUP BY s.id
      ORDER BY patient_count DESC
    `).all(now, today);

    const doctorWeek = db.prepare(`
      SELECT s.id, s.name,
             COUNT(DISTINCT vd.visit_id) as patient_count,
             SUM(CASE WHEN vd.ended_at IS NOT NULL 
                 THEN vd.ended_at - vd.started_at
                 ELSE ? - vd.started_at END) as total_duration_ms
      FROM visit_doctors vd
      JOIN staff s ON vd.doctor_id = s.id
      JOIN visits v ON vd.visit_id = v.id
      WHERE v.visit_date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY patient_count DESC
    `).all(now, weekStart, weekEnd);

    return {
      timeHoles,
      nurseStats: { today: nurseToday, week: nurseWeek },
      doctorStats: { today: doctorToday, week: doctorWeek },
      weekRange: { start: weekStart, end: weekEnd },
      today,
      now,
    };
  }
}

module.exports = new DashboardService();

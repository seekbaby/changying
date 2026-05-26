/**
 * 医生操作追踪服务 v2.5
 * 
 * 设计:
 * - 仅 IN_OPERATION 状态时需要指定医生
 * - 医生可中途切换（visit_doctors 表记录多行，每行有 started_at/ended_at）
 * - 离开术中状态时自动关闭当前医生记录
 * - 历史查询返回医生链
 */

const { db } = require('../database/init');

class DoctorService {
  /**
   * 设置/切换治疗医生（v2.5: 独立于状态，任何状态下都可操作）
   * @param {number|null} doctorId — null 表示移除当前医生
   * @returns {{ success, error?, record? }}
   */
  setDoctor(visitId, doctorId) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    if (visit.closed_at) return { success: false, error: '该客户已离院' };

    const now = Date.now();

    // 移除医生（doctorId 为 null）
    if (doctorId === null || doctorId === undefined) {
      db.prepare(`UPDATE visit_doctors SET ended_at = ? WHERE visit_id = ? AND ended_at IS NULL`).run(now, visitId);
      db.prepare(`UPDATE visits SET current_doctor_id = NULL WHERE id = ?`).run(visitId);
      return { success: true };
    }

    const doctor = db.prepare(
      `SELECT * FROM staff WHERE id = ? AND (role = 'doctor' OR (role = 'admin' AND department = '医生')) AND is_active = 1`
    ).get(doctorId);
    if (!doctor) return { success: false, error: '指定的医生不存在' };

    // 关闭当前医生的记录（如果有）
    db.prepare(`UPDATE visit_doctors SET ended_at = ? WHERE visit_id = ? AND ended_at IS NULL`).run(now, visitId);

    // 更新当前医生
    db.prepare(`UPDATE visits SET current_doctor_id = ? WHERE id = ?`).run(doctorId, visitId);

    // 插入新医生记录
    const result = db.prepare(`
      INSERT INTO visit_doctors (visit_id, doctor_id, procedure_name, started_at)
      VALUES (?, ?, '', ?)
    `).run(visitId, doctorId, now);

    const record = db.prepare('SELECT * FROM visit_doctors WHERE id = ?').get(result.lastInsertRowid);
    return { success: true, record };
  }

  /**
   * 离开术中时关闭医生记录（由 advance() 调用）
   */
  closeDoctor(visitId) {
    const now = Date.now();
    db.prepare(`
      UPDATE visit_doctors SET ended_at = ? WHERE visit_id = ? AND ended_at IS NULL
    `).run(now, visitId);
    db.prepare(`UPDATE visits SET current_doctor_id = NULL WHERE id = ?`).run(visitId);
  }

  /**
   * 查某次接诊的医生链
   * @returns [{ doctor_name, procedure_name, started_at, ended_at, duration_ms }]
   */
  getDoctorHistory(visitId) {
    return db.prepare(`
      SELECT vd.*, s.name as doctor_name
      FROM visit_doctors vd
      LEFT JOIN staff s ON vd.doctor_id = s.id
      WHERE vd.visit_id = ?
      ORDER BY vd.started_at
    `).all(visitId).map(r => ({
      ...r,
      duration_ms: r.ended_at ? r.ended_at - r.started_at : Date.now() - r.started_at
    }));
  }

  /**
   * 获取所有医生列表（用于下拉选择）
   * v2.5: 含 admin 角色但部门为"医生"的人员
   */
  getDoctorList() {
    return db.prepare(
      `SELECT id, name, department FROM staff 
       WHERE (role = 'doctor' OR (role = 'admin' AND department = '医生')) 
       AND is_active = 1 ORDER BY name`
    ).all();
  }
}

module.exports = new DoctorService();

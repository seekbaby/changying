/**
 * 备注服务 —— 保证只INSERT不UPDATE
 */
const { db } = require('../database/init');

class NoteService {
  /**
   * 录入治疗方案（强制开单）
   */
  addTreatmentPlan(visitId, plan, emotionTags, authorId, authorRole) {
    // 检查是否已有方案
    const existing = db.prepare(
      "SELECT id FROM visit_notes WHERE visit_id = ? AND note_type = 'treatment_plan'"
    ).get(visitId);
    
    if (existing) {
      return { success: false, error: '治疗方案已录入，不可修改（请追加备注）' };
    }
    
    const now = Date.now();
    const content = JSON.stringify({
      treatment: plan,
      emotions: emotionTags || []
    });
    
    db.prepare(`
      INSERT INTO visit_notes (visit_id, author_id, author_role, note_type, content, created_at)
      VALUES (?, ?, ?, 'treatment_plan', ?, ?)
    `).run(visitId, authorId, authorRole, content, now);
    
    // 同时更新visits.treatment_plan字段（方便前端快速渲染）
    db.prepare('UPDATE visits SET treatment_plan = ? WHERE id = ?').run(plan, visitId);
    
    // 追加情绪标签
    if (emotionTags && emotionTags.length > 0) {
      db.prepare(`
        INSERT INTO visit_notes (visit_id, author_id, author_role, note_type, content, created_at)
        VALUES (?, ?, ?, 'emotion_tag', ?, ?)
      `).run(visitId, authorId, authorRole, JSON.stringify(emotionTags), now);
    }
    
    return { success: true, noteId: db.prepare('SELECT last_insert_rowid() as id').get().id };
  }

  /**
   * 追加普通备注
   */
  addGeneral(visitId, content, authorId, authorRole) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO visit_notes (visit_id, author_id, author_role, note_type, content, created_at)
      VALUES (?, ?, ?, 'general', ?, ?)
    `).run(visitId, authorId, authorRole, content, now);
    
    return { success: true, noteId: db.prepare('SELECT last_insert_rowid() as id').get().id };
  }

  /**
   * 获取某接诊单的完整备注时间线
   */
  getTimeline(visitId) {
    return db.prepare(`
      SELECT n.*, s.name as author_name
      FROM visit_notes n
      LEFT JOIN staff s ON n.author_id = s.id
      WHERE n.visit_id = ? AND n.note_type != 'status_change'
      ORDER BY n.created_at ASC
    `).all(visitId);
  }

  /** 获取状态流转历史（去重提取中文状态链） */
  getStatusHistory(visitId) {
    const rows = db.prepare(`
      SELECT content, created_at FROM visit_notes
      WHERE visit_id = ? AND note_type = 'status_change'
      ORDER BY created_at ASC
    `).all(visitId);
    
    // 从 "ARRIVED_WAITING → DETECTION_PHOTO" 等原始串中提取所有出现过的状态
    const seen = new Set();
    const statuses = [];
    const STATUS_LABEL = {
      ARRIVED_WAITING:'到院等待', DETECTION_PHOTO:'检测拍照', IN_CLINIC_WAITING:'院内等待',
      CONSULTATION:'面诊', PRE_TREATMENT_CARE:'术前护理', NUMBING:'敷麻',
      PRE_OP_WAITING:'术前等待', IN_OPERATION:'术中', POST_TREATMENT_CARE:'术后护理',
      DINING:'用餐', DISCHARGED:'已离院'
    };
    
    for (const row of rows) {
      // 从内容中提取状态码：匹配大写字母和下划线组成的状态名
      const codes = row.content.match(/[A-Z_]{3,}/g) || [];
      for (const code of codes) {
        const label = STATUS_LABEL[code] || code;
        if (!seen.has(label)) {
          seen.add(label);
          statuses.push(label);
        }
      }
    }
    return statuses;
  }
}

module.exports = new NoteService();

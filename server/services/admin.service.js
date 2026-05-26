/**
 * 管理员服务（含审计日志）
 */
const { db } = require('../database/init');
const path = require('path');
const fs = require('fs');

const PHOTOS_ROOT = path.join(__dirname, '..', '..', 'data', 'photos');

class AdminService {
  /** 强制删除接诊单（记录审计 + 级联清理手机照） */
  forceDeleteVisit(visitId, operatorId, reason) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    
    const snapshot = JSON.stringify(visit);
    
    db.prepare(`
      INSERT INTO admin_operations (operator_id, action_type, target_table, target_id, before_snapshot, reason, operated_at)
      VALUES (?, 'FORCE_DELETE', 'visits', ?, ?, ?, ?)
    `).run(operatorId, visitId, snapshot, reason, Date.now());
    
    // 级联清理手机照文件
    const photos = db.prepare('SELECT file_path, thumb_path FROM visit_photos WHERE visit_id = ?').all(visitId);
    for (const p of photos) {
      const origPath = path.join(PHOTOS_ROOT, p.file_path);
      const thumbPath = path.join(PHOTOS_ROOT, p.thumb_path);
      try { if (fs.existsSync(origPath)) fs.unlinkSync(origPath); } catch {}
      try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath); } catch {}
    }
    // 尝试删空子文件夹
    if (photos.length > 0) {
      const dirPath = path.dirname(path.join(PHOTOS_ROOT, photos[0].file_path));
      try { fs.rmdirSync(dirPath); } catch {}
    }
    
    db.prepare('DELETE FROM visit_photos WHERE visit_id = ?').run(visitId);
    db.prepare('DELETE FROM visits WHERE id = ?').run(visitId);
    db.prepare('DELETE FROM visit_notes WHERE visit_id = ?').run(visitId);
    
    return { success: true };
  }

  /** 强制改名 */
  forceRename(visitId, newGuestName, operatorId, reason) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    
    const oldName = visit.guest_name;
    
    db.prepare(`
      INSERT INTO admin_operations (operator_id, action_type, target_table, target_id, before_snapshot, reason, operated_at)
      VALUES (?, 'FORCE_RENAME', 'visits', ?, ?, ?, ?)
    `).run(operatorId, visitId, JSON.stringify({ oldName }), reason, Date.now());
    
    db.prepare('UPDATE visits SET guest_name = ? WHERE id = ?').run(newGuestName, visitId);
    
    return { success: true };
  }

  /** 获取操作日志 */
  getOperations(limit = 50) {
    return db.prepare(`
      SELECT ao.*, s.name as operator_name
      FROM admin_operations ao
      LEFT JOIN staff s ON ao.operator_id = s.id
      ORDER BY ao.operated_at DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = new AdminService();

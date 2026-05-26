/**
 * 人员管理服务 (v3.2 — 科室/导入/删除)
 */
const { db } = require('../database/init');

class StaffService {
  getAll() {
    return db.prepare('SELECT * FROM staff ORDER BY role, id').all();
  }

  listActive() {
    return db.prepare('SELECT * FROM staff WHERE is_active = 1 ORDER BY role, id').all();
  }

  getById(id) {
    return db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
  }

  /** 登录验证 */
  login(staffId, pin) {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND is_active = 1').get(staffId);
    if (!staff) return { success: false, error: '人员不存在' };
    if (staff.pin && staff.pin !== pin) return { success: false, error: '密码错误' };
    return { success: true, staff };
  }

  create({ name, role, pin, department }) {
    const now = Date.now();
    const result = db.prepare(
      'INSERT INTO staff (name, role, pin, department, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(name, role, pin || null, department || '', now);
    return db.prepare('SELECT * FROM staff WHERE id = ?').get(result.lastInsertRowid);
  }

  update(id, fields) {
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (['name', 'role', 'pin', 'department', 'is_active'].includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    // 兼容旧代码的 disabled 字段
    if (fields.disabled !== undefined) {
      sets.push('is_active = ?');
      vals.push(fields.disabled ? 0 : 1);
    }
    if (sets.length === 0) return null;
    vals.push(id);
    db.prepare(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
  }

  /** 软删除 */
  delete(id) {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    if (!staff) return { success: false, error: '人员不存在' };
    db.prepare('UPDATE staff SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  }

  /** 批量导入 */
  bulkImport(rows) {
    const now = Date.now();
    const insert = db.prepare(
      'INSERT INTO staff (name, role, pin, department, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    
    const results = [];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const name = (row.name || row['姓名'] || '').trim();
        const role = (row.role || row['角色'] || '').trim();
        const pin = (row.pin || row['密码'] || row['PIN'] || '').trim() || null;
        const dept = (row.department || row['科室'] || '').trim();
        
        if (!name) { results.push({ name, error: '姓名为空' }); continue; }
        if (!role) { results.push({ name, error: '角色为空' }); continue; }
        
        const validRoles = ['reception','doctor','nurse','assistant','manager','admin'];
        if (!validRoles.includes(role)) { results.push({ name, error: `无效角色: ${role}` }); continue; }
        
        try {
          const info = insert.run(name, role, pin, dept, now);
          results.push({ name, id: info.lastInsertRowid, success: true });
        } catch (e) {
          results.push({ name, error: e.message });
        }
      }
    });
    
    insertMany(rows);
    return { success: true, results };
  }
}

module.exports = new StaffService();

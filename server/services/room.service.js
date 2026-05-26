/**
 * 房间服务
 */
const { db } = require('../database/init');

class RoomService {
  getAll() {
    return db.prepare('SELECT * FROM rooms WHERE is_active = 1 ORDER BY sort_order').all();
  }

  create({ name, type, capacity, equipmentTags }) {
    const result = db.prepare(`
      INSERT INTO rooms (name, type, capacity, equipment_tags)
      VALUES (?, ?, ?, ?)
    `).run(name, type, capacity || 1, equipmentTags ? JSON.stringify(equipmentTags) : null);
    return db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);
  }

  update(id, fields) {
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (['name', 'type', 'capacity', 'equipment_tags', 'is_active', 'sort_order'].includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(k === 'equipment_tags' && v ? JSON.stringify(v) : v);
      }
    }
    if (sets.length === 0) return null;
    vals.push(id);
    db.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  }
}

module.exports = new RoomService();

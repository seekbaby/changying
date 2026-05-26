/**
 * 进销存服务 v3.0
 * 
 * 核心业务：
 * 1. 进货入库（主管）
 * 2. 开单锁货（医助/主管，可选术中加单）
 * 3. 核销确认（护士）
 * 4. 实时库存查询（全员可看）
 * 5. 离院平账检查
 */

const { db } = require('../database/init');

class InventoryService {
  // ══════ 1. 耗材目录 + 实时库存 ══════

  /** 获取所有耗材（含可用库存 = current_stock - 已锁未核销） */
  listItems() {
    const today = new Date().toISOString().slice(0, 10);
    const items = db.prepare(`
      SELECT * FROM inventory_items WHERE is_active = 1 ORDER BY name
    `).all();

    // 计算每个耗材的可用库存：去掉已被在院患者锁定的量
    for (const item of items) {
      const locked = db.prepare(`
        SELECT COALESCE(SUM(vi.qty_ordered - vi.qty_verified), 0) as locked
        FROM visit_inventory vi
        JOIN visits v ON vi.visit_id = v.id
        WHERE vi.item_id = ? AND v.closed_at IS NULL AND v.visit_date = ?
      `).get(item.id, today);
      item.locked = locked.locked;
      item.available = item.current_stock - item.locked;
    }

    return items;
  }

  /** 创建耗材 */
  createItem(name, unit = '支', safetyStock = 5) {
    const exists = db.prepare('SELECT id FROM inventory_items WHERE name = ?').get(name);
    if (exists) return { success: false, error: '耗材名称已存在' };
    const now = Date.now();
    const result = db.prepare(
      'INSERT INTO inventory_items (name, unit, safety_stock, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, unit, safetyStock, now);
    return { success: true, item: { id: result.lastInsertRowid, name, unit, current_stock: 0, safety_stock: safetyStock } };
  }

  /** 停用/启用耗材 */
  toggleItem(itemId) {
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
    if (!item) return { success: false, error: '耗材不存在' };
    const newState = item.is_active ? 0 : 1;
    db.prepare('UPDATE inventory_items SET is_active = ? WHERE id = ?').run(newState, itemId);
    return { success: true, is_active: newState };
  }

  // ══════ 2. 进货入库（主管） ══════

  inbound(itemId, quantity, operatorId, note = '') {
    if (quantity <= 0) return { success: false, error: '数量必须大于0' };
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND is_active = 1').get(itemId);
    if (!item) return { success: false, error: '耗材不存在或已停用' };

    const now = Date.now();
    const runInbound = db.transaction(() => {
      // 更新库存
      const newStock = item.current_stock + quantity;
      db.prepare('UPDATE inventory_items SET current_stock = ? WHERE id = ?').run(newStock, itemId);
      // 写日志
      db.prepare(`
        INSERT INTO inventory_logs (item_id, type, quantity, operator_id, note, created_at)
        VALUES (?, 'inbound', ?, ?, ?, ?)
      `).run(itemId, quantity, operatorId, note, now);
    });
    runInbound();
    return { success: true, new_stock: item.current_stock + quantity };
  }

  // ══════ 3. 开单锁货（医助/主管） ══════

  /**
   * 开单锁货 —— 批量添加多条耗材记录
   * @param {number} visitId
   * @param {Array<{itemId, qty, source}>} items — 耗材列表
   * @param {number} operatorId
   */
  lockItems(visitId, items, operatorId) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    if (visit.closed_at) return { success: false, error: '该客户已离院' };

    const now = Date.now();
    const results = [];

    const runLock = db.transaction(() => {
      for (const { itemId, qty, source } of items) {
        if (qty <= 0) continue;
        
        const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND is_active = 1').get(itemId);
        if (!item) {
          results.push({ itemId, success: false, error: '耗材不存在或已停用' });
          continue;
        }

        // 检查是否已有该耗材的记录——有则累加开单量
        const existing = db.prepare(
          'SELECT * FROM visit_inventory WHERE visit_id = ? AND item_id = ?'
        ).get(visitId, itemId);

        if (existing) {
          db.prepare(
            'UPDATE visit_inventory SET qty_ordered = qty_ordered + ?, source = COALESCE(?, source) WHERE id = ?'
          ).run(qty, source || 'pre_op', existing.id);
        } else {
          db.prepare(`
            INSERT INTO visit_inventory (visit_id, item_id, qty_ordered, qty_verified, source, created_at)
            VALUES (?, ?, ?, 0, ?, ?)
          `).run(visitId, itemId, qty, source || 'pre_op', now);
        }

        // 写日志
        db.prepare(`
          INSERT INTO inventory_logs (item_id, type, quantity, visit_id, operator_id, note, created_at)
          VALUES (?, 'ordered', ?, ?, ?, ?, ?)
        `).run(itemId, qty, visitId, operatorId, source || 'pre_op', now);

        results.push({ itemId, itemName: item.name, qty, success: true });
      }
    });

    runLock();
    return { success: true, results };
  }

  // ══════ 4. 核销确认（护士） ══════

  /**
   * 核销 —— 记录实际消耗量
   * @param {number} visitId
   * @param {Array<{rowId, verifiedQty}>} items — 核销行列表
   * @param {number} operatorId
   */
  verifyItems(visitId, items, operatorId) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    if (visit.closed_at) return { success: false, error: '该客户已离院' };

    const now = Date.now();
    const results = [];

    const runVerify = db.transaction(() => {
      for (const { rowId, verifiedQty } of items) {
        if (verifiedQty <= 0) continue;

        const row = db.prepare('SELECT * FROM visit_inventory WHERE id = ? AND visit_id = ?').get(rowId, visitId);
        if (!row) {
          results.push({ rowId, success: false, error: '记录不存在' });
          continue;
        }

        // 更新核销量（可多次核销累加）
        const newVerified = (row.qty_verified || 0) + verifiedQty;
        db.prepare('UPDATE visit_inventory SET qty_verified = ? WHERE id = ?').run(newVerified, rowId);

        // 扣减实物库存
        db.prepare(`
          UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?
        `).run(verifiedQty, row.item_id);

        // 写日志
        db.prepare(`
          INSERT INTO inventory_logs (item_id, type, quantity, visit_id, operator_id, note, created_at)
          VALUES (?, 'consumed', ?, ?, ?, ?, ?)
        `).run(row.item_id, verifiedQty, visitId, operatorId, '核销', now);

        results.push({ rowId, verifiedQty, newTotal: newVerified, success: true });
      }
    });

    runVerify();
    return { success: true, results };
  }

  // ══════ 5. 查询 ══════

  /** 获取某顾客的耗材明细 */
  getVisitInventory(visitId) {
    return db.prepare(`
      SELECT vi.*, ii.name as item_name, ii.unit,
             (vi.qty_ordered - COALESCE(vi.qty_verified, 0)) as pending
      FROM visit_inventory vi
      JOIN inventory_items ii ON vi.item_id = ii.id
      WHERE vi.visit_id = ?
      ORDER BY vi.created_at
    `).all(visitId);
  }

  /**
   * 检查离院前账是否平
   * @returns {{balanced: boolean, unsettled: Array}}
   */
  checkBalance(visitId) {
    const rows = db.prepare(`
      SELECT vi.*, ii.name as item_name
      FROM visit_inventory vi
      JOIN inventory_items ii ON vi.item_id = ii.id
      WHERE vi.visit_id = ? AND vi.qty_ordered != COALESCE(vi.qty_verified, 0)
    `).all(visitId);

    return {
      balanced: rows.length === 0,
      unsettled: rows.map(r => ({
        id: r.id,
        itemName: r.item_name,
        ordered: r.qty_ordered,
        verified: r.qty_verified || 0,
        diff: r.qty_ordered - (r.qty_verified || 0)
      }))
    };
  }
}

module.exports = new InventoryService();

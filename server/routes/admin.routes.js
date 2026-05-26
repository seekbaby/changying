/**
 * REST API 路由（非WebSocket操作的管理接口）
 */
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { adminGuard } = require('../middleware/adminGuard.middleware');
const staffService = require('../services/staff.service');
const roomService = require('../services/room.service');
const adminService = require('../services/admin.service');
const inventoryService = require('../services/inventory.service');
const { db } = require('../database/init');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── 健康检查 ──
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// ── 公开端点：人员列表（id/name/role/department/pin）──
router.get('/staff', (req, res) => {
  const all = db.prepare('SELECT id, name, role, department, pin FROM staff WHERE is_active = 1 ORDER BY role, id').all();
  res.json(all);
});

// ── 管理员API（需要验证）──
// 所有 /api/admin/* 都需要管理员密码或token
router.use('/admin', adminGuard);

router.get('/admin/staff', (req, res) => {
  const all = db.prepare('SELECT * FROM staff ORDER BY role, id').all();
  res.json(all);
});

router.post('/admin/staff', (req, res) => {
  const staff = staffService.create(req.body);
  res.json(staff);
});

router.put('/admin/staff/:id', (req, res) => {
  const staff = staffService.update(parseInt(req.params.id), req.body);
  res.json(staff);
});

router.get('/admin/rooms', (req, res) => {
  const all = db.prepare('SELECT * FROM rooms ORDER BY sort_order').all();
  res.json(all);
});

router.post('/admin/rooms', (req, res) => {
  const room = roomService.create(req.body);
  res.json(room);
});

router.put('/admin/rooms/:id', (req, res) => {
  const room = roomService.update(parseInt(req.params.id), req.body);
  res.json(room);
});

router.get('/admin/operations', (req, res) => {
  const ops = adminService.getOperations(parseInt(req.query.limit) || 50);
  res.json(ops);
});

router.get('/admin/transitions', (req, res) => {
  const all = db.prepare('SELECT * FROM status_transitions ORDER BY id').all();
  res.json(all);
});

// ── v3.0: 耗材 Excel 批量导入 ──
router.post('/admin/inventory/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择 Excel 文件' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, error: 'Excel 文件中没有工作表' });
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) {
      return res.status(400).json({ success: false, error: 'Excel 至少需要标题行 + 1 行数据' });
    }

    // 跳过标题行
    const dataRows = rows.slice(1).filter(r => r[0] && String(r[0]).trim());
    const results = [];
    let created = 0, inboundCount = 0, skipped = 0;

    for (const row of dataRows) {
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const unit = String(row[1] || '支').trim() || '支';
      const safetyStock = parseInt(row[2]) || 5;
      const initialQty = parseInt(row[3]) || 0;
      const note = String(row[4] || '').trim();

      try {
        // 创建耗材（如果已存在则跳过）
        const createResult = inventoryService.createItem(name, unit, safetyStock);
        let itemId;

        if (createResult.success) {
          itemId = createResult.item.id;
          created++;
        } else if (createResult.error === '耗材名称已存在') {
          // 查找已有 item
          const existing = db.prepare('SELECT id FROM inventory_items WHERE name = ?').get(name);
          if (existing) {
            itemId = existing.id;
            skipped++;
          } else {
            results.push({ name, error: createResult.error });
            continue;
          }
        } else {
          results.push({ name, error: createResult.error });
          continue;
        }

        // 如果有进货数量，执行入库
        if (initialQty > 0) {
          const inboundResult = inventoryService.inbound(itemId, initialQty, null, note || 'Excel批量导入');
          if (inboundResult.success) {
            inboundCount++;
            results.push({ name, unit, safetyStock, qty: initialQty, status: 'created+inbound' });
          } else {
            results.push({ name, unit, safetyStock, qty: initialQty, status: 'created', inboundError: inboundResult.error });
          }
        } else {
          results.push({ name, unit, safetyStock, qty: 0, status: skipped > 0 && created === 0 ? 'skipped' : 'created' });
          if (skipped === 0) created++;
        }
      } catch (e) {
        results.push({ name, error: e.message });
      }
    }

    res.json({
      success: true,
      summary: { total: dataRows.length, created, inboundCount, skipped },
      results
    });
  } catch (e) {
    console.error('[Inventory Import] Error:', e);
    res.status(500).json({ success: false, error: e.message || '导入失败' });
  }
});

module.exports = router;

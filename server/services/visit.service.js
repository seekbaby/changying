/**
 * 接诊单业务逻辑服务
 */
const { db } = require('../database/init');
const stateMachine = require('../core/StateMachine');
const conflictDetector = require('../core/ConflictDetector');
const timerRegistry = require('../core/TimerRegistry');
const snapshot = require('../core/StateSnapshot');
const alertEngine = require('../core/AlertEngine');

const STATUSES = [
  'ARRIVED_WAITING', 'DETECTION_PHOTO', 'IN_CLINIC_WAITING',
  'CONSULTATION', 'PRE_TREATMENT_CARE', 'NUMBING', 'PRE_OP_WAITING',
  'IN_OPERATION', 'POST_TREATMENT_CARE', 'DINING', 'DISCHARGED'
];

class VisitService {
  /**
   * 创建接诊单
   */
  create({ guestName, guestPhone, assignedNurseId, toStatus, roomId }) {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const status = toStatus || 'ARRIVED_WAITING';
    const room = roomId || 8;

    // ★ 房间容量检查：如果选了非默认房间，先检查是否已满
    if (roomId && roomId !== 8) {
      const check = conflictDetector.checkRoomCapacity(roomId);
      if (!check.ok) {
        return { success: false, error: check.reason || '该空间已满' };
      }
    }

    const result = db.prepare(`
      INSERT INTO visits (visit_date, guest_name, guest_phone, assigned_nurse_id,
        current_status, current_room_id, status_entered_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(today, guestName, guestPhone || null, assignedNurseId, status, room, now, now);

    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(result.lastInsertRowid);

    // 系统日志
    this._addSystemNote(result.lastInsertRowid, null, status, status);

    snapshot.refresh();
    return { success: true, visit };
  }

  /**
   * 推进/跳转状态 —— 核心动作
   */
  advance(visitId, toStatus, { roomId, expectedDurationMin, operatorRole, forceByManager }) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    if (visit.closed_at) return { success: false, error: '该客户已离院' };
    
    const fromStatus = visit.current_status;

    // ── 0. 角色硬权限门禁（白皮书 3.2）──
    // 医生：仅备注，禁止推进状态
    if (operatorRole === 'doctor') {
      return { success: false, error: '医生无状态推进权限，仅可添加备注' };
    }

    // 医助：面诊结束时强制录入治疗方案
    if (operatorRole === 'assistant' && fromStatus === 'CONSULTATION') {
      const plans = db.prepare(
        `SELECT COUNT(*) as cnt FROM visit_notes WHERE visit_id = ? AND note_type = 'treatment_plan'`
      ).get(visitId);
      if (!plans || plans.cnt === 0) {
        return { success: false, error: '面诊结束前必须先录入治疗方案', requireTreatmentPlan: true };
      }
    }
    
    // 1. 查询状态机配置（不限制转换，仅获取房间/时长默认值）
    const check = stateMachine.check(fromStatus, toStatus);
    const config = check.config || {};
    
    // 2. 角色权限检查（若有配置则检查）
    if (operatorRole && config.allowed_roles && !stateMachine.checkRole(config, operatorRole)) {
      return { success: false, error: '当前角色无权执行此操作' };
    }
    
    // 3. 冲突检测（主管可强制绕过房间容量限制）
    let actualRoomId = visit.current_room_id;
    if (config.requires_room && roomId) {
      if (forceByManager && operatorRole === 'manager') {
        // 主管强制干预：跳过容量检查，直接分配
        actualRoomId = roomId;
      } else {
        const conflictCheck = conflictDetector.checkRoomCapacity(roomId, visitId);
        if (!conflictCheck.ok) {
          return { success: false, error: conflictCheck.reason, conflict: conflictCheck };
        }
        actualRoomId = roomId;
      }
    } else if (config.requires_room && !roomId && !visit.current_room_id) {
      return { success: false, error: '此状态切换需要选择房间' };
    }
    
    const now = Date.now();
    const duration = expectedDurationMin || config.default_duration_min;
    const deadline = duration ? now + duration * 60000 : null;

    // 4. 写入DB
    db.prepare(`
      UPDATE visits SET 
        current_status = ?, current_room_id = ?,
        status_entered_at = ?, expected_duration_min = ?,
        deadline_at = ?, alert_triggered = 0
      WHERE id = ?
    `).run(toStatus, actualRoomId, now, duration, deadline, visitId);
    
    // 5. 系统日志
    this._addSystemNote(visitId, fromStatus, toStatus, fromStatus);
    
    // 6. 计时器
    timerRegistry.unregister(visitId);
    if (deadline) {
      timerRegistry.register(visitId, deadline, (vid) => {
        const broadcast = require('../utils/broadcast');
        alertEngine.trigger(vid, (action, payload) => broadcast.all(action, payload));
      });
    }
    
    // 7. 处理离院
    if (toStatus === 'DISCHARGED') {
      db.prepare('UPDATE visits SET closed_at = ? WHERE id = ?').run(now, visitId);
    }
    
    // 8. 更新快照
    snapshot.refresh();
    
    const updated = db.prepare(`
      SELECT v.*, s.name as nurse_name
      FROM visits v LEFT JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.id = ?
    `).get(visitId);
    
    return { success: true, visit: updated, fromStatus, toStatus };
  }

  /** 只换房间不切状态（主管可强制绕过容量限制） */
  changeRoom(visitId, newRoomId, forceByManager = false) {
    if (!forceByManager) {
      const conflictCheck = conflictDetector.checkRoomCapacity(newRoomId, visitId);
      if (!conflictCheck.ok) return { success: false, error: conflictCheck.reason, conflict: conflictCheck };
    }
    
    db.prepare('UPDATE visits SET current_room_id = ? WHERE id = ?').run(newRoomId, visitId);
    snapshot.refresh();
    
    const updated = db.prepare(`
      SELECT v.*, s.name as nurse_name
      FROM visits v LEFT JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.id = ?
    `).get(visitId);
    
    return { success: true, visit: updated };
  }

  /** 离院 */
  discharge(visitId) {
    const now = Date.now();
    db.prepare('UPDATE visits SET closed_at = ?, current_status = ? WHERE id = ?')
      .run(now, 'DISCHARGED', visitId);
    timerRegistry.unregister(visitId);
    
    this._addSystemNote(visitId, null, 'DISCHARGED', null);
    snapshot.removeVisit(visitId);
    return { success: true };
  }

  /** 交接：将接诊单转给另一位护士 */
  handover(visitId, toNurseId, operatorId) {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
    if (!visit) return { success: false, error: '接诊单不存在' };
    if (visit.closed_at) return { success: false, error: '该客户已离院' };
    
    const newNurse = db.prepare('SELECT * FROM staff WHERE id = ? AND is_active = 1')
      .get(toNurseId);
    if (!newNurse) return { success: false, error: '目标人员不存在或已停用' };
    
    const oldNurseId = visit.assigned_nurse_id;
    
    db.prepare('UPDATE visits SET assigned_nurse_id = ? WHERE id = ?').run(toNurseId, visitId);
    
    // 系统日志
    db.prepare(`
      INSERT INTO visit_notes (visit_id, author_id, author_role, note_type, content, created_at)
      VALUES (?, ?, 'nurse', 'status_change', ?, ?)
    `).run(visitId, operatorId, 
      `交接: 护士ID ${oldNurseId} → ${toNurseId} (${newNurse.name})`,
      Date.now()
    );
    
    snapshot.refresh();
    
    const updated = db.prepare(`
      SELECT v.*, s.name as nurse_name
      FROM visits v LEFT JOIN staff s ON v.assigned_nurse_id = s.id
      WHERE v.id = ?
    `).get(visitId);
    
    return { success: true, visit: updated };
  }

  /** 获取今日全量数据 */
  getTodayVisits() {
    const today = new Date().toISOString().slice(0, 10);
    return db.prepare(`
      SELECT v.*, s.name as nurse_name, r.name as room_name
      FROM visits v
      LEFT JOIN staff s ON v.assigned_nurse_id = s.id
      LEFT JOIN rooms r ON v.current_room_id = r.id
      WHERE v.visit_date = ?
      ORDER BY v.created_at DESC
    `).all(today);
  }

  /**
   * ★ v2.5: 按顾客姓名查询所有历史到院记录（含照片、医生、状态链）
   * @returns {{ success, customerName, visits[] }}
   */
  getCustomerHistory(name) {
    const trimmed = (name || '').trim();

    let visits;
    if (trimmed) {
      visits = db.prepare(`
        SELECT v.*, s.name as nurse_name
        FROM visits v
        LEFT JOIN staff s ON v.assigned_nurse_id = s.id
        WHERE v.guest_name LIKE ?
        ORDER BY v.visit_date DESC, v.created_at DESC
      `).all(`%${trimmed}%`);
    } else {
      // ★ v3.0: 空 name → 返回所有顾客的全部历史
      visits = db.prepare(`
        SELECT v.*, s.name as nurse_name
        FROM visits v
        LEFT JOIN staff s ON v.assigned_nurse_id = s.id
        ORDER BY v.guest_name, v.visit_date DESC, v.created_at DESC
      `).all();
    }

    if (visits.length === 0) return { success: true, customerName: trimmed, visits: [] };

    // 聚合：每条 visit 附上照片、医生链、状态历史
    const richVisits = visits.map(v => {
      // 照片
      const photos = db.prepare(
        'SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY photo_type, id'
      ).all(v.id);

      // 医生链
      const doctors = db.prepare(`
        SELECT vd.*, s.name as doctor_name
        FROM visit_doctors vd
        LEFT JOIN staff s ON vd.doctor_id = s.id
        WHERE vd.visit_id = ?
        ORDER BY vd.started_at
      `).all(v.id);

      // 状态历史（去重中文化）
      const statusRows = db.prepare(`
        SELECT content FROM visit_notes
        WHERE visit_id = ? AND note_type = 'status_change'
        ORDER BY created_at
      `).all(v.id);

      const STATUS_LABEL = {
        ARRIVED_WAITING:'到院等待', DETECTION_PHOTO:'检测拍照', IN_CLINIC_WAITING:'院内等待',
        CONSULTATION:'面诊', PRE_TREATMENT_CARE:'术前护理', NUMBING:'敷麻',
        PRE_OP_WAITING:'术前等待', IN_OPERATION:'术中', POST_TREATMENT_CARE:'术后护理',
        DINING:'用餐', DISCHARGED:'已离院'
      };
      const seen = new Set();
      const statusPath = [];
      for (const row of statusRows) {
        const codes = (row.content || '').match(/[A-Z_]{3,}/g) || [];
        for (const code of codes) {
          const label = STATUS_LABEL[code] || code;
          if (!seen.has(label)) { seen.add(label); statusPath.push(label); }
        }
      }

      // 总耗时
      const endMs = v.closed_at || Date.now();
      const totalMs = endMs - v.created_at;
      const totalMin = Math.floor(totalMs / 60000);

      return {
        ...v,
        photos,
        doctors: doctors.map(d => ({
          ...d,
          duration_min: d.ended_at ? Math.floor((d.ended_at - d.started_at) / 60000) : null
        })),
        statusPath,
        totalMin
      };
    });

    return { success: true, customerName: trimmed ? visits[0].guest_name : '全部顾客', visits: richVisits };
  }

  /** 系统自动追加状态变更日志 */
  _addSystemNote(visitId, fromStatus, toStatus, role) {
    db.prepare(`
      INSERT INTO visit_notes (visit_id, author_id, author_role, note_type, content, created_at)
      VALUES (?, NULL, 'system', 'status_change', ?, ?)
    `).run(visitId, 
      fromStatus ? `${fromStatus} → ${toStatus}` : `初始化: ${toStatus}`,
      Date.now()
    );
  }
}

module.exports = new VisitService();

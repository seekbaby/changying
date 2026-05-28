/**
 * WebSocket 消息路由分发器
 */
const tokenHelper = require('../utils/tokenHelper');
const broadcast = require('../utils/broadcast');
const visitService = require('../services/visit.service');
const noteService = require('../services/note.service');
const staffService = require('../services/staff.service');
const adminService = require('../services/admin.service');
const doctorService = require('../services/doctor.service');
const dashboardService = require('../services/dashboard.service');  // v3.0
const inventoryService = require('../services/inventory.service');  // v3.0
const recordingService = require('../services/recording.service');  // v4.0
const snapshot = require('../core/StateSnapshot');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';

function handleMessage(ws, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData);
  } catch {
    broadcast.send(ws, 'PARSE', '', false, {}, '无效的JSON格式');
    return;
  }

  const { action, requestId, payload, token } = msg;

  // 除登录外，都需要token验证
  let user = null;
  if (action !== 'AUTH_LOGIN' && action !== 'AUTH_ADMIN_VERIFY' && action !== 'PING') {
    user = tokenHelper.verify(token);
    if (!user) {
      broadcast.send(ws, action, requestId, false, {}, '未登录或token已过期');
      return;
    }
  }

  try {
    switch (action) {

      // ── AUTH ──
      case 'AUTH_LOGIN': {
        const result = staffService.login(payload.staffId, payload.pin);
        if (result.success) {
          const t = tokenHelper.sign(result.staff);
          broadcast.send(ws, action, requestId, true, { token: t, staff: result.staff });
        } else {
          broadcast.send(ws, action, requestId, false, {}, result.error);
        }
        break;
      }

      case 'AUTH_ADMIN_VERIFY': {
        if (payload.password === ADMIN_PASSWORD) {
          broadcast.send(ws, action, requestId, true, { role: 'admin' });
        } else {
          broadcast.send(ws, action, requestId, false, {}, '管理员密码错误');
        }
        break;
      }

      // ── VISIT ──
      case 'VISIT_CREATE': {
        // 仅前台/护士/主管/管理员可建单
        if (!['reception','nurse','manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '当前角色无权创建接诊单');
          return;
        }
        const result = visitService.create(payload);
        if (result.success) {
          snapshot.refresh();
          broadcast.send(ws, action, requestId, true, { visit: result.visit });
          pushGlobalState();
        } else {
          broadcast.send(ws, action, requestId, false, {}, result.error);
        }
        break;
      }

      case 'VISIT_STATUS_ADVANCE': {
        // 禁止医生推进状态
        if (user?.role === 'doctor') {
          broadcast.send(ws, action, requestId, false, {}, '医生无状态推进权限');
          return;
        }
        const result = visitService.advance(payload.visitId, payload.toStatus, {
          roomId: payload.roomId,
          expectedDurationMin: payload.expectedDurationMin,
          operatorRole: user?.role,
          forceByManager: payload.forceByManager || false
        });
        if (result.success) {
          broadcast.send(ws, action, requestId, true, { visit: result.visit });
          pushGlobalState();
        } else {
          broadcast.send(ws, action, requestId, false, {
            requireTreatmentPlan: result.requireTreatmentPlan,
            conflict: result.conflict
          }, result.error);
        }
        break;
      }

      // ★ v2.5: 独立设置/切换治疗医生（任何状态）
      case 'VISIT_SET_DOCTOR': {
        const dr = doctorService.setDoctor(payload.visitId, payload.doctorId);
        if (dr.success) {
          snapshot.refresh();
          broadcast.send(ws, action, requestId, true, dr.record ? { record: dr.record } : {});
          pushGlobalState();
        } else {
          broadcast.send(ws, action, requestId, false, {}, dr.error);
        }
        break;
      }

      // ★ v2.5: 获取医生列表
      case 'DOCTOR_LIST': {
        broadcast.send(ws, action, requestId, true, { doctors: doctorService.getDoctorList() });
        break;
      }

      // ★ v2.5: 获取某次接诊的医生历史
      case 'DOCTOR_HISTORY': {
        broadcast.send(ws, action, requestId, true, {
          doctors: doctorService.getDoctorHistory(payload.visitId)
        });
        break;
      }

      // ★ v2.5: 按顾客姓名查询所有历史到院记录（含照片、医生链）
      case 'CUSTOMER_HISTORY': {
        const result = visitService.getCustomerHistory(payload.name);
        broadcast.send(ws, action, requestId, result.success, result.success ? {
          customerName: result.customerName,
          visits: result.visits
        } : {}, result.error);
        break;
      }

      case 'VISIT_ROOM_CHANGE': {
        // 仅前台/护士/医助/主管/管理员可变更房间
        if (!['reception','nurse','assistant','manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '当前角色无权变更房间');
          return;
        }
        // 主管强制换房（绕过容量检查）
        const isManagerForce = user?.role === 'manager' && payload.forceByManager;
        const result = visitService.changeRoom(payload.visitId, payload.newRoomId, isManagerForce);
        if (result.success) {
          broadcast.send(ws, action, requestId, true, { visit: result.visit });
          pushGlobalState();
        } else {
          broadcast.send(ws, action, requestId, false, { conflict: result.conflict }, result.error);
        }
        break;
      }

      case 'VISIT_DISCHARGE': {
        // 医生不可离院
        if (user?.role === 'doctor') {
          broadcast.send(ws, action, requestId, false, {}, '医生无离院操作权限');
          return;
        }
        visitService.discharge(payload.visitId);
        broadcast.send(ws, action, requestId, true, {});
        pushGlobalState();
        break;
      }

      case 'VISIT_HANDOVER': {
        // 仅护士/医助/主管/管理员可交接
        if (!['nurse','assistant','manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '当前角色无权执行交接');
          return;
        }
        const result = visitService.handover(payload.visitId, payload.toNurseId, user.staffId, user.role);
        if (result.success) {
          broadcast.send(ws, action, requestId, true, { visit: result.visit });
          pushGlobalState();
        } else {
          broadcast.send(ws, action, requestId, false, {}, result.error);
        }
        break;
      }

      case 'VISIT_QUERY_TODAY': {
        const visits = visitService.getTodayVisits();
        broadcast.send(ws, action, requestId, true, { visits });
        break;
      }

      // ── NOTE ──
      case 'NOTE_ADD_TREATMENT_PLAN': {
        const result = noteService.addTreatmentPlan(
          payload.visitId, payload.plan, payload.emotionTags,
          user.staffId, user.role
        );
        broadcast.send(ws, action, requestId, result.success, 
          result.success ? { noteId: result.noteId } : {}, 
          result.error
        );
        if (result.success) pushGlobalState();
        break;
      }

      case 'NOTE_ADD_GENERAL': {
        const result = noteService.addGeneral(
          payload.visitId, payload.content, user.staffId, user.role
        );
        broadcast.send(ws, action, requestId, result.success,
          result.success ? { noteId: result.noteId } : {}, result.error);
        break;
      }

      case 'NOTE_FETCH_TIMELINE': {
        const timeline = noteService.getTimeline(payload.visitId);
        broadcast.send(ws, action, requestId, true, { timeline });
        break;
      }

      case 'NOTE_FETCH_HISTORY': {
        const history = noteService.getStatusHistory(payload.visitId);
        broadcast.send(ws, action, requestId, true, { history });
        break;
      }

      case 'STAFF_LIST': {
        const staff = staffService.listActive();
        broadcast.send(ws, action, requestId, true, { staff });
        break;
      }

      // ── ADMIN ──
      case 'ADMIN_STAFF_CREATE': {
        const staff = staffService.create(payload);
        broadcast.send(ws, action, requestId, true, { staff });
        break;
      }

      case 'ADMIN_STAFF_UPDATE': {
        const staff = staffService.update(payload.staffId, payload);
        broadcast.send(ws, action, requestId, true, { staff });
        break;
      }

      case 'ADMIN_STAFF_DELETE': {
        const result = staffService.delete(payload.staffId);
        broadcast.send(ws, action, requestId, result.success, {}, result.error);
        break;
      }

      case 'ADMIN_STAFF_BULK_IMPORT': {
        const rows = payload.rows || [];
        if (!Array.isArray(rows) || rows.length === 0) {
          broadcast.send(ws, action, requestId, false, {}, '导入数据为空');
          return;
        }
        const result = staffService.bulkImport(rows);
        broadcast.send(ws, action, requestId, true, result);
        break;
      }

      case 'ADMIN_ROOM_CREATE': {
        const roomService = require('../services/room.service');
        const room = roomService.create(payload);
        broadcast.send(ws, action, requestId, true, { room });
        break;
      }

      case 'ADMIN_ROOM_UPDATE': {
        const roomService = require('../services/room.service');
        const room = roomService.update(payload.roomId, payload);
        broadcast.send(ws, action, requestId, true, { room });
        break;
      }

      case 'ADMIN_VISIT_FORCE_DELETE': {
        const result = adminService.forceDeleteVisit(payload.visitId, user.staffId, payload.reason);
        broadcast.send(ws, action, requestId, result.success, {}, result.error);
        if (result.success) pushGlobalState();
        break;
      }

      case 'ADMIN_VISIT_FORCE_RENAME': {
        const result = adminService.forceRename(
          payload.visitId, payload.newGuestName, user.staffId, payload.reason
        );
        broadcast.send(ws, action, requestId, result.success, {}, result.error);
        if (result.success) pushGlobalState();
        break;
      }

      // PING 心跳
      case 'PING':
        break;  // 静默忽略，客户端保活用

      // ★ v3.0 Dashboard 运营统计（仅 admin/manager）
      case 'DASHBOARD_STATS': {
        if (!['admin','manager'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅管理员和主管可查看Dashboard');
          break;
        }
        const stats = dashboardService.getStats();
        broadcast.send(ws, action, requestId, true, { stats });
        break;
      }

      // ══════ v3.0 进销存 ══════

      // 查询所有耗材（全员可看）
      case 'INVENTORY_LIST': {
        const items = inventoryService.listItems();
        broadcast.send(ws, action, requestId, true, { items });
        break;
      }

      // 进货入库（主管/管理员）
      case 'INVENTORY_INBOUND': {
        if (!['manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅主管和管理员可进行进货操作');
          break;
        }
        const r = inventoryService.inbound(payload.itemId, payload.quantity, user.staffId, payload.note);
        broadcast.send(ws, action, requestId, r.success, r.success ? { new_stock: r.new_stock } : {}, r.error);
        if (r.success) pushGlobalState();
        break;
      }

      // 开单锁货（医助/主管/管理员）
      case 'INVENTORY_LOCK': {
        if (!['assistant','manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅医助、主管和管理员可开单锁货');
          break;
        }
        const r = inventoryService.lockItems(payload.visitId, payload.items, user.staffId);
        broadcast.send(ws, action, requestId, r.success, { results: r.results }, r.error);
        if (r.success) pushGlobalState();
        break;
      }

      // 核销确认（护士）
      case 'INVENTORY_VERIFY': {
        if (user?.role !== 'nurse') {
          broadcast.send(ws, action, requestId, false, {}, '仅护士可进行核销');
          break;
        }
        const r = inventoryService.verifyItems(payload.visitId, payload.items, user.staffId);
        broadcast.send(ws, action, requestId, r.success, { results: r.results }, r.error);
        if (r.success) pushGlobalState();
        break;
      }

      // 查看顾客耗材明细（全员）
      case 'INVENTORY_VISIT': {
        const rows = inventoryService.getVisitInventory(payload.visitId);
        broadcast.send(ws, action, requestId, true, { rows });
        break;
      }

      // 创建耗材（主管/管理员）
      case 'INVENTORY_CREATE_ITEM': {
        if (!['manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅主管和管理员可创建耗材');
          break;
        }
        const r = inventoryService.createItem(payload.name, payload.unit, payload.safetyStock, payload.initialStock || 0);
        broadcast.send(ws, action, requestId, r.success, r.success ? { item: r.item } : {}, r.error);
        if (r.success) pushGlobalState();
        break;
      }

      // 停用/启用耗材（主管/管理员）
      case 'INVENTORY_TOGGLE_ITEM': {
        if (!['manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅主管和管理员可管理耗材');
          break;
        }
        const r = inventoryService.toggleItem(payload.itemId);
        broadcast.send(ws, action, requestId, r.success, { is_active: r.is_active }, r.error);
        if (r.success) pushGlobalState();
        break;
      }

      // 离院平账检查（任意角色推进离院前调用）
      case 'INVENTORY_BALANCE': {
        const r = inventoryService.checkBalance(payload.visitId);
        broadcast.send(ws, action, requestId, true, { balanced: r.balanced, unsettled: r.unsettled });
        break;
      }

      // v4.1: 耗材调整（admin/manager）
      case 'INVENTORY_ADJUST': {
        if (!['manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅主管和管理员可调整库存');
          break;
        }
        const adj = inventoryService.adjustStock(payload.itemId, payload.delta, user?.id);
        broadcast.send(ws, action, requestId, adj.success, adj.success ? { new_stock: adj.new_stock } : {}, adj.error);
        if (adj.success) pushGlobalState();
        break;
      }

      // v4.1: 耗材日志查询（admin/manager）
      case 'INVENTORY_LOGS': {
        if (!['manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '仅主管和管理员可查看日志');
          break;
        }
        const logs = inventoryService.getLogs(payload.itemId || null, payload.limit || 50);
        broadcast.send(ws, action, requestId, true, { logs });
        break;
      }

      // v4.1: 护士分配医助
      case 'VISIT_ASSIGN_ASSISTANT': {
        if (!['nurse','assistant','manager','admin'].includes(user?.role)) {
          broadcast.send(ws, action, requestId, false, {}, '无权限分配医助');
          break;
        }
        const aa = visitService.assignAssistant(payload.visitId, payload.assistantId);
        broadcast.send(ws, action, requestId, aa.success, aa.success ? { visit: aa.visit } : {}, aa.error);
        if (aa.success) pushGlobalState();
        break;
      }

      // v4.0: 录音列表
      case 'RECORDING_LIST': {
        const list = recordingService.listByVisit(Number(payload.visitId));
        broadcast.send(ws, action, requestId, true, { recordings: list });
        break;
      }

      // v4.0: 录音详情
      case 'RECORDING_GET': {
        const rec = recordingService.getById(Number(payload.id));
        broadcast.send(ws, action, requestId, !!rec, { recording: rec }, rec ? '' : '录音不存在');
        break;
      }

      // v4.0: 删除录音
      case 'RECORDING_DELETE': {
        const ok = recordingService.remove(Number(payload.id));
        broadcast.send(ws, action, requestId, ok, {}, ok ? '' : '删除失败');
        break;
      }

      default:
        broadcast.send(ws, action, requestId, false, {}, `未知动作: ${action}`);
    }
  } catch (err) {
    console.error(`[WS] ${action} error:`, err);
    broadcast.send(ws, action, requestId, false, {}, err.message);
  }
}

/** 向所有客户端推送全局状态快照 */
function pushGlobalState() {
  const state = snapshot.getSnapshot();
  broadcast.all('GLOBAL_STATE_PUSH', state);
}

module.exports = { handleMessage, pushGlobalState };

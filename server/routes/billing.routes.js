/**
 * 计费路由 (v7.0)
 * ─ GET  /api/billing/summary    — 查看订阅+点数摘要
 * ─ POST /api/billing/charge     — 手动充值点数（管理员）
 * ─ GET  /api/billing/transactions — 点数流水
 * ─ POST /api/billing/subscribe  — 创建/续费订阅（管理员）
 * ─ GET  /api/billing/subscriptions — 所有订阅列表（管理员）
 */
const express = require('express');
const billingService = require('../services/billing.service');

const router = express.Router();

// 临时：clinic_id 从 query 获取，未来从 token 解析
function getClinicId(req) {
  return req.query.clinic_id || req.body?.clinic_id || 'default';
}

// ═══════════════════════════════════════════
// GET /api/billing/summary
// ═══════════════════════════════════════════
router.get('/summary', (req, res) => {
  try {
    const clinicId = getClinicId(req);
    const summary = billingService.getBillingSummary(clinicId);
    res.json({ success: true, data: summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════
// POST /api/billing/charge
// Body: { clinic_id, points, note? }
// ═══════════════════════════════════════════
router.post('/charge', express.json(), (req, res) => {
  try {
    const { clinic_id, points, note } = req.body;
    if (!clinic_id || !points || points <= 0) {
      return res.status(400).json({ success: false, error: '缺少 clinic_id 或 points' });
    }
    const newBalance = billingService.chargeCredits(clinic_id, parseInt(points), note);
    res.json({ success: true, balance: newBalance });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/billing/transactions
// ═══════════════════════════════════════════
router.get('/transactions', (req, res) => {
  try {
    const clinicId = getClinicId(req);
    const limit = parseInt(req.query.limit) || 50;
    const transactions = billingService.getTransactionHistory(clinicId, limit);
    res.json({ success: true, data: transactions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════
// POST /api/billing/subscribe
// Body: { clinic_id, months? }
// ═══════════════════════════════════════════
router.post('/subscribe', express.json(), (req, res) => {
  try {
    const { clinic_id, months } = req.body;
    if (!clinic_id) {
      return res.status(400).json({ success: false, error: '缺少 clinic_id' });
    }
    const m = parseInt(months) || 1;

    // 检查是否有活跃订阅 → 续费
    const existing = billingService.getSubscription(clinic_id);
    let subId;
    if (existing) {
      subId = billingService.renewSubscription(clinic_id, m);
    } else {
      subId = billingService.createSubscription(clinic_id, m);
    }

    const summary = billingService.getBillingSummary(clinic_id);
    res.json({ success: true, subscription_id: subId, summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/billing/subscriptions
// ═══════════════════════════════════════════
router.get('/subscriptions', (req, res) => {
  try {
    const subs = billingService.listSubscriptions();
    res.json({ success: true, data: subs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

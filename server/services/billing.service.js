/**
 * 计费服务 (v7.0)
 * ─ 订阅管理：¥299/月/端口
 * ─ 点数系统：极速版扣点（1点=¥1，¥9.99/次 = 10点）
 * ─ 预留在线支付接口（当前手动充值）
 */
const { db } = require('../database/init');

const POINTS_PER_EXPRESS = 10;  // 极速版 10 点/次（= ¥9.99）

// ═══════════════════════════════════════════
// 订阅
// ═══════════════════════════════════════════

function getSubscription(clinicId) {
  return db.prepare(`
    SELECT * FROM subscriptions
    WHERE clinic_id = ? AND status = 'active'
    ORDER BY expires_at DESC LIMIT 1
  `).get(clinicId);
}

function checkSubscription(clinicId) {
  const sub = getSubscription(clinicId);
  if (!sub) throw new Error('未找到有效订阅');
  if (sub.expires_at < Date.now()) throw new Error('订阅已过期，请续费（¥299/月）');
  return sub;
}

function createSubscription(clinicId, months = 1) {
  const now = Date.now();
  const expiresAt = now + months * 30 * 24 * 60 * 60 * 1000;
  const result = db.prepare(`
    INSERT INTO subscriptions (clinic_id, plan, status, started_at, expires_at, created_at)
    VALUES (?, 'basic', 'active', ?, ?, ?)
  `).run(clinicId, now, expiresAt, now);
  return result.lastInsertRowid;
}

function renewSubscription(clinicId, months = 1) {
  const now = Date.now();
  const sub = db.prepare(`
    SELECT * FROM subscriptions WHERE clinic_id = ? AND status = 'active'
    ORDER BY expires_at DESC LIMIT 1
  `).get(clinicId);

  const startAt = sub && sub.expires_at > now ? sub.expires_at : now;
  const expiresAt = startAt + months * 30 * 24 * 60 * 60 * 1000;

  const result = db.prepare(`
    INSERT INTO subscriptions (clinic_id, plan, status, started_at, expires_at, created_at)
    VALUES (?, 'basic', 'active', ?, ?, ?)
  `).run(clinicId, startAt, expiresAt, now);
  return result.lastInsertRowid;
}

function cancelSubscription(clinicId) {
  db.prepare("UPDATE subscriptions SET status = 'cancelled' WHERE clinic_id = ? AND status = 'active'")
    .run(clinicId);
}

function listSubscriptions() {
  return db.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC').all();
}

// ═══════════════════════════════════════════
// 点数
// ═══════════════════════════════════════════

function getCreditAccount(clinicId) {
  return db.prepare('SELECT * FROM credit_accounts WHERE clinic_id = ?').get(clinicId);
}

function ensureCreditAccount(clinicId) {
  let account = getCreditAccount(clinicId);
  if (!account) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO credit_accounts (clinic_id, balance, total_charged, total_used, created_at, updated_at)
      VALUES (?, 0, 0, 0, ?, ?)
    `).run(clinicId, now, now);
    account = getCreditAccount(clinicId);
  }
  return account;
}

/** 充值点数 */
function chargeCredits(clinicId, points, note = '') {
  ensureCreditAccount(clinicId);
  const account = getCreditAccount(clinicId);
  const newBalance = account.balance + points;

  db.prepare(`
    UPDATE credit_accounts
    SET balance = ?, total_charged = total_charged + ?, updated_at = ?
    WHERE clinic_id = ?
  `).run(newBalance, points, Date.now(), clinicId);

  db.prepare(`
    INSERT INTO credit_transactions (clinic_id, type, amount, balance_after, note, created_at)
    VALUES (?, 'charge', ?, ?, ?, ?)
  `).run(clinicId, points, newBalance, note || '手动充值', Date.now());

  return newBalance;
}

/** 极速版扣点 */
function deductExpressCredit(clinicId, recordingId) {
  ensureCreditAccount(clinicId);
  const account = getCreditAccount(clinicId);

  if (account.balance < POINTS_PER_EXPRESS) {
    throw new Error(`点数不足：需要 ${POINTS_PER_EXPRESS} 点，当前余额 ${account.balance} 点。请充值。`);
  }

  const newBalance = account.balance - POINTS_PER_EXPRESS;

  db.prepare(`
    UPDATE credit_accounts
    SET balance = ?, total_used = total_used + ?, updated_at = ?
    WHERE clinic_id = ?
  `).run(newBalance, POINTS_PER_EXPRESS, Date.now(), clinicId);

  db.prepare(`
    INSERT INTO credit_transactions (clinic_id, type, amount, balance_after, recording_id, note, created_at)
    VALUES (?, 'consume', ?, ?, ?, ?, ?)
  `).run(clinicId, -POINTS_PER_EXPRESS, newBalance, recordingId, `极速分析 #${recordingId}`, Date.now());

  return newBalance;
}

function getTransactionHistory(clinicId, limit = 50) {
  return db.prepare(`
    SELECT * FROM credit_transactions
    WHERE clinic_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(clinicId, limit);
}

// ═══════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════

function getBillingSummary(clinicId) {
  const sub = getSubscription(clinicId);
  const account = getCreditAccount(clinicId);
  return {
    subscription: sub ? {
      status: sub.status,
      expires_at: sub.expires_at,
      days_left: Math.max(0, Math.ceil((sub.expires_at - Date.now()) / 86400000)),
    } : null,
    credits: account ? {
      balance: account.balance,
      total_charged: account.total_charged,
      total_used: account.total_used,
    } : { balance: 0, total_charged: 0, total_used: 0 },
  };
}

module.exports = {
  // 订阅
  getSubscription,
  checkSubscription,
  createSubscription,
  renewSubscription,
  cancelSubscription,
  listSubscriptions,
  // 点数
  getCreditAccount,
  ensureCreditAccount,
  chargeCredits,
  deductExpressCredit,
  getTransactionHistory,
  // 汇总
  getBillingSummary,
  // 常量
  POINTS_PER_EXPRESS,
};

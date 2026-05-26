/**
 * 简易Token签发/验证
 */
const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET || 'flow-radar-secret-' + crypto.randomBytes(8).toString('hex');
const TOKENS = new Map(); // token → { staffId, role, expires }

function sign(staff) {
  const token = crypto.randomBytes(32).toString('hex');
  TOKENS.set(token, {
    staffId: staff.id,
    role: staff.role,
    name: staff.name,
    expires: Date.now() + 24 * 60 * 60 * 1000 // 24小时
  });
  return token;
}

function verify(token) {
  const entry = TOKENS.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    TOKENS.delete(token);
    return null;
  }
  return entry;
}

function revoke(token) {
  TOKENS.delete(token);
}

module.exports = { sign, verify, revoke };

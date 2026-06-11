/**
 * 白名单中间件 (v7.1)
 * ─ 校验请求者身份是否在白名单内
 * ─ 优先校验 token，其次校验环境变量 WHITELIST_OPENIDS
 */
const tokenHelper = require('../utils/tokenHelper');

function whitelistMiddleware(req, res, next) {
  // 方式1: 标准 token 认证（通过即为白名单用户）
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token) {
    const user = tokenHelper.verify(token);
    if (user) {
      req.user = user;
      return next();
    }
  }

  // 方式2: 简单 openid 白名单（测试用）
  const openid = req.headers['x-openid'] || req.query.openid;
  if (openid) {
    const whitelist = (process.env.WHITELIST_OPENIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (whitelist.includes(openid)) {
      req.user = { openid, role: 'tester', name: '测试用户' };
      return next();
    }
  }

  // 方式3: 测试模式 — 若未配置白名单，放行（方便开发调试）
  const whitelist = (process.env.WHITELIST_OPENIDS || '').trim();
  if (!whitelist) {
    console.warn('[Whitelist] WHITELIST_OPENIDS 未配置，放行所有请求（生产环境请务必配置）');
    req.user = { role: 'tester', name: '默认测试用户' };
    return next();
  }

  res.status(403).json({ error: '不在白名单内' });
}

module.exports = { whitelistMiddleware };

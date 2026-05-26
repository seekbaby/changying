/**
 * /admin 路由守卫
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';

function adminGuard(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  const password = req.headers['x-admin-password'] || req.query.admin_password;
  
  // 可验证token或直接验证密码
  if (password === ADMIN_PASSWORD) return next();
  
  const tokenHelper = require('../utils/tokenHelper');
  const user = tokenHelper.verify(token);
  if (user && user.role === 'admin') return next();
  
  res.status(403).json({ error: '需要管理员权限' });
}

module.exports = { adminGuard };

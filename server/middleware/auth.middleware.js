/**
 * HTTP Token验证中间件
 */
const tokenHelper = require('../utils/tokenHelper');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: '未提供token' });
  
  const user = tokenHelper.verify(token);
  if (!user) return res.status(401).json({ error: 'token无效或已过期' });
  
  req.user = user;
  next();
}

module.exports = { authMiddleware };

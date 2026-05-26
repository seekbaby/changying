/**
 * 应用入口 —— HTTP + WebSocket 双协议服务
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const { initDatabase } = require('./database/init');
const adminRoutes = require('./routes/admin.routes');
const photoRoutes = require('./routes/photo.routes');
const { handleMessage, pushGlobalState } = require('./handlers/index');
const { setWss } = require('./utils/broadcast');
const snapshot = require('./core/StateSnapshot');
const timerRegistry = require('./core/TimerRegistry');
const alertEngine = require('./core/AlertEngine');

// 初始化数据库
initDatabase();

// ── Express HTTP ──
const app = express();
app.use(express.json());

// 手机照静态目录
const photosDir = path.join(__dirname, '..', 'data', 'photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}
app.use('/photos', express.static(photosDir));

// API路由
app.use('/api', adminRoutes);
app.use('/api', photoRoutes);

// 静态文件（前端构建产物）
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ── HTTP Server + WebSocket ──
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
setWss(wss);

wss.on('connection', (ws) => {
  console.log('[WS] 新连接');

  // 发送初始快照
  const state = snapshot.getSnapshot();
  ws.send(JSON.stringify({
    action: 'GLOBAL_STATE_PUSH',
    timestamp: Date.now(),
    payload: state
  }));

  ws.on('message', (data) => handleMessage(ws, data.toString()));
  ws.on('close', () => console.log('[WS] 连接断开'));

  // 心跳
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// 心跳检测（每30秒）
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

// ── 启动时恢复 ──
snapshot.refresh();
timerRegistry.recover((visitId) => {
  const broadcast = require('./utils/broadcast');
  alertEngine.trigger(visitId, (action, payload) => broadcast.all(action, payload));
});

// ── 启动服务 ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 长盈·院内求美者雷达系统 v1.0 → http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket → ws://0.0.0.0:${PORT}/ws`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  timerRegistry.shutdown();
  server.close();
});

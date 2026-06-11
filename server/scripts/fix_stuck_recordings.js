/**
 * 急救脚本：清理永久卡死在 analyzing/transcribing 状态的录音记录
 *
 * 执行方法（在服务器 server/ 目录下）：
 *   node scripts/fix_stuck_recordings.js
 *
 * 效果：将所有超过 30 分钟仍处于 analyzing/transcribing 状态的记录
 *       重置为 failed，防止前端无限轮询。
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'flowradar.db');
const db = new Database(DB_PATH);

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 分钟
const now = Date.now();
const cutoff = now - STUCK_THRESHOLD_MS;

console.log('=== 卡死录音修复脚本 ===');
console.log(`当前时间: ${new Date(now).toLocaleString()}`);
console.log(`超时阈值: 30 分钟（${new Date(cutoff).toLocaleString()} 之前创建的）`);
console.log('');

// 1. 查看当前卡死记录
const stuck = db.prepare(`
  SELECT id, guest_name, status, created_at, error_message
  FROM visit_recordings
  WHERE status IN ('analyzing', 'transcribing', 'uploaded')
  ORDER BY created_at DESC
`).all();

if (stuck.length === 0) {
  console.log('✅ 没有卡死的记录，数据库状态正常。');
  process.exit(0);
}

console.log(`发现 ${stuck.length} 条待检查记录：`);
stuck.forEach(r => {
  const age = Math.round((now - r.created_at) / 60000);
  const isStuck = r.created_at < cutoff;
  console.log(`  [${isStuck ? '🔴 卡死' : '🟡 处理中'}] #${r.id} ${r.guest_name} | status=${r.status} | 已等待 ${age} 分钟`);
});

// 2. 修复超时记录
const result = db.prepare(`
  UPDATE visit_recordings
  SET status = 'failed',
      error_message = '服务异常中断，status 永久卡死，已由修复脚本重置（' || datetime(created_at/1000, 'unixepoch', 'localtime') || '）'
  WHERE status IN ('analyzing', 'transcribing', 'uploaded')
    AND created_at < ?
`).run(cutoff);

console.log('');
console.log(`✅ 已重置 ${result.changes} 条卡死记录为 failed 状态。`);
console.log('');
console.log('下一步：重启服务，前端轮询将自动停止。');

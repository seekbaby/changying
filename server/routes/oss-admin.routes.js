/**
 * OSS 文档管理路由 (v7.1)
 * ─ 白名单/管理员查看 OSS 云端文件列表、生成签名下载链接
 */
const express = require('express');
const OSS = require('ali-oss');
const { authMiddleware } = require('../middleware/auth.middleware');
const { whitelistMiddleware } = require('../middleware/whitelist.middleware');
const { adminGuard } = require('../middleware/adminGuard.middleware');
const recordingService = require('../services/recording.service');

const router = express.Router();

// ═══════════════════════════════════════════
// OSS 客户端（懒初始化）
// ═══════════════════════════════════════════
const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-cn-shanghai',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || 'cy4',
};

let _ossClient = null;
function getOssClient() {
  if (!_ossClient) {
    if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
      throw new Error('OSS 配置缺失');
    }
    _ossClient = new OSS(OSS_CONFIG);
  }
  return _ossClient;
}

// ═══════════════════════════════════════════
// GET /api/oss-admin/list?prefix=asr-temp/
// ─ 列出 OSS 指定前缀下的文件
// ═══════════════════════════════════════════
router.get('/list', whitelistMiddleware, async (req, res) => {
  try {
    const prefix = req.query.prefix || 'asr-temp/';
    const maxKeys = parseInt(req.query.limit) || 100;

    const ossClient = getOssClient();
    const result = await ossClient.list({ prefix, 'max-keys': maxKeys }, {});

    const files = (result.objects || []).map(obj => ({
      name: obj.name,
      size: obj.size,
      lastModified: obj.lastModified,
      url: ossClient.signatureUrl(obj.name, { expires: 600 }), // 10分钟有效
    }));

    res.json({
      success: true,
      prefix,
      count: files.length,
      files,
      nextMarker: result.nextMarker || null,
    });
  } catch (e) {
    console.error('[OSS Admin] 列表获取失败:', e.message);
    res.status(500).json({ success: false, error: '获取文件列表失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/oss-admin/download?key=asr-temp/xxx.mp3
// ─ 生成 OSS 签名下载链接（30分钟有效）
// ═══════════════════════════════════════════
router.get('/download', whitelistMiddleware, async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) {
      return res.status(400).json({ success: false, error: '缺少 key 参数' });
    }

    // 安全检查：防止目录穿越
    if (key.includes('..')) {
      return res.status(400).json({ success: false, error: '非法路径' });
    }

    const ossClient = getOssClient();
    const url = ossClient.signatureUrl(key, { expires: 1800 }); // 30分钟

    res.json({ success: true, key, url });
  } catch (e) {
    console.error('[OSS Admin] 签名生成失败:', e.message);
    res.status(500).json({ success: false, error: '生成下载链接失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/oss-admin/stats
// ─ 统计信息：各前缀文件数、总大小
// ═══════════════════════════════════════════
router.get('/stats', authMiddleware, adminGuard, async (req, res) => {
  try {
    const ossClient = getOssClient();
    const prefixes = ['asr-temp/', 'photos/'];
    const stats = {};

    for (const prefix of prefixes) {
      const result = await ossClient.list({ prefix, 'max-keys': 1000 }, {});
      stats[prefix] = {
        count: (result.objects || []).length,
        totalSize: (result.objects || []).reduce((sum, o) => sum + (o.size || 0), 0),
      };
    }

    res.json({ success: true, stats });
  } catch (e) {
    console.error('[OSS Admin] 统计失败:', e.message);
    res.status(500).json({ success: false, error: '统计失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/oss-admin/recording/:id/url
// ─ 根据录音记录 ID 获取 OSS 签名播放 URL
// ═══════════════════════════════════════════
router.get('/recording/:id/url', whitelistMiddleware, (req, res) => {
  try {
    const recording = recordingService.getRecording(parseInt(req.params.id));
    if (!recording || !recording.file_name) {
      return res.status(404).json({ success: false, error: '录音记录不存在' });
    }
    const url = recordingService.generateOssUrl(recording.file_name);
    res.json({ success: true, id: req.params.id, url });
  } catch (e) {
    res.status(500).json({ success: false, error: '生成播放链接失败: ' + e.message });
  }
});

module.exports = router;

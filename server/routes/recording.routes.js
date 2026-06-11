/**
 * 面诊录音路由 (v7.1)
 * ─ 前端直传 OSS 架构：后端生成 Policy 签名，前端直传
 * ─ 火山引擎 ASR 双模式：标准分析（默认）/ 极速版
 */
const express = require('express');
const crypto = require('crypto');
const recordingService = require('../services/recording.service');

const router = express.Router();

// ═══════════════════════════════════════════
// OSS 配置
// ═══════════════════════════════════════════
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-shanghai';
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID || '';
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET || '';
const OSS_BUCKET = process.env.OSS_BUCKET || 'cy4';

const OSS_HOST = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
const OSS_DIR_PREFIX = 'asr-temp/';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// ═══════════════════════════════════════════
// GET /api/recordings/oss-policy
// ═══════════════════════════════════════════
router.get('/oss-policy', (req, res) => {
  try {
    if (!OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) {
      return res.status(500).json({
        success: false,
        error: 'OSS 配置缺失：OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET'
      });
    }

    const randomStr = crypto.randomBytes(6).toString('hex');
    const ossObjectName = `${OSS_DIR_PREFIX}${Date.now()}_${randomStr}.mp3`;

    const expiration = new Date(Date.now() + 300 * 1000).toISOString();

    const policy = {
      expiration,
      conditions: [
        { bucket: OSS_BUCKET },
        ['starts-with', '$key', OSS_DIR_PREFIX],
        ['content-length-range', 0, MAX_FILE_SIZE],
      ],
    };

    const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64');

    const signature = crypto
      .createHmac('sha1', OSS_ACCESS_KEY_SECRET)
      .update(policyBase64)
      .digest('base64');

    res.json({
      success: true,
      policy: {
        host: OSS_HOST,
        dir: OSS_DIR_PREFIX,
        ossObjectName,
        OSSAccessKeyId: OSS_ACCESS_KEY_ID,
        policy: policyBase64,
        signature,
        expire: Math.floor(Date.now() / 1000) + 300,
      },
    });
  } catch (e) {
    console.error('[OSS Policy] 生成失败:', e.message);
    res.status(500).json({ success: false, error: 'Policy 生成失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// POST /api/recordings/notify-uploaded
// Body (JSON): { visitId, guestName, ossObjectName, fileSize, asrMode? }
// asrMode: 'standard'（默认，夜间批处理）| 'express'（极速版 ¥9.99/次）
// ═══════════════════════════════════════════
router.post('/notify-uploaded', express.json(), async (req, res) => {
  try {
    const { visitId, guestName, ossObjectName, fileSize, asrMode } = req.body;

    // visitId=0 用于测试场，必须接受（!visitId 会误杀 0）
    if (visitId === undefined || visitId === null || visitId === '') {
      return res.status(400).json({ success: false, error: '缺少 visitId' });
    }
    if (!ossObjectName) {
      return res.status(400).json({ success: false, error: '缺少 ossObjectName' });
    }

    const vid = parseInt(visitId);
    const name = (guestName || 'unknown').trim();
    const fsize = parseInt(fileSize) || 0;
    const mode = asrMode === 'express' ? 'express' : 'standard';

    // 保存到数据库
    const recordingId = recordingService.saveRecording(vid, name, ossObjectName, fsize, mode);

    // 异步启动分析流水线（不阻塞 HTTP 响应）
    recordingService.runFullPipeline(recordingId, ossObjectName, mode);

    res.json({
      success: true,
      recording: {
        id: recordingId,
        visit_id: vid,
        guest_name: name,
        file_name: ossObjectName,
        file_size: fsize,
        asr_mode: mode,
        status: 'uploaded',
        created_at: Date.now(),
      },
    });
  } catch (e) {
    console.error('[Notify Uploaded] 失败:', e.message);
    res.status(500).json({ success: false, error: '通知处理失败: ' + e.message });
  }
});


// ═══════════════════════════════════════════
// GET /api/recordings
// 列出录音记录（最近 N 条）
// ═══════════════════════════════════════════
router.get('/', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const visitId = req.query.visitId ? parseInt(req.query.visitId) : null;
    const recordings = recordingService.listAllRecordings(limit, visitId);
    res.json({ success: true, recordings });
  } catch (e) {
    res.status(500).json({ success: false, error: '获取录音列表失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/recordings/:id
// 获取单条录音详情（含转写文本、分析报告）
// ═══════════════════════════════════════════
router.get('/:id', (req, res) => {
  try {
    const recording = recordingService.getRecording(parseInt(req.params.id));
    if (!recording) {
      return res.status(404).json({ success: false, error: '录音记录不存在' });
    }
    res.json({ success: true, recording });
  } catch (e) {
    res.status(500).json({ success: false, error: '获取录音详情失败: ' + e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/recordings/playback/:id
// 返回 OSS 签名播放 URL（v7.0: 含真实时间戳，支持 jumpToAudio）
// ═══════════════════════════════════════════
router.get('/playback/:id', (req, res) => {
  try {
    const recording = recordingService.getRecording(parseInt(req.params.id));
    if (!recording || !recording.file_name) {
      return res.status(404).json({ success: false, error: '录音记录不存在' });
    }
    const url = recordingService.generateOssUrl(recording.file_name);
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, error: '生成播放链接失败: ' + e.message });
  }
});

module.exports = router;

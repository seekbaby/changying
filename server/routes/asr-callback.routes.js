/**
 * V3 ASR Callback 路由 — 火山引擎转写完成后主动回调
 * POST /api/v3/asr-callback
 */
const express = require('express');
const router = express.Router();

// 延迟引入避免循环依赖
let recordingService = null;

// 内联解析，避免额外依赖
router.post('/asr-callback', express.json(), async (req, res) => {
  try {
    // 火山引擎回调在 Header 里放状态码
    const statusCode = parseInt(req.headers['x-api-status-code'] || '0', 10);
    const message = req.headers['x-api-message'] || '';

    console.log(`[ASR Callback] 收到回调 | code=${statusCode} msg=${message}`);

    // ★ 立即返回 200，让火山引擎知道已收到（不阻塞）
    res.json({ code: 0, message: 'ok' });

    // 异步处理转写结果
    handleCallbackAsync(statusCode, req.body).catch(err =>
      console.error('[ASR Callback] 异步处理失败:', err.message)
    );

  } catch (err) {
    console.error('[ASR Callback] 同步异常:', err.message);
    res.status(200).json({ code: 0, message: 'received' });
  }
});

async function handleCallbackAsync(statusCode, body) {
  // 延迟加载避免循环依赖
  if (!recordingService) {
    recordingService = require('../services/recording.service');
  }

  // 从 callback_data 提取 recordingId
  const recordingId = parseInt(body?.callback_data || '0', 10);
  if (!recordingId) {
    console.warn('[ASR Callback] callback_data 缺少 recordingId');
    return;
  }

  console.log(`[ASR Callback] 处理 recording #${recordingId} | code=${statusCode}`);

  if (statusCode !== 20000000) {
    recordingService.setError(recordingId, `V3 回调错误 (code=${statusCode})`);
    return;
  }

  // 解析转写结果
  const utterances = body?.result?.utterances || [];
  const text = body?.result?.text || '';
  const duration = body?.audio_info?.duration || 0;

  if (!text && utterances.length === 0) {
    recordingService.setError(recordingId, 'V3 回调返回空转写结果');
    return;
  }

  try {
    // 继续后续流水线（DeepSeek 分析 + OSS 保存）
    await recordingService.continueAfterTranscribe(recordingId, text, utterances, duration);
    console.log(`[ASR Callback] recording #${recordingId} 流水线完成`);
  } catch (err) {
    console.error(`[ASR Callback] recording #${recordingId} 失败:`, err.message);
    recordingService.setError(recordingId, err.message);
  }
}

module.exports = router;

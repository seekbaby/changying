/**
 * 录音上传 HTTP 路由 v4.0
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const recordingService = require('../services/recording.service');

// multer 配置（临时目录）
const upload = multer({
  dest: '/tmp/changying-recordings/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (ext.endsWith('.mp3') || ext.endsWith('.wav') || ext.endsWith('.m4a') || ext.endsWith('.aac') || ext.endsWith('.webm')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 MP3 / WAV / M4A / AAC / WebM 格式'));
    }
  }
});

// POST /api/recordings/upload
router.post('/recordings/upload', upload.single('recording'), (req, res) => {
  try {
    const { visitId, guestName } = req.body;
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    if (!visitId) return res.status(400).json({ error: '缺少 visitId' });
    if (!guestName) return res.status(400).json({ error: '缺少 guestName' });

    const result = recordingService.saveRecording(Number(visitId), guestName, req.file);

    // 异步启动全流程
    recordingService.runFullPipeline(result.id, result.publicUrl);

    res.json({
      success: true,
      recording: {
        id: result.id,
        filename: result.filename,
        status: 'uploaded'
      }
    });
  } catch (e) {
    console.error('[Recordings] 上传失败:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/recordings/:visitId
router.get('/recordings/:visitId', (req, res) => {
  try {
    const list = recordingService.listByVisit(Number(req.params.visitId));
    res.json({ success: true, recordings: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/recordings/:id
router.delete('/recordings/:id', (req, res) => {
  try {
    const ok = recordingService.remove(Number(req.params.id));
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

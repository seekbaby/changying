/**
 * 手机照 REST API
 * 原图归档 + 缩略图上传 / 列表 / 删除
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database/init');

const router = express.Router();

// ── 存储根目录 ──
const PHOTOS_ROOT = path.join(__dirname, '..', '..', 'data', 'photos');

// ── multer 临时接收 ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB 原图上限
});

// ── 路径粉碎器 ──
function sanitize(name) {
  return (name || '未知').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
}

/**
 * 生成文件路径：{姓名}_{日期}/{姓名}_{日期}_{类型}_{序号}.ext
 * 序号为同类型单调递增流水号
 */
function generateFilePath(guestName, visitDate, photoType, ext) {
  const safe = sanitize(guestName);
  const dirName = `${safe}_${visitDate}`;
  const dirPath = path.join(PHOTOS_ROOT, dirName);
  fs.mkdirSync(dirPath, { recursive: true });

  // 找同类型已有最大序号
  const existing = fs.readdirSync(dirPath)
    .filter(f => f.startsWith(`${safe}_${visitDate}_${photoType}_`) && !f.includes('_thumb'))
    .map(f => {
      const m = f.match(/_(\d{3})\./);
      return m ? parseInt(m[1]) : 0;
    })
    .sort((a, b) => b - a);

  const seq = String((existing[0] || 0) + 1).padStart(3, '0');
  const filename = `${safe}_${visitDate}_${photoType}_${seq}.${ext}`;
  const thumbName = `${safe}_${visitDate}_${photoType}_${seq}_thumb.webp`;

  return {
    dirName,
    dirPath,
    filename,
    thumbName,
    filePath: `${dirName}/${filename}`,
    thumbPath: `${dirName}/${thumbName}`
  };
}

// ═══════════════════════════════════════════
// POST /api/photos/upload
// ═══════════════════════════════════════════
router.post('/photos/upload',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'thumb', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      const { visitId, photoType } = req.body;
      if (!visitId) return res.status(400).json({ error: '缺少 visitId' });
      if (!photoType || !['pre', 'post'].includes(photoType)) {
        return res.status(400).json({ error: 'photoType 必须为 pre 或 post' });
      }

      const photoFile = req.files?.photo?.[0];
      const thumbFile = req.files?.thumb?.[0];
      if (!photoFile) return res.status(400).json({ error: '缺少 photo 文件' });
      if (!thumbFile) return res.status(400).json({ error: '缺少 thumb 文件' });

      // 查接诊单
      const visit = db.prepare('SELECT guest_name, visit_date FROM visits WHERE id = ?')
        .get(parseInt(visitId));
      if (!visit) return res.status(404).json({ error: '接诊单不存在' });

      // 检查每类上限（术前最多8张，术后最多8张）
      const typeCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM visit_photos WHERE visit_id = ? AND photo_type = ?'
      ).get(parseInt(visitId), photoType);
      if (typeCount.cnt >= 8) {
        return res.status(400).json({ error: `${photoType === 'pre' ? '术前' : '术后'}已满8张` });
      }

      // 生成路径
      const ext = photoFile.originalname.split('.').pop() || 'jpg';
      const paths = generateFilePath(visit.guest_name, visit.visit_date, photoType, ext);

      // 写入原图
      fs.writeFileSync(path.join(paths.dirPath, paths.filename), photoFile.buffer);
      // 写入缩略图
      fs.writeFileSync(path.join(paths.dirPath, paths.thumbName), thumbFile.buffer);

      // DB 记录
      const result = db.prepare(`
        INSERT INTO visit_photos (visit_id, photo_type, file_path, thumb_path, file_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        parseInt(visitId), photoType,
        paths.filePath, paths.thumbPath,
        photoFile.size, Date.now()
      );

      res.json({
        success: true,
        photo: {
          id: result.lastInsertRowid,
          visit_id: parseInt(visitId),
          photo_type: photoType,
          file_path: paths.filePath,
          thumb_path: paths.thumbPath,
          file_size: photoFile.size,
          created_at: Date.now()
        }
      });
    } catch (err) {
      console.error('[Photos] upload error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ═══════════════════════════════════════════
// GET /api/photos/list/:visitId
// ═══════════════════════════════════════════
router.get('/photos/list/:visitId', (req, res) => {
  try {
    const photos = db.prepare(
      'SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY created_at ASC'
    ).all(parseInt(req.params.visitId));
    res.json({ success: true, photos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// DELETE /api/photos/:photoId
// ═══════════════════════════════════════════
router.delete('/photos/:photoId', (req, res) => {
  try {
    const photo = db.prepare('SELECT * FROM visit_photos WHERE id = ?')
      .get(parseInt(req.params.photoId));
    if (!photo) return res.status(404).json({ error: '照片不存在' });

    // 删原图
    const origPath = path.join(PHOTOS_ROOT, photo.file_path);
    if (fs.existsSync(origPath)) fs.unlinkSync(origPath);

    // 删缩略图
    const thumbPath = path.join(PHOTOS_ROOT, photo.thumb_path);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    // 尝试删空子文件夹
    const dirPath = path.dirname(origPath);
    try { fs.rmdirSync(dirPath); } catch {}

    // 删 DB 记录
    db.prepare('DELETE FROM visit_photos WHERE id = ?').run(photo.id);

    res.json({ success: true, deletedId: photo.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

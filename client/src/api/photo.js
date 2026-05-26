/**
 * 手机照 API 封装
 */
const BASE = '/api/photos';

export async function uploadPhoto(file, thumbBlob, visitId, photoType) {
  const form = new FormData();
  form.append('photo', file, file.name || 'photo.jpg');
  form.append('thumb', thumbBlob, 'thumb.webp');
  form.append('visitId', visitId);
  form.append('photoType', photoType);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`上传失败: ${res.status}`);
  return res.json();
}

export async function listPhotos(visitId) {
  const res = await fetch(`${BASE}/list/${visitId}`);
  if (!res.ok) throw new Error(`获取照片列表失败: ${res.status}`);
  return res.json();
}

export async function deletePhoto(photoId) {
  const res = await fetch(`${BASE}/${photoId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
  return res.json();
}

/**
 * 生成缩略图 WebP（经典 Image + ObjectURL，兼容 iOS Safari）
 * 规则3：阅后即焚
 */
export function createThumbnail(file, maxW = 300) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob);
      }, 'image/webp', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('缩略图生成失败'));
    };
    img.src = url;
  });
}

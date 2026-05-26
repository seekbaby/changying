#!/usr/bin/env node
/**
 * 讯飞语音转写 API 探路脚本
 * ============================
 * 独立验证讯飞 HMAC-SHA256 签名和长语音转写（LFASR）通路。
 * 零外部依赖，纯 Node.js 内置模块。
 *
 * 用法:
 *   IFLYTEK_APP_ID=xxx IFLYTEK_SECRET_KEY=xxx node test_iflytek.js /path/to/audio.mp3
 *
 * 流程:
 *   ① HMAC-SHA256 签名  →  ② multipart 上传音频  →  ③ 轮询结果
 *
 * 讯飞 LFASR REST API（v2）:
 *   上传: POST https://raasr.xfyun.cn/v2/api/upload
 *   查询: POST https://raasr.xfyun.cn/v2/api/getResult
 *   签名: signa = base64(HMAC-SHA256(secretKey, appId + timestamp))
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── 配置 ────────────────────────────────────────────────────
const APP_ID = process.env.IFLYTEK_APP_ID;
const SECRET_KEY = process.env.IFLYTEK_SECRET_KEY;
const API_HOST = 'raasr.xfyun.cn';
const UPLOAD_PATH = '/v2/api/upload';
const RESULT_PATH = '/v2/api/getResult';
const POLL_INTERVAL_MS = 5000;   // 每 5 秒轮询一次
const MAX_POLL_SECONDS = 600;     // 最长等 10 分钟

// ─── 工具函数 ────────────────────────────────────────────────

/** HMAC-SHA256 签名块 */
function generateSigna(timestamp) {
  const raw = APP_ID + timestamp;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(raw);
  return hmac.digest('base64');
}

/** 发起 HTTPS 请求（返回原始 buffer） */
function httpsRequest(method, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: pathStr,
      method,
      headers,
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text), raw: text });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: null, raw: text });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    if (body) req.write(body);
    req.end();
  });
}

/** multipart/form-data 体构建 */
function buildMultipart(filePath) {
  const boundary = '----IflytekUpload' + Date.now();
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    boundary,
    body: Buffer.concat([header, fileBuffer, footer]),
    size: fileBuffer.length,
  };
}

// ─── 步骤 1：上传音频 ────────────────────────────────────────

async function uploadAudio(filePath) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signa = generateSigna(ts);

  const { boundary, body, size } = buildMultipart(filePath);

  console.log('📤 [1/3] 上传音频文件...');
  console.log(`   文件: ${path.basename(filePath)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   APP_ID: ${APP_ID}`);
  console.log(`   时间戳: ${ts}`);
  console.log(`   签名(signa): ${signa.substring(0, 20)}...`);

  const res = await httpsRequest('POST', UPLOAD_PATH, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
    'appId': APP_ID,
    'signa': signa,
    'ts': ts,
  }, body);

  console.log(`   响应状态: ${res.status}`);
  console.log(`   响应体: ${res.raw.substring(0, 300)}`);

  if (!res.data || res.data.code !== '0') {
    throw new Error(`上传失败: ${res.data?.message || res.raw}`);
  }

  const orderId = res.data.content?.orderId;
  if (!orderId) {
    throw new Error(`上传响应中未找到 orderId: ${res.raw}`);
  }

  console.log(`   ✅ 上传成功！orderId: ${orderId}`);
  return orderId;
}

// ─── 步骤 2 + 3：轮询转写结果 ────────────────────────────────

async function pollResult(orderId) {
  const startTime = Date.now();

  console.log(`\n📥 [2/3] 开始轮询转写结果（每 ${POLL_INTERVAL_MS / 1000}s 一次，最长 ${MAX_POLL_SECONDS}s）...`);

  let attempt = 0;
  while (true) {
    attempt++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (elapsed > MAX_POLL_SECONDS) {
      throw new Error(`轮询超时（${MAX_POLL_SECONDS}s），orderId: ${orderId}`);
    }

    const ts = Math.floor(Date.now() / 1000).toString();
    const signa = generateSigna(ts);

    await sleep(POLL_INTERVAL_MS);

    const res = await httpsRequest('POST', RESULT_PATH, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(`orderId=${orderId}`),
      'appId': APP_ID,
      'signa': signa,
      'ts': ts,
    }, `orderId=${orderId}`);

    const status = res.data?.orderInfo?.status;
    const statusMap = { 1: '排队中', 2: '处理中', 3: '处理完成(合并中)', 4: '转写完成' };
    const statusText = statusMap[status] || `未知(${status})`;

    console.log(`   [#${attempt} · ${elapsed}s] 状态: ${statusText}`);

    if (status === 4) {
      console.log(`   ✅ 转写完成！`);
      return res.data;
    }
    if (status === -1 || res.data?.code !== '0') {
      console.log(`   ❌ 转写出错: ${JSON.stringify(res.data)}`);
      return res.data;
    }
  }
}

// ─── 步骤 3：解析结果 ────────────────────────────────────────

function parseResult(data) {
  console.log(`\n📝 [3/3] 解析转写结果:`);

  if (!data || !data.content) {
    console.log('   ⚠️ 无转写内容');
    return '';
  }

  let orderResult = data.content.orderResult;
  if (!orderResult) {
    console.log('   ⚠️ orderResult 为空');
    return '';
  }

  // orderResult 是 JSON 字符串
  let parsed;
  try {
    parsed = typeof orderResult === 'string' ? JSON.parse(orderResult) : orderResult;
  } catch {
    console.log(`   ⚠️ orderResult 不是有效 JSON: ${orderResult.substring(0, 200)}`);
    return '';
  }

  // 提取 onebest 字段（最佳转写结果）
  const lines = [];
  if (Array.isArray(parsed)) {
    for (const seg of parsed) {
      if (seg.onebest) {
        // 移除标点之间的空格，美化输出
        const text = seg.onebest.replace(/\s+/g, '');
        lines.push(text);
      }
    }
  } else if (parsed.onebest) {
    lines.push(parsed.onebest);
  }

  const fullText = lines.join('\n');
  console.log(`   转写文本长度: ${fullText.length} 字`);
  console.log(`   分段数: ${lines.length}`);
  console.log(`\n─── 转写文本预览（前 500 字）───`);
  console.log(fullText.substring(0, 500));
  if (fullText.length > 500) console.log('   ...(截断)');
  console.log(`─── 预览结束 ───\n`);

  // 如果有 speaker separation（说话人分离），也打印出来
  if (Array.isArray(parsed) && parsed.some(s => s.speaker !== undefined)) {
    console.log('🗣️ 说话人分离结果:');
    for (const seg of parsed) {
      console.log(`   [说话人${seg.speaker || '?'}] ${(seg.onebest || '').replace(/\s+/g, '')}`);
    }
  }

  return fullText;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── main ────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  讯飞语音转写 API 探路脚本');
  console.log('═══════════════════════════════════════════\n');

  // 校验环境变量
  if (!APP_ID || !SECRET_KEY) {
    console.log('❌ 缺少环境变量！\n');
    console.log('用法:');
    console.log('  export IFLYTEK_APP_ID=你的AppID');
    console.log('  export IFLYTEK_SECRET_KEY=你的SecretKey');
    console.log('  node test_iflytek.js /path/to/test.mp3\n');
    console.log('在讯飞开放平台 https://console.xfyun.cn/ 获取凭证。');
    process.exit(1);
  }

  // 校验文件
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('❌ 请提供音频文件路径！\n');
    console.log('用法: node test_iflytek.js /path/to/test.mp3');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  const supported = ['.mp3', '.wav', '.m4a', '.pcm', '.aac', '.opus', '.flac', '.amr', '.wma'];
  if (!supported.includes(ext)) {
    console.log(`⚠️ 文件格式 ${ext} 可能不被支持，支持的格式: ${supported.join(', ')}`);
    console.log('   继续尝试上传...\n');
  }

  try {
    // ① 上传
    const orderId = await uploadAudio(filePath);

    // ② 轮询
    const result = await pollResult(orderId);

    // ③ 解析
    const text = parseResult(result);

    console.log('═══════════════════════════════════════════');
    if (text) {
      console.log('  ✅ 探路成功！讯飞 API 通路打通。');
      console.log(`  转写文本共 ${text.length} 字符`);
    } else {
      console.log('  ⚠️ 探路完成但未获取到有效转写文本。');
      console.log('  请检查音频文件是否包含有效语音内容。');
    }
    console.log('═══════════════════════════════════════════');

  } catch (err) {
    console.log(`\n❌ 探路失败: ${err.message}`);
    console.log('\n💡 常见原因排查:');
    console.log('  1. APP_ID 或 SECRET_KEY 不正确 → 登录 https://console.xfyun.cn/ 确认');
    console.log('  2. 未开通「语音转写」服务 → 在控制台领取免费额度');
    console.log('  3. 签名算法不匹配 → 检查下方签名 debug 信息');
    console.log('  4. 音频格式不支持 → 尝试转码为标准 mp3/wav');
    console.log(`  5. 网络不通 → ping ${API_HOST}`);
    process.exit(1);
  }
}

main();

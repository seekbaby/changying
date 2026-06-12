/**
 * 面诊录音服务 (v7.0)
 * ─ 前端直传 OSS 架构：录音文件已由前端直接上传到 OSS
 * ─ 火山引擎 ASR（替代百炼）→ 原生说话人分离 + 时间戳
 * ─ 双模式：标准分析（豆包2.0，¥0.80/h）/ 极速版（大模型，¥4.50/h）
 */
const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
const crypto = require('crypto');
const { db } = require('../database/init');

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════
const VOLCENGINE_APP_ID = process.env.VOLCENGINE_APP_ID || '9501334674';
const VOLCENGINE_TOKEN = process.env.VOLCENGINE_TOKEN || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// 火山引擎 V3 豆包大模型录音识别 API (2.0版)
const V3_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const V3_QUERY_URL  = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
const V3_RESOURCE_ID = 'volc.seedasr.auc';

const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-cn-shanghai',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || 'cy4',
};

const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'data', 'recordings');

/** OSS 客户端 — 懒初始化，首次调用时创建 */
let _ossClient = null;
function getOssClient() {
  if (!_ossClient) {
    if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
      throw new Error('OSS 配置缺失：OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET');
    }
    _ossClient = new OSS({
      ...OSS_CONFIG,
      secure: true,  // ★ 火山引擎需要 HTTPS 下载
    });
  }
  return _ossClient;
}

// 录音文件最大保留时间（毫秒）— 超过此时间的 uploaded/transcribing 记录视为僵尸
const ZOMBIE_TIMEOUT_MS = 30 * 60 * 1000;

// ═══════════════════════════════════════════
// 医美面诊销冠复盘 Prompt (v5.1 → v7.0)
// ═══════════════════════════════════════════
const ANALYSIS_PROMPT = `你是一个年薪百万的顶级医美销冠兼商业分析师。你的任务是分析这段已标注说话人角色的面诊录音转写文本，并严格输出一个 JSON 对象，绝不要输出任何多余的解释性文字。

你的输出必须严格符合以下 JSON 结构：
{
  "data_points": {
    "client_opportunities_count": 0,
    "consultant_caught_count": 0
  },
  "analysis_questions": {
    "q1_real_demand": {
      "summary": "客户真正想买的是什么（例如：年轻感、上镜感，而非表面的苹果肌/法令纹）",
      "evidence": [
        { "quote": "提取客户揭示真实意图的原话" }
      ]
    },
    "q2_proposed_solutions": {
      "summary": "本次面诊提出了哪些方案（如：单纯玻尿酸填充、未联合其他项目）",
      "evidence": [
        { "quote": "提取咨询师给出方案的原话" }
      ]
    },
    "q3_missed_opportunities": {
      "summary": "咨询师遗漏了哪些重要机会（如：光电紧致、长期抗衰疗程设计、再生材料铺垫等）",
      "evidence": [
        { "quote": "提取表明错失机会的上下文原话" }
      ]
    },
    "q4_business_loss": {
      "summary": "作为经营者，因为这次不完美的咨询损失了什么（直击痛点，如：单次推销导致损失客户全生命周期的抗衰账户）",
      "evidence": [
        { "quote": "提取体现由于操作不当导致防御升高或错失大单的原话" }
      ]
    }
  }
}

注意：
- evidence 数组中的 quote 必须是对话中的原话缩影
- 输出必须是纯 JSON，不要任何 markdown 代码块包裹`;

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));

function sanitize(name) {
  return (name || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') || 'unknown';
}

function formatFileName(guestName) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  return `${sanitize(guestName)}_面诊_${dateStr}_${timeStr}.mp3`;
}

// ═══════════════════════════════════════════
// 数据库操作
// ═══════════════════════════════════════════

/** 保存录音记录 → 返回 id */
function saveRecording(visitId, guestName, fileName, fileSize, asrMode = 'standard') {
  const now = Date.now();
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
  const result = db.prepare(`
    INSERT INTO visit_recordings (visit_id, guest_name, file_path, file_size, status, asr_mode, created_at)
    VALUES (?, ?, ?, ?, 'uploaded', ?, ?)
  `).run(visitId, guestName, fileName, fileSize, asrMode, now);
  return result.lastInsertRowid;
}

function setStatus(id, status) {
  if (status === 'completed') {
    db.prepare('UPDATE visit_recordings SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
  } else {
    db.prepare('UPDATE visit_recordings SET status = ? WHERE id = ?')
      .run(status, id);
  }
}

function setError(id, message) {
  db.prepare("UPDATE visit_recordings SET status = 'failed', error_message = ? WHERE id = ?")
    .run(message, id);
}

function listRecordings(visitId) {
  return db.prepare(`
    SELECT vr.*, sa.name as assistant_name
    FROM visit_recordings vr
    LEFT JOIN visits v ON vr.visit_id = v.id
    LEFT JOIN staff sa ON v.assigned_assistant_id = sa.id
    WHERE vr.visit_id = ?
    ORDER BY vr.created_at DESC
  `).all(visitId);
}

/** 列出全部录音（按 visitId 可选过滤，limit 控制条数） */
function listAllRecordings(limit = 20, visitId = null) {
  if (visitId !== null) {
    return db.prepare(`
      SELECT vr.*, sa.name as assistant_name
      FROM visit_recordings vr
      LEFT JOIN visits v ON vr.visit_id = v.id
      LEFT JOIN staff sa ON v.assigned_assistant_id = sa.id
      WHERE vr.visit_id = ?
      ORDER BY vr.created_at DESC
      LIMIT ?
    `).all(visitId, limit);
  }
  return db.prepare(`
    SELECT vr.*, sa.name as assistant_name
    FROM visit_recordings vr
    LEFT JOIN visits v ON vr.visit_id = v.id
    LEFT JOIN staff sa ON v.assigned_assistant_id = sa.id
    ORDER BY vr.created_at DESC
    LIMIT ?
  `).all(limit);
}

function getRecording(id) {
  return db.prepare('SELECT * FROM visit_recordings WHERE id = ?').get(id);
}

/** 删除录音记录（含 OSS 文件清理） */
function deleteRecording(id) {
  const rec = getRecording(id);
  if (rec && rec.file_path) {
    try {
      const ossClient = getOssClient();
      ossClient.delete(rec.file_path).catch(() => {});
    } catch (_) {}
  }
  db.prepare('DELETE FROM visit_recordings WHERE id = ?').run(id);
}

/** 按角色获取已完成报告 */
function getReportsForRole(userId, role) {
  const base = `
    SELECT vr.*, v.guest_name, v.visit_date, sa.name as assistant_name
    FROM visit_recordings vr
    JOIN visits v ON vr.visit_id = v.id
    LEFT JOIN staff sa ON v.assigned_assistant_id = sa.id
  `;
  let sql, params;
  if (role === 'admin' || role === 'manager') {
    sql = base + `WHERE vr.status = 'completed' ORDER BY vr.completed_at DESC`;
    params = [];
  } else if (role === 'assistant') {
    sql = base + `WHERE vr.status = 'completed' AND v.assigned_assistant_id = ? ORDER BY vr.completed_at DESC`;
    params = [userId];
  } else if (role === 'doctor') {
    sql = base + `
      JOIN visit_doctors vd ON vr.visit_id = vd.visit_id
      WHERE vr.status = 'completed' AND vd.doctor_id = ?
      ORDER BY vr.completed_at DESC
    `;
    params = [userId];
  } else {
    return [];
  }
  return db.prepare(sql).all(...params);
}

/** 清理僵尸记录 */
function cleanupZombies() {
  const cutoff = Date.now() - ZOMBIE_TIMEOUT_MS;
  const zombies = db.prepare(`
    SELECT id FROM visit_recordings
    WHERE status IN ('uploading','transcribing','analyzing')
    AND created_at < ?
  `).all(cutoff);
  for (const z of zombies) {
    setError(z.id, '流水线超时（超过30分钟未完成），系统自动标记为失败');
  }
}

// ═══════════════════════════════════════════
// HTTP 请求工具
// ═══════════════════════════════════════════

async function httpGet(url, headers) {
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.text();
}

async function httpPostJson(url, body, headers = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

// ═══════════════════════════════════════════
// OSS 工具
// ═══════════════════════════════════════════

/** 为 OSS 对象生成签名 URL（3600s 有效期，供火山引擎下载） */
function generateOssUrl(ossObjectName) {
  const ossClient = getOssClient();
  const url = ossClient.signatureUrl(ossObjectName, { expires: 3600 });
  console.log(`[OSS] 签名 URL: ${url.slice(0, 100)}...`);
  return url;
}

/** 删除 OSS 云端中转文件（尽力而为） */
async function deleteOssFile(ossObjectName) {
  try {
    const ossClient = getOssClient();
    await ossClient.delete(ossObjectName);
    console.log(`[OSS] 已删除: ${ossObjectName}`);
  } catch (err) {
    console.warn(`[OSS] 删除失败（忽略）: ${ossObjectName} — ${err.message}`);
  }
}

/** 检查 OSS 文件是否存在 */
async function ossFileExists(ossObjectName) {
  try {
    const ossClient = getOssClient();
    await ossClient.head(ossObjectName);
    return true;
  } catch (_) {
    return false;
  }
}

// ═══════════════════════════════════════════
// ★ V3: 火山引擎豆包大模型录音识别 API (2.0版)
// ═══════════════════════════════════════════

/** 构建 V3 通用 Headers */
function v3Headers(reqId) {
  return {
    'Content-Type': 'application/json',
    'X-Api-App-Key': VOLCENGINE_APP_ID,
    'X-Api-Access-Key': VOLCENGINE_TOKEN,
    'X-Api-Resource-Id': V3_RESOURCE_ID,
    'X-Api-Request-Id': reqId,
    'X-Api-Sequence': '-1',
  };
}

/**
 * V3 提交异步转写任务
 * @param {string} ossUrl - OSS 签名 URL
 * @returns {{ reqId: string }}
 */
async function submitV3ASR(ossUrl, recordingId) {
  if (!VOLCENGINE_APP_ID) throw new Error('VOLCENGINE_APP_ID 未配置');
  if (!VOLCENGINE_TOKEN) throw new Error('VOLCENGINE_TOKEN 未配置');
  if (!ossUrl) throw new Error('OSS URL 为空');

  const reqId = crypto.randomUUID();

  // 自动检测音频格式
  const formatMap = { wav: 'wav', mp3: 'mp3', m4a: 'm4a', aac: 'aac', wma: 'wma', ogg: 'ogg', flac: 'flac', webm: 'webm' };
  const urlPath = ossUrl.split('?')[0];
  const ext = urlPath.split('.').pop().toLowerCase();
  const audioFormat = formatMap[ext] || 'mp3';

  // ★ 保存 reqId 到数据库，callback 时用 reqId 找到 recording
  if (recordingId) {
    db.prepare('UPDATE visit_recordings SET req_id = ? WHERE id = ?').run(reqId, recordingId);
  }

  const body = {
    user: { uid: 'changying_system' },
    audio: { format: audioFormat, url: ossUrl },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_speaker_info: true,
    },
    // ★ Callback 模式：火山引擎完成后主动回调，无需轮询
    callback: 'https://magicreviewbox.com/api/v3/asr-callback',
    callback_data: String(recordingId || 0),
  };

  console.log(`[ASR V3] 提交转写 | reqId:${reqId} | format:${audioFormat} | url:${ossUrl.slice(0, 60)}...`);
  
  // ★ V3 API 响应在 Headers 中
  const resp = await fetch(V3_SUBMIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...v3Headers(reqId) },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  const apiCode = parseInt(resp.headers.get('x-api-status-code') || '0', 10);
  const apiMsg = resp.headers.get('x-api-message') || '';
  console.log(`[ASR V3] 提交响应: code=${apiCode} msg=${apiMsg}`);

  if (!resp.ok) {
    throw new Error(`V3 提交 HTTP ${resp.status}: ${resp.statusText}`);
  }
  if (apiCode !== 20000000) {
    throw new Error(`V3 提交失败 (code=${apiCode}): ${apiMsg || JSON.stringify(json)}`);
  }
  console.log(`[ASR V3] ✅ 任务已提交 | reqId:${reqId}`);
  return { reqId };
}

/**
 * V3 轮询转写结果
 * 返回 { transcript: "格式化的带角色文本", timeline: [...] }
 */
async function queryV3ASR(reqId) {
  for (let i = 0; i < 90; i++) {
    await sleep(2000);

    // ★ V3 API 将状态码放在响应 Headers 中（x-api-status-code），不是 body
    const resp = await fetch(V3_QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...v3Headers(reqId) },
      body: '{}',
    });
    const json = await resp.json().catch(() => ({}));
    const apiCode = parseInt(resp.headers.get('x-api-status-code') || '0', 10);
    const apiMsg = resp.headers.get('x-api-message') || '';
    const code = json.resp?.code ?? apiCode;
    const message = json.resp?.message || apiMsg;

    // {} = 任务未完成/不存在，继续轮询
    if (!code) continue;

    // V3 状态码说明：
    //   20000000 = 提交成功 / 查询完成（结果在 body 的 resp.utterances）
    //   20000001 = 处理中（等价旧 1001）
    //   20000002 = 排队中（等价旧 1002）
    //   45000000+ = 错误
    if (code === 20000000) {
      // 20000000：result.utterances 有数据 → 已完成；无 → 继续轮询
      const utterances = json.result?.utterances || [];
      if (utterances.length > 0) {
        // 转写完成，构建文本和 timeline
        const transcript = buildTranscript(utterances);
        const timeline = buildTimeline(utterances);
        const duration = json.audio_info?.duration || 0;
        console.log(`[ASR V3] 转写完成: ${transcript.length} 字符, ${timeline.length} 句`);
        return { transcript: transcript.trim(), timeline, duration };
      }
      // utterances 为空：任务尚未完成，继续轮询
      continue;
    }

    if (code !== 20000001 && code !== 20000002) {
      throw new Error(`V3 转写失败 (code=${code}): ${message.slice(0, 200)}`);
    }
    // 20000001/20000002 = RUNNING → 继续轮询
  }
  throw new Error('V3 转写超时（180秒）');
}

// ═══════════════════════════════════════════
// 转写文本工具
// ═══════════════════════════════════════════

/** 清理语气词 */
function cleanFillerWords(text) {
  // 去掉独立语气词 + 标点（短于 2 字的纯语气词）
  const fillerOnly = /^[呃嗯啊哦唔嘛呀哎诶哈]{1,2}[，,。.！!？?]*$/;
  if (fillerOnly.test(text.trim())) return '';

  // 去掉开头的语气词
  let cleaned = text.replace(/^[呃嗯啊哦唔嘛呀哎诶哈]{1,2}[，,。.]?\s*/g, '');

  // 去掉结尾的语气词
  cleaned = cleaned.replace(/\s*[呃嗯啊哦唔嘛呀哎诶哈]{1,2}[，,。.]?$/g, '');

  // 去掉连续的语气词（如"嗯嗯嗯"）
  cleaned = cleaned.replace(/[呃嗯啊哦唔嘛呀哎诶哈]{3,}/g, '');

  // 消除多余空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || text.trim(); // fallback：如果清理成空串则保留原文
}

/**
 * 构建带说话人标签的转写文本
 * V3 返回的 speaker ID 是数字（1,2,3,4...），按首次出现顺序映射为 A,B,C...
 */
function buildTranscript(utterances) {
  const speakerMap = new Map(); // id → label
  let transcript = '';

  for (const u of utterances) {
    const sid = u.additions?.speaker || '0';
    if (!speakerMap.has(sid)) {
      speakerMap.set(sid, String.fromCharCode(65 + speakerMap.size)); // A,B,C...
    }
    const label = speakerMap.get(sid);

    const text = cleanFillerWords(u.text || '');
    if (!text) continue; // 纯语气词跳过

    const mm = String(Math.floor(u.start_time / 60000)).padStart(2, '0');
    const ss = String(Math.floor((u.start_time % 60000) / 1000)).padStart(2, '0');
    transcript += `[${mm}:${ss}] 👤 ${label}：${text}\n`;
  }
  return transcript.trim();
}

/** 从 utterances 构建 timeline（保留原始 speakerId 供分析） */
function buildTimeline(utterances) {
  const timeline = [];
  for (const u of utterances) {
    const speakerId = u.additions?.speaker || '0';
    const text = cleanFillerWords(u.text || '');
    if (!text) continue;
    timeline.push({
      s: speakerId, t: text,
      ms: u.start_time,
      dur: (u.end_time || u.start_time + 1000) - u.start_time,
    });
  }
  return timeline;
}

/**
 * 转写文本脱敏
 */
function sanitizeTranscript(text) {
  let result = text;
  result = result.replace(/1[3-9]\d{9}/g, '1**********');
  result = result.replace(/\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, '******************');
  return result;
}

/**
 * V3 转写（含 3 次重试）
 */
async function transcribeWithRetry(recordingId, ossUrl) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[Recording #${recordingId}] V3 ASR 尝试 ${attempt + 1}/3`);
      const { reqId } = await submitV3ASR(ossUrl);
      const { transcript, timeline, duration } = await queryV3ASR(reqId);
      const cleanText = sanitizeTranscript(transcript);
      db.prepare('UPDATE visit_recordings SET transcript = ?, timeline_json = ?, duration_sec = ? WHERE id = ?')
        .run(cleanText, JSON.stringify(timeline), Math.round(duration / 1000), recordingId);
      return { transcript: cleanText, timeline };
    } catch (e) {
      lastError = e;
      console.warn(`[Recording #${recordingId}] V3 ASR 尝试${attempt + 1} 失败: ${e.message}`);
      if (attempt < 2) await sleep(3000);
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════
// DeepSeek 质检分析 (v5.1 → v7.0: 无变化)
// ═══════════════════════════════════════════

/**
 * DeepSeek V4 Pro 分析（含 3 次重试）
 */
async function analyzeWithRetry(recordingId, transcript, apiKey) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[Recording #${recordingId}] DeepSeek 分析 尝试 ${attempt + 1}/3`);
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: ANALYSIS_PROMPT },
            { role: 'user', content: transcript }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        })
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`DeepSeek API 错误 (${resp.status}): ${text.slice(0, 200)}`);
      }

      const json = JSON.parse(text);
      let report = json.choices?.[0]?.message?.content;
      if (!report) {
        throw new Error('DeepSeek 返回无内容');
      }

      // 去除可能的 markdown 代码块包裹
      report = report.trim();
      if (report.startsWith('```')) {
        report = report.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      // 验证 JSON 结构
      let parsed;
      try {
        parsed = JSON.parse(report);
      } catch (parseErr) {
        throw new Error('JSON 解析失败: ' + parseErr.message + '。原始输出前100字: ' + report.slice(0, 100));
      }
      
      if (!parsed.data_points || !parsed.analysis_questions) {
        throw new Error('JSON 缺少必需字段 (data_points / analysis_questions)');
      }

      db.prepare('UPDATE visit_recordings SET report_json = ? WHERE id = ?')
        .run(JSON.stringify(parsed), recordingId);

      console.log(`[Recording #${recordingId}] ✅ 分析完成 (${JSON.stringify(parsed).length} 字符 JSON)`);
      return;
    } catch (e) {
      lastError = e;
      console.warn(`[Recording #${recordingId}] DeepSeek 分析 尝试${attempt + 1} 失败: ${e.message}`);
      const delay = e.message.includes('429') || e.message.includes('503') ? 8000 : 3000;
      if (attempt < 2) await sleep(delay);
    }
  }
  throw lastError;
}


// ═══════════════════════════════════════════
// ★ v7.0: 流水线（火山引擎 + 原生说话人分离）
// 状态机: uploaded → transcribing → transcribed → analyzing → completed
//         （不再有 diarizing 步骤 — 火山引擎原生返回 speaker_id）
// ═══════════════════════════════════════════

async function runFullPipeline(recordingId, ossObjectName, asrMode = 'standard') {
  try {
    if (!VOLCENGINE_APP_ID) throw new Error('VOLCENGINE_APP_ID 未配置');
    if (!VOLCENGINE_TOKEN) throw new Error('VOLCENGINE_TOKEN 未配置');
    if (!DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY 未配置');

    console.log(`[Recording #${recordingId}] 🚀 启动流水线 (mode: ${asrMode}, callback)`);

    // ★ 极速版先扣点
    if (asrMode === 'express') {
      const billing = require('./billing.service');
      billing.deductExpressCredit('default', recordingId);
      console.log(`[Recording #${recordingId}] 💰 极速版扣点成功`);
    }

    // 更新 mode
    db.prepare('UPDATE visit_recordings SET asr_mode = ? WHERE id = ?')
      .run(asrMode, recordingId);

    // ── 生成 OSS 签名 URL ──
    const ossUrl = generateOssUrl(ossObjectName);
    console.log(`[Recording #${recordingId}] ✅ OSS 签名 URL 已生成`);

    // ── Submit V3 ASR（带 callback，提交后撒手不管）──
    setStatus(recordingId, 'transcribing');
    const { reqId } = await submitV3ASR(ossUrl, recordingId);
    console.log(`[Recording #${recordingId}] ✅ V3 任务已提交 (reqId=${reqId}) — 等待回调`);

    // ★ 兜底轮询：3 分钟后如果 callback 没来，主动查询
    setTimeout(async () => {
      try {
        const rec = db.prepare('SELECT status FROM visit_recordings WHERE id = ?').get(recordingId);
        if (rec?.status !== 'transcribing') {
          console.log(`[Recording #${recordingId}] 已通过 callback 完成，跳过兜底轮询`);
          return;
        }
        console.log(`[Recording #${recordingId}] ⏰ callback 超时，启动兜底轮询`);
        const { transcript, timeline, duration } = await queryV3ASR(reqId);
        const cleanText = sanitizeTranscript(transcript);
        db.prepare('UPDATE visit_recordings SET transcript = ?, timeline_json = ?, duration_sec = ? WHERE id = ?')
          .run(cleanText, JSON.stringify(timeline), Math.round(duration / 1000), recordingId);
        await continuePipelineAfterTranscribe(recordingId, cleanText);
      } catch (e) {
        console.error(`[Recording #${recordingId}] 兜底轮询失败: ${e.message}`);
        setError(recordingId, e.message);
      }
    }, 3 * 60 * 1000);

  } catch (err) {
    console.error(`[Recording #${recordingId}] ❌ 流水线失败: ${err.message}`);
    setError(recordingId, err.message || '未知错误');
  }
}

/**
 * V3 回调到达后继续流水线：转写结果 → DeepSeek 分析 → OSS 保存 → completed
 * 由 asr-callback.routes.js 调用
 */
async function continueAfterTranscribe(recordingId, text, utterances, durationMs) {
  // ★ 从 utterances 重新构建带说话人标签的文本（含语气词清理）
  const transcript = sanitizeTranscript(
    utterances.length > 0 ? buildTranscript(utterances) : text
  );

  // 构建 timeline（含语气词清理）
  const timeline = buildTimeline(utterances);

  // 更新 DB：转写文本 + 时间线 + 时长
  db.prepare('UPDATE visit_recordings SET transcript = ?, timeline_json = ?, duration_sec = ? WHERE id = ?')
    .run(transcript, JSON.stringify(timeline), Math.round(durationMs / 1000), recordingId);
  setStatus(recordingId, 'transcribed');
  console.log(`[Recording #${recordingId}] ✅ 转写完成 (${transcript.length} 字符, ${timeline.length} 句)`);

  await continuePipelineAfterTranscribe(recordingId, transcript);
}

/**
 * 转写完成后的后续流程：OSS 保存 + DeepSeek 分析
 * （callback handler 和兜底轮询共用）
 */
async function continuePipelineAfterTranscribe(recordingId, transcript) {
  // ── 保存转写文档到 OSS transcripts/ ──
  const rec = db.prepare('SELECT file_path FROM visit_recordings WHERE id = ?').get(recordingId);
  const ossObjectName = rec?.file_path || '';
  const transcriptKey = ossObjectName.replace(/^asr-temp\//, 'transcripts/').replace(/\.\w+$/, '.txt');
  try {
    const ossClient = getOssClient();
    await ossClient.put(transcriptKey, Buffer.from(transcript, 'utf-8'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
    db.prepare('UPDATE visit_recordings SET transcript_oss_key = ? WHERE id = ?')
      .run(transcriptKey, recordingId);
    console.log(`[Recording #${recordingId}] 📄 转写文档已保存: ${transcriptKey}`);
  } catch (ossErr) {
    console.warn(`[Recording #${recordingId}] ⚠️ OSS 保存失败（不阻断）: ${ossErr.message}`);
  }

  // ── DeepSeek 分析 ──
  setStatus(recordingId, 'analyzing');
  await analyzeWithRetry(recordingId, transcript, DEEPSEEK_API_KEY);

  setStatus(recordingId, 'completed');
  console.log(`[Recording #${recordingId}] ✅ 全流水线完成`);
}

module.exports = {
  saveRecording,
  setStatus,
  setError,
  listAllRecordings,
  listRecordings,
  getRecording,
  deleteRecording,
  // ── WebSocket handler 别名 ──
  listByVisit: listRecordings,
  getById: getRecording,
  remove: deleteRecording,
  // ── 其他 ──
  getReportsForRole,
  cleanupZombies,
  runFullPipeline,
  continueAfterTranscribe,
  generateOssUrl,
  ossFileExists,
  formatFileName,
  sanitize,
  RECORDINGS_DIR,
};

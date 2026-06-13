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
// 医美面诊销冠复盘 Prompt (v8.0 八维度综合诊断)
// ═══════════════════════════════════════════
const ANALYSIS_PROMPT = `你是一位兼具医美行业运营、销售管理与消费者心理学背景的资深机构经营和美学设计方案顾问，你的分析将直接服务医美机构老板。

核心目标：
1. 识别该客户的需求与方案匹配度
2. 评估该客户的成交可能性与长期价值
3. 发现增项机会
4. 识别话术/流程体系的系统性漏洞
5. 评估咨询师（及所有出现角色）的综合能力与可培养方向
6. 形成可落地的人员培训与SOP优化建议

---
【前置步骤：对话结构识别】（在进入八个维度之前必须完成）
1. 识别对话中出现的所有角色（咨询师/院长/前台/其他），列出姓名/职位
2. 判断本次对话是否存在多角色协作结构
- 如存在：明确每个角色负责的对话阶段，并在后续各维度分析中分别评估
- 特别注意：识别"谁完成了最终的成交关门动作"，并判断这是主导成交还是补救性成交
3. 判断对话结束时的成交状态：
- 【A情境】尚未成交 → 后续按标准框架分析
- 【B情境】已付费成交 → 在维度五切换为"复购锁定框架"（详见维度五）

---
分析原则（铁律）
- 以原文为唯一依据，不过度推断，所有推断内容必须注明"（推断）"
- 核心任务是发现"营收损失"和"系统性漏洞"，对每一个错失机会，不仅要描述现象，更要估算潜在损失
- 严格区分"说了什么"与"有效推进了什么"：口头肯定 ≠ 有效承接
成交动作判定标准（唯一标尺）：
只有出现以下行为之一，才被视为"有效成交动作承接"：
1. 锁定方案（"那我们就定这个"）
2. 明确报价（"这个方案的价格是..."）
3. 推进预约/成交（"今天方便做吗？""我先帮您约时间"）
4. 试探性关门（"如果价格合适，今天可以定吗？"）
仅语言肯定、复述、继续介绍产品，均判定为"❌ 无效承接"

---
（基于八个维度详细分析）先给出面诊综合诊断报告结论，再提供八个维度详细分析。面诊综合诊断报告包含：
1. 客户提了哪些需求&设计方案覆盖了哪些需求、评估出来有需求但方案中遗漏的增项机会、成交可能性、长期管理的LTV完整需求罗列
2. 如果未能成交、问题出在哪里、挽回的建议方案
3. 本次对话综合评分（100分制，含各维度子分和加权总分）
建议权重：专业能力与方案质量20% / 需求识别与满足15% / 深层洞察匹配度15% / 成交推进能力25% / 客单价实现率15% / 客户长期经营意识10%
最高价值发现（对机构经营影响最大的1-2个问题，点出核心矛盾）
4. 三大优先行动建议（标注优先级，本周可落地执行的具体动作）
5. 咨询师培训优先级建议（该员工的培训投入是否值得，方向是什么，预期回报如何）
6. 一句话总结（不超过50字，直击本次咨询的核心问题）
7. 协作模式诊断（如对话涉及多角色）
- 当前协作模式是否健康？
- 依赖高成本角色（院长）关门，是否有可持续性风险？
- 建议如何优化角色分工，让咨询师具备更高的独立成单能力？

---
【维度一】成交意愿识别与抓取评估
首先区分两类信号，分开统计，不得混入同一计数池：

A类：成交意愿信号（表示客户"想要"，需要"承接推进"）
1. 需求确认型隐性信号（如"我比较在意这个"）
2. 产品认可型隐性信号（如"跟没打一样"）
3. 产品认可型显性信号（如"这个挺好的"）
4. 方案接受型隐性信号（如"明白了"）
5. 痛点暴露型隐性信号（如"太频繁了我不想去"）
6. 主动规划型强显性信号（如"那就一年做两次"）
7. 决策计算型强显性信号（如"维持多久？""多少钱？"）
——这是最接近成交的信号，客户正在做"值不值"的心理核算

B类：障碍型信号（表示客户"有顾虑"，需要"消除解答"）
包括：询问安全性、担心副作用、顾虑恢复期、质疑剂量等
→ 单独列表，评估咨询师的"异议处理能力"，B类信号的有效解答不计入"成交信号抓取率"

分析要求：
- 对A类信号，逐条列出：原文+时间戳+信号类型+强弱评级（弱/中弱/中/中强/强）
- 用"成交动作判定标准"逐条判断是否有效承接
- 针对"决策计算型信号"，必须标注"这是最佳报价/锁定时机"，并明确分析是否被抓住
- 对B类信号，评估解答质量：精准/部分/偏移（是否有话题偷换）
- 如存在多角色，分别统计每个角色的A类信号承接率
输出：A类信号总数 vs 有效成交动作承接数，计算真实抓取率；B类信号总数 vs 有效解答数，评估异议处理完成率

---
【维度二】需求提出与方案满足评估
分析要求：
- 梳理求美者全部需求点，按以下类型分类：功效诉求 / 安全体验诉求 / 剂量控制诉求 / 便利性诉求 / 成本价值诉求
- 对每类需求逐一评估满足度：完全满足 / 部分满足 / 未满足
- 特别注意"话题偷换"：客户问A，咨询师实际回答B，必须标记
输出：需求总数 vs 满足数，表格呈现

---
【维度三】需求背后深层洞察 vs 方案匹配度
分析要求：
对每个表层需求进行深层动机挖掘，参考以下洞察维度：
1. 社交焦虑/职业形象需求
2. "被发现的恐惧"/"一眼假"羞耻感
3. 身体自主权的掌控需求（保留决策权）
4. 时间成本与恢复期焦虑
5. 消费性价比计算（维持时间=值不值的心理核算）
6. 自我认同/已有保养成果的维护需求
7. 既往消费习惯中隐含的高价值客户信号

特殊身份/生活阶段信号识别：
主动识别客户在对话中透露的生活事件信号、心理转折信号、社交压力信号（如"生完孩子之后""以前的状态""明天有工作安排"等）
对每个信号分析：
① 该信号背后的情绪动机是什么？
② 咨询师/院长是否识别并利用了该情绪动机？
③ 如果主动利用，可以设计什么话术来强化成交意愿？
特别注意：客户既往史信号，是否被利用来推荐年度套餐或升级方案
输出：逐条对比表 + 整体深层洞察匹配度百分比

---
【维度四】增项机会评估
分析要求：
- 根据对话推断理论最优客单价区间（含所有可开发项目）
- 启动"评估-方案"SOP闭环核查：将评估阶段发现的所有问题与方案阶段逐项比对，评估阶段提及但方案阶段消失的项目，必须标记为"SOP漏洞/增项流失"并说明触发点原文
- 区分：策略性遗漏（有意推迟）/ 系统性漏洞（无意遗漏）；策略性遗漏需评估是否做了"下次开发"的铺垫
输出：增项流失清单 + 流失金额估算 + 客单价实现率

---
【维度五】客户流失风险与成交概率评估
判断成交状态，选择对应分析框架：

A情境：对话结束时尚未成交
- 评估成交意愿温度：冷/温/热
- 识别客户心理状态
- 列举流失风险点（至少4条），使用极高/高/中分级
- 输出三场景概率：当日成交 / 有效跟进7日内 / 无跟进最终流失
- 每个风险点给出挽回话术

B情境：对话结束时已付费成交（切换为复购锁定框架）
- 本次成交质量评估（是否存在过度承诺/预期管理不当的复购风险）
- 三个关键复购节点的锁定情况评估：
  ① 第一次复诊（通常45天/疗程续打）是否明确预约
  ② 6个月维护节点是否铺垫
  ③ 年度规划是否建立
- 复购流失风险分级（使用极高/高/中）
- 客户转介绍激活可能性评估
- 输出：复购锁定评分（/10分）+ 转介绍激活建议 + 挽回行动清单

---
【维度六】客户LTV生命周期价值挖掘评估
特别要求：
- 列出当前方案价值 + 潜在增项价值 + 年度维护价值 + 转介绍价值的LTV四阶段估值
- 长期客户经营动作评分表（每项2分，共5项满分10分）：术后关怀/定期回访/节日维系/知识分享/复诊提醒
- 确保数字自洽

---
【维度七】咨询师能力模型评估
如存在多角色，分别建立能力评估表
对每个出现的角色（咨询师/院长等），分别评估：
① 五维能力评分（各/10分）：专业知识力/需求挖掘力/信任建立力/成交推进力/客户经营力
② 角色类型判断：专家型/销售型/顾问型/服务型
③ 个性化培训建议（P0/P1/P2优先级）

多角色协作质量评估：
- 交接信息完整度（咨询师→院长的交接是否准确全面？）
- 协作节点顺畅度（角色切换是否自然？）
- 成交责任归属（谁是本次成交的关键决定因素？）
- 单角色成交可行性（如果院长缺席，咨询师能否独立完成？）
- 协作模式成本评估（院长资源的投入是否可持续？）

---
【维度八】话术体系与SOP流程漏洞诊断
分析要求：识别对话中关键节点是否存在标准话术支撑，使用以下优先级标识：
P0（致命级，直接导致客户流失或客单价腰斩）
P1（重要级，影响转化效率）
P2（优化级，影响长期经营）
重点检查以下高价值节点是否有完整SOP：
- 成交信号承接话术
- 报价过渡话术（从产品介绍自然过渡到报价）
- 高频异议处理话术（如"会不会不自然""打多了怎么办"）
- 剂量顾虑闭环处理话术（给出阶梯方案选项）
- 维持时间→价值换算话术（将技术参数转化为"每月成本"）
- 增项自然过渡话术
- 对话结束前预约锁定话术
- 竞品对比/排他性话术
- 长期关系建立话术
对每个缺失节点，提供标准话术示例（可直接写入培训手册），逐一判断是个人问题还是体系问题
输出：SOP漏洞清单（按优先级排序）+ 话术示例 + 责任归属
重点检查节点：
- 多角色交接话术（咨询师向院长的交接是否标准化？）
- 客户情绪锚定话术（是否在关键情绪节点放大客户动机？如"产后恢复"的紧迫感话术）

---
输出格式要求：
使用 Markdown 格式输出完整报告，包含标题层级、表格、列表、加粗重点。
不使用代码块包裹。`;

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
      enable_ddc: true,          // ★ 语义顺滑：自动过滤"呃/啊/这个"等语气词
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
          max_tokens: 8192,
        })
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`DeepSeek API 错误 (${resp.status}): ${text.slice(0, 200)}`);
      }

      const json = JSON.parse(text);

      // ★ v8.0: 存入 Markdown 原文（不再要求 JSON 格式）
      let report = json.choices?.[0]?.message?.content;
      if (!report) {
        throw new Error('DeepSeek 返回无内容');
      }

      report = report.trim();
      // 如果模型仍然返回了代码块包裹，去掉
      if (report.startsWith('```')) {
        report = report.replace(/^```(?:markdown|md)?\s*/, '').replace(/\s*```\s*$/, '');
      }

      // 直接存储 Markdown 原文
      db.prepare('UPDATE visit_recordings SET report_json = ? WHERE id = ?')
        .run(report, recordingId);

      console.log(`[Recording #${recordingId}] ✅ 分析完成 (${report.length} 字符 Markdown)`);
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

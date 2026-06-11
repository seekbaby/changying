/**
 * 面诊录音服务 v4.0
 * 流程：上传 → 百炼ASR转写 → DeepSeek V4 Pro分析 → 报告存储
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { db } = require('../database/init');

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://magicreviewbox.com';
const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'data', 'recordings');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'recordings');

// 确保目录存在
[RECORDINGS_DIR, PUBLIC_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ═══════════════════════════════════════════
// DeepSeek 分析 Prompt（用户指定）
// ═══════════════════════════════════════════
const ANALYSIS_PROMPT = `# Role
你是一位潜伏在顶级直客医美诊所10年的营销总监兼顶级面诊质检专家（QA Auditor）。你极其敏锐、冷酷、一针见血，绝不提供无意义的客套话或情绪价值，只为诊所的转化率和业绩负责。

# Context
你将收到一段由医助与求美者在面诊室内的真实录音转写文本（可能带有 [spk_1]、[spk_2] 的说话人标识）。

# Task
请对这段面诊文本进行极度刁钻的全盘审计。你的核心任务是：扒出医助没接住的商业线索、纠正专业常识漏洞，并直接生成一份用于次日早会交接的"行动指令"报告。

# Analysis Dimensions (审计红线与维度)
1. 【需求挖掘深度】：医助是仅仅停留在处理顾客表面的"除皱/补水"需求，还是成功挖出了顾客底层的"衰老焦虑"和"轮廓结构性复位"的真实欲望？
2. 【专业壁垒与信任建构】：在讲解高值注射材料或光电仪器时，是否出现了原则性降级表达？（例如：是否把塑妍萃等不规则实心片状的再生材料，错误讲解成了普通的物理填充微球？是否对注射层次和临床见效周期解释不清导致客户疑虑？）
3. 【抗拒点粉碎】：面对顾客抛出的"太贵了"、"我怕疼"、"我回去考虑一下/问问老公"等经典抗拒点，医助是软弱退让，还是利用专业逻辑与客情进行了有效化解？
4. 【漏接的升单线索】：顾客是否在对话中不经意暴露了其他部位的痛点（如：原本来咨询水光，但抱怨了下颌缘模糊或口角囊肉），而医助完全没有接住话茬进行联合方案的铺垫？

# Output Format
请严格按照以下结构输出报告，语言极其精炼（控制在 500 字以内），拒绝废话，只上干货：
---
### 📊 面诊基本面评估
- 顾客意向评级：[高/中/低 - 附一句话理由]
- 医助控场与专业度评分：[1-10分]
### 💡 漏接的升单与组合机会（核心）
- **错失线索**：顾客在文本中原话提到了"[摘录关键原话]"。
- **复盘建议**：此处隐藏了 [某项目/光电+注射联合方案] 的需求，医助本应通过 [提供一个切入话题] 进行铺垫，但未能跟进。下次复诊必须作为破冰点。
### ⚠️ 致命话术漏洞与标准修正
- ❌ **医助原话的坑**：[摘录导致客户犹豫或不信任的糟糕回答]
- ✅ **金牌修正话术**：[提供一句拥有绝对专业压制力或极强共情力的标准销售台词，供该医助背诵]
### ⚡ 今日/次日治疗补救指令（全局死命令）
- 针对该顾客，当护士配台或医生进房操作时，**必须执行的补救动作或客情话术是**：[一句话交代动作]`;

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

/** 文件名脱敏：只保留中文、英文、数字 */
function sanitize(name) {
  return (name || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
}

/** 生成录音文件路径：顾客-类型-日期 */
function generateFilePath(guestName, ext) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const time = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const name = sanitize(guestName) || 'unknown';
  return {
    filename: `${name}_面诊_${date}_${time}.${ext}`,
    dateStr: date
  };
}

/** HTTP POST 工具 */
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: 60000
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════
// 核心流水线
// ═══════════════════════════════════════════

/**
 * 1. 保存录音文件 + 创建 DB 记录
 */
function saveRecording(visitId, guestName, file) {
  const ext = (file.originalname || 'recording.mp3').split('.').pop() || 'mp3';
  const { filename, dateStr } = generateFilePath(guestName, ext);
  
  // 保存到 data/recordings/
  const destPath = path.join(RECORDINGS_DIR, filename);
  fs.copyFileSync(file.path, destPath);
  
  // 同时存到 public/recordings/ 供 DashScope 下载
  const publicPath = path.join(PUBLIC_DIR, filename);
  fs.copyFileSync(file.path, publicPath);
  
  // 清理 multer 临时文件
  try { fs.unlinkSync(file.path); } catch {}

  const result = db.prepare(`
    INSERT INTO visit_recordings (visit_id, guest_name, file_path, file_size, status, created_at)
    VALUES (?, ?, ?, ?, 'uploaded', ?)
  `).run(visitId, guestName, filename, file.size || 0, Date.now());

  return {
    id: result.lastInsertRowid,
    filename,
    publicUrl: `${PUBLIC_BASE}/recordings/${filename}`
  };
}

/**
 * 2. 调用百炼 ASR 转写
 */
async function transcribeWithBailian(recordingId, publicUrl) {
  // 更新状态
  db.prepare('UPDATE visit_recordings SET status = ? WHERE id = ?').run('transcribing', recordingId);

  // 提交转写任务
  const taskResp = await httpPost(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
    {
      'Authorization': `Bearer ${BAILIAN_API_KEY}`,
      'X-DashScope-Async': 'enable'
    },
    {
      model: 'paraformer-v1',
      input: { file_urls: [publicUrl] },
      parameters: { format: publicUrl.endsWith('.wav') ? 'wav' : 'mp3', sample_rate: 16000 }
    }
  );

  if (taskResp.status !== 200) {
    const err = `百炼ASR提交失败: ${JSON.stringify(taskResp.data)}`;
    db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', err, recordingId);
    return { success: false, error: err };
  }

  const taskId = taskResp.data?.output?.task_id;
  if (!taskId) return { success: false, error: '未获取到task_id' };

  // 轮询结果（最多60秒）
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const pollResp = await httpGet(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      { 'Authorization': `Bearer ${BAILIAN_API_KEY}` }
    );
    const st = pollResp.data?.output?.task_status;
    if (st === 'SUCCEEDED') {
      const resultsUrl = pollResp.data.output.results?.[0]?.transcription_url;
      if (resultsUrl) {
        const transResp = await httpGet(resultsUrl);
        const text = transResp.data?.transcripts?.map(t => t.text).join('\n') || '';
        db.prepare('UPDATE visit_recordings SET status = ?, transcript = ? WHERE id = ?')
          .run('transcribed', text, recordingId);
        return { success: true, transcript: text };
      }
    }
    if (st === 'FAILED') {
      const err = `百炼ASR失败: ${pollResp.data?.output?.message || '未知错误'}`;
      db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
        .run('failed', err, recordingId);
      return { success: false, error: err };
    }
  }
  
  const err = '百炼ASR超时（60秒未完成）';
  db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
    .run('failed', err, recordingId);
  return { success: false, error: err };
}

/** HTTP GET */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(url, { headers, timeout: 30000 }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 3. 调用 DeepSeek V4 Pro 分析
 *
 * 安全锁：
 * - 幂等检查：status 不为 'transcribed' 则拒绝执行，防止重复分析
 * - 内部 try/catch：任何异常都保证写入 failed，status 不会永久卡在 analyzing
 * - transcript 长度硬限：防止意外的超大上下文轰炸 API
 */
async function analyzeWithDeepSeek(recordingId, transcript) {
  if (!DEEPSEEK_API_KEY) {
    return { success: false, error: '未配置 DEEPSEEK_API_KEY 环境变量' };
  }

  // ★ 安全锁 1：幂等检查——只允许从 transcribed 状态进入，防止重复触发
  const current = db.prepare('SELECT status FROM visit_recordings WHERE id = ?').get(recordingId);
  if (!current) {
    return { success: false, error: `录音 #${recordingId} 不存在` };
  }
  if (current.status !== 'transcribed') {
    console.warn(`[DeepSeek] #${recordingId} 状态为 "${current.status}"，跳过分析（防重复触发）`);
    return { success: false, error: `状态不符，拒绝分析（当前: ${current.status}）` };
  }

  // ★ 安全锁 2：transcript 长度硬限（超过 8 万字符视为异常，拒绝发送）
  const MAX_TRANSCRIPT_CHARS = 80000;
  if (!transcript || transcript.length === 0) {
    const err = '转写文本为空，跳过分析';
    db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', err, recordingId);
    return { success: false, error: err };
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const err = `转写文本超限（${transcript.length} 字符 > ${MAX_TRANSCRIPT_CHARS}），已截断分析请求`;
    console.error(`[DeepSeek] #${recordingId} ${err}`);
    db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', err, recordingId);
    return { success: false, error: err };
  }

  db.prepare('UPDATE visit_recordings SET status = ? WHERE id = ?').run('analyzing', recordingId);

  try {
    const resp = await httpPost(
      'https://api.deepseek.com/v1/chat/completions',
      { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: ANALYSIS_PROMPT },
          { role: 'user', content: `以下是面诊录音转写文本，请按指令进行审计分析：\n\n${transcript}` }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }
    );

    if (resp.status !== 200) {
      const err = `DeepSeek分析失败 (HTTP ${resp.status}): ${JSON.stringify(resp.data)}`;
      db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
        .run('failed', err, recordingId);
      return { success: false, error: err };
    }

    const report = resp.data?.choices?.[0]?.message?.content || '';
    if (!report) {
      const err = 'DeepSeek 返回内容为空';
      db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
        .run('failed', err, recordingId);
      return { success: false, error: err };
    }

    db.prepare('UPDATE visit_recordings SET status = ?, report_json = ? WHERE id = ?')
      .run('completed', report, recordingId);

    console.log(`[DeepSeek] #${recordingId} 分析完成，报告长度: ${report.length} 字符`);
    return { success: true, report };

  } catch (e) {
    // ★ 安全锁 3：任何网络/解析异常都保证写入 failed，防止 status 永久卡在 analyzing
    const err = `DeepSeek分析异常: ${e.message}`;
    console.error(`[DeepSeek] #${recordingId}`, err);
    db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', err, recordingId);
    return { success: false, error: err };
  }
}

/**
 * 全流程：上传后异步执行
 */
async function runFullPipeline(recordingId, publicUrl) {
  try {
    // Step 1: 百炼转写
    const transResult = await transcribeWithBailian(recordingId, publicUrl);
    if (!transResult.success) return;

    // Step 2: DeepSeek 分析
    await analyzeWithDeepSeek(recordingId, transResult.transcript);

    // Step 3: 清理 public 目录中的录音文件（保留 data/recordings/ 副本）
    const rec = db.prepare('SELECT file_path FROM visit_recordings WHERE id = ?').get(recordingId);
    if (rec) {
      const publicFile = path.join(PUBLIC_DIR, rec.file_path);
      try { fs.unlinkSync(publicFile); } catch {}
    }

    console.log(`[Recording] #${recordingId} 全流程完成`);
  } catch (e) {
    console.error(`[Recording] #${recordingId} 流水线异常:`, e.message);
    db.prepare('UPDATE visit_recordings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', e.message, recordingId);
  }
}

/**
 * 查询录音列表
 */
function listByVisit(visitId) {
  return db.prepare(
    'SELECT * FROM visit_recordings WHERE visit_id = ? ORDER BY created_at DESC'
  ).all(visitId);
}

/**
 * 获取单个录音详情
 */
function getById(id) {
  return db.prepare('SELECT * FROM visit_recordings WHERE id = ?').get(id);
}

/**
 * 删除录音
 */
function remove(id) {
  const rec = db.prepare('SELECT * FROM visit_recordings WHERE id = ?').get(id);
  if (!rec) return false;

  // 删除文件
  const filePath = path.join(RECORDINGS_DIR, rec.file_path);
  try { fs.unlinkSync(filePath); } catch {}

  // 删除 public 副本
  const pubPath = path.join(PUBLIC_DIR, rec.file_path);
  try { fs.unlinkSync(pubPath); } catch {}

  db.prepare('DELETE FROM visit_recordings WHERE id = ?').run(id);
  return true;
}

module.exports = {
  saveRecording,
  runFullPipeline,
  listByVisit,
  getById,
  remove,
  RECORDINGS_DIR
};

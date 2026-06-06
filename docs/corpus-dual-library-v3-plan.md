# 语料管理双库体系 v3 — 技术方案

> 立项日期：2026-05-30
> 状态：方案评审通过，待实施
> 目标：建立两级语料管理体系（A库全量归档 → 人工批注精修 → B库精选训练集），为 LoRA 微调医美面诊垂直模型提供高质量 SFT 语料

---

## 一、核心架构

```
录音上传 → ASR转写 → DeepSeek分析
    │
    ├─→ OSS: recording-archives/rec_{id}.json  （原始富文本归档）
    └─→ DB:  transcript + report_markdown + prompt_version='v6.0'
              │
              ▼
    ┌─────────────────────────────────────┐
    │  语料管理台 (CorpusView.vue)         │
    │  ┌─────────────────────────────┐    │
    │  │ A库浏览 → 查看转录+分析      │    │
    │  │         → 写 annotation     │    │
    │  │         → 编辑 edited_analysis│   │
    │  │         → 打标 case_type     │    │
    │  │         → 晋升 B库           │    │
    │  └─────────────────────────────┘    │
    └─────────────────────────────────────┘
              │
              ▼ 点击「📦 导出训练集」
    ┌─────────────────────────────────────┐
    │ 内存实时清洗 + Alpaca SFT 拼装       │
    │ ① 正则剥离 [MM:SS]                  │
    │ ② 姓名→Customer / Consultant       │
    │ ③ output=edited_analysis ?? original│
    │ ④ case_type 分层抽样                │
    │ ⑤ 组装 instruction/input/output 问答对│
    │ → 返回 JSONL 下载                   │
    └─────────────────────────────────────┘
```

## 二、数据库表结构

### visit_recordings 新增字段

```sql
ALTER TABLE visit_recordings ADD COLUMN annotation       TEXT DEFAULT '';        -- 人工批注（备忘录，不进入训练集）
ALTER TABLE visit_recordings ADD COLUMN curation_status  TEXT DEFAULT 'raw';     -- raw → annotated → approved → rejected
ALTER TABLE visit_recordings ADD COLUMN in_library_b     INTEGER DEFAULT 0;      -- 是否入选B库
ALTER TABLE visit_recordings ADD COLUMN edited_analysis  TEXT DEFAULT NULL;      -- ★ 人工精修版（SFT 的 output 来源）
ALTER TABLE visit_recordings ADD COLUMN case_type        TEXT DEFAULT NULL;      -- ★ 战局类型标签
ALTER TABLE visit_recordings ADD COLUMN prompt_version   TEXT DEFAULT 'v6.0';    -- ★ 指令版本锁定
```

### case_type 枚举

| 值 | 含义 |
|----|------|
| `objection_handling` | 逆风局：强抗拒化解 |
| `upsell_success` | 升单局：深挖需求成功 |
| `aesthetic_alignment` | 认知局：审美观念重塑 |

### curation_status 状态机

```
raw → annotated → approved  （入选B库）
                  ↘ rejected （淘汰）
```

## 三、OSS 存储设计

```
cy4/
├── asr-temp/                 ← 临时录音（流水线完成后保留，供溯源播放）
└── recording-archives/       ★ 唯一物理归档（统一存储）
    ├── rec_25.json           ← 包含完整 transcript + original_analysis + metadata
    └── rec_26.json
```

**rec_{id}.json 结构：**
```json
{
  "id": 25,
  "visit_id": 9,
  "guest_name": "张宇",
  "assistant_name": "刘助理",
  "created_at": 1780049739220,
  "prompt_version": "v6.0",
  "transcript": "[00:00] 👩‍⚕️ 咨询师：你好...\n[00:05] 👤 顾客：我觉得...",
  "analysis": { "data_points": {...}, "analysis_questions": {...} }
}
```

## 四、API 设计

### 4.1 自动归档（流水线内置）
流水线 `runFullPipeline` 成功后自动调用 `archiveToOss(id)`，将 transcript + analysis 写入 OSS。

### 4.2 读取 OSS 数据
```
GET /api/recordings/:id/oss-data
→ 从 OSS 读取 rec_{id}.json，返回给前端展示
```

### 4.3 保存语料批注/精修
```
PATCH /api/recordings/:id/corpus
Body: { annotation?, edited_analysis?, curation_status?, case_type?, in_library_b? }
→ 更新 visit_recordings 对应字段
```

### 4.4 导出训练集
```
POST /api/recordings/export-sft
Body: { case_type_ratio?: { objection_handling: 40, upsell_success: 40, aesthetic_alignment: 20 } }
→ 查询 in_library_b=1 → 内存清洗 → Alpaca 拼装 → 返回 JSONL 下载
```

**返回的 JSONL 格式（Alpaca SFT 标准）：**
```jsonl
{"instruction": "你是顶级医美销冠...", "input": "Customer：我觉得苹果肌比较平...\nConsultant：你好...", "output": "一、数据提炼与漏斗分析\n顾客释放机会：3次\n咨询师抓取：1次\n\n二、需求洞察..."}
```

### 4.5 存量补齐
```
POST /api/recordings/sync-archives
→ 扫描 status='completed' 且未归档的记录 → 批量上传 OSS
```

## 五、前端设计

### 5.1 CorpusView.vue（语料管理台）— 新页面

**路由：** `/corpus`（仅 admin/manager 可访问）

**布局：**
```
┌─ 顶栏：← 返回  +  📊 语料管理  +  📦 导出训练集 ──────────────┐
├─ 筛选栏：[状态: 全部/待批注/已入选] [类型: 全部/逆风/升单/认知] ─┤
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │ #25 张宇 · 刘助理 · 2026-05-29           [逆风局]  │    │
│  │ ▸ 展开查看转录 · 分析 · 批注 · 精修                 │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ #26 XX · 李助理 · 2026-05-30           [审美局]  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**展开详情区：**
- 📝 原始转录（折叠，可展开查看）
- 📊 原始分析（只读展示）
- ✏️ 精修分析（`<textarea>` 编辑 edited_analysis）
- 📝 批注备忘录（`<textarea>` 编辑 annotation）
- 🏷 战局类型（下拉：逆风局/升单局/认知局）
- 📌 状态（下拉：raw→annotated→approved→rejected）
- [保存修改] [晋升B库] [从B库移除]

### 5.2 路由守卫

```javascript
// router/index.js
{
  path: '/corpus',
  component: () => import('../views/CorpusView.vue'),
  beforeEnter: (to, from) => {
    const auth = useAuthStore()
    if (!['admin','manager'].includes(auth.role)) {
      return '/unified'
    }
  }
}
```

### 5.3 API 封装层

```javascript
// stores/corpusApi.js 或直接在 CorpusView.vue 中
async function fetchOssData(recordingId) { ... }
async function saveCorpus(recordingId, data) { ... }
async function exportSFT(ratio) { ... }
```

## 六、数据流转关键规则

| 规则 | 说明 |
|------|------|
| **annotation ≠ output** | annotation 是给管理员看的备忘录，绝不进入 SFT 训练集 |
| **edited_analysis 优先** | 导出 SFT 时，output = edited_analysis ?? original_analysis |
| **入库即清洗** | 姓名→Customer/Consultant、[MM:SS]→删除，在导出时实时处理 |
| **指令版本锁定** | 每条记录存 prompt_version，导出时 instruction 与生成时的版本对应 |
| **分层抽样** | 按 case_type 配比导出，默认 40%逆风+40%审美+20%升单 |

## 七、改动文件清单

| # | 文件 | 改动 |
|---|------|------|
| ① | `database/init.js` | 幂等迁移 6 字段 |
| ② | `services/recording.service.js` | `archiveToOss()` `syncArchives()` `exportSFT()` `updateCorpus()` `getOssData()` |
| ③ | `routes/recording.routes.js` | `GET /:id/oss-data` `PATCH /:id/corpus` `POST /export-sft` `POST /sync-archives` |
| ④ | `client/src/views/CorpusView.vue` | **新页面** — 语料管理台 |
| ⑤ | `client/src/router/index.js` | + `/corpus` 路由 + 权限守卫 |
| ⑥ | `client/src/api/corpus.js` | API 封装层 |

## 八、实施顺序

1. DB 迁移（6 字段）
2. 后端 service 新增函数
3. 后端 routes 新增 4 个端点
4. 前端 CorpusView.vue 新页面
5. 路由守卫 + API 封装
6. 构建部署验证

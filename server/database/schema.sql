-- ═══════════════════════════════════════════
-- 长盈 · 院内求美者雷达系统
-- 数据库Schema v2.5
-- 新增: visit_doctors（医生追踪）、inventory三表（进销存前置埋线）
-- ═══════════════════════════════════════════

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

-- ── 人员名单 ──
CREATE TABLE staff (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    role        TEXT    NOT NULL CHECK(role IN ('reception','doctor','nurse','assistant','manager','admin')),
    department  TEXT    DEFAULT '',
    pin         TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_staff_role ON staff(role);

-- ── 房间与设备配置 ──
CREATE TABLE rooms (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL UNIQUE,
    type           TEXT    NOT NULL,
    capacity       INTEGER DEFAULT 1,
    equipment_tags TEXT,
    is_active      INTEGER DEFAULT 1,
    sort_order     INTEGER DEFAULT 0
);
CREATE INDEX idx_rooms_type ON rooms(type);

-- ── 今日接诊单（核心主表·状态机载体）──
CREATE TABLE visits (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_date            TEXT    NOT NULL,
    guest_name            TEXT    NOT NULL,
    guest_phone           TEXT,
    assigned_nurse_id     INTEGER REFERENCES staff(id),
    assigned_assistant_id INTEGER REFERENCES staff(id),   -- ★ v4.1: 分配医助
    current_doctor_id     INTEGER REFERENCES staff(id),   -- ★ v2.5: 当前术中医生
    current_status        TEXT    NOT NULL,
    current_room_id       INTEGER REFERENCES rooms(id),
    status_entered_at     INTEGER NOT NULL,
    expected_duration_min INTEGER,
    deadline_at           INTEGER,
    alert_triggered       INTEGER DEFAULT 0,
    treatment_plan        TEXT,
    is_vip                INTEGER DEFAULT 0,
    created_at            INTEGER NOT NULL,
    closed_at             INTEGER
);
CREATE INDEX idx_visits_date_status ON visits(visit_date, current_status);
CREATE INDEX idx_visits_room ON visits(current_room_id, closed_at);
CREATE INDEX idx_visits_nurse ON visits(assigned_nurse_id, visit_date);
CREATE INDEX idx_visits_deadline ON visits(deadline_at, closed_at);

-- ── 追加备注流水 ──
CREATE TABLE visit_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id    INTEGER NOT NULL REFERENCES visits(id),
    author_id   INTEGER REFERENCES staff(id),
    author_role TEXT    NOT NULL,
    note_type   TEXT    NOT NULL CHECK(note_type IN ('treatment_plan','emotion_tag','status_change','general','admin_remark')),
    content     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_notes_visit ON visit_notes(visit_id, created_at);
CREATE INDEX idx_notes_type ON visit_notes(note_type);

-- ── 状态流转合法路径配置表 ──
CREATE TABLE status_transitions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    from_status          TEXT    NOT NULL,
    to_status            TEXT    NOT NULL,
    requires_room        INTEGER DEFAULT 0,
    default_duration_min INTEGER,
    alert_threshold_min  INTEGER,
    allowed_roles        TEXT
);

-- ── 手机照 ──
CREATE TABLE visit_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id    INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    photo_type  TEXT    NOT NULL CHECK(photo_type IN ('pre','post')),
    file_path   TEXT    NOT NULL,
    thumb_path  TEXT    NOT NULL,
    file_size   INTEGER,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_photos_visit ON visit_photos(visit_id);

-- ── ★ v2.5: 医生操作记录（术中追踪）──
CREATE TABLE visit_doctors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES staff(id),
    procedure_name  TEXT    DEFAULT '',       -- 操作项目（光子、水光、热玛吉...）
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER                  -- NULL=进行中
);
CREATE INDEX idx_vd_visit ON visit_doctors(visit_id);
CREATE INDEX idx_vd_doctor ON visit_doctors(doctor_id);

-- ── ★ v2.5: 耗材库存（3.0 激活）──
CREATE TABLE inventory_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,  -- 玻尿酸、肉毒素、线材...
    unit            TEXT    DEFAULT '支',     -- 支/盒/瓶
    current_stock   INTEGER DEFAULT 0,       -- 当前库存
    safety_stock    INTEGER DEFAULT 5,       -- 安全库存阈值
    is_active       INTEGER DEFAULT 1,
    created_at      INTEGER NOT NULL
);

-- ── ★ v2.5: 耗材变动日志 ──
CREATE TABLE inventory_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
    type            TEXT    NOT NULL CHECK(type IN ('inbound','ordered','consumed','adjust')),
    quantity        INTEGER NOT NULL,
    visit_id        INTEGER REFERENCES visits(id),   -- 关联接诊单（NULL=进货）
    operator_id     INTEGER REFERENCES staff(id),
    note            TEXT    DEFAULT '',
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_il_item ON inventory_logs(item_id);
CREATE INDEX idx_il_visit ON inventory_logs(visit_id);

-- ── ★ v3.0: 接诊单-耗材关联（开单锁货 + 核销抹平）──
CREATE TABLE visit_inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
    qty_ordered     INTEGER DEFAULT 0,       -- 开单量（锁货）
    qty_verified    INTEGER DEFAULT 0,       -- 核销量（实操）
    source          TEXT    DEFAULT 'pre_op', -- 'pre_op'=术前开单, 'intra_op'=术中加单
    note            TEXT    DEFAULT '',        -- 备注
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_vi_visit ON visit_inventory(visit_id);

-- ── ★ v4.0: 面诊录音 + AI分析报告 ──
CREATE TABLE visit_recordings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    guest_name      TEXT    NOT NULL,
    file_path       TEXT    NOT NULL,          -- 录音文件路径
    file_size       INTEGER,
    duration_sec    REAL,
    transcript      TEXT    DEFAULT '',        -- 百炼ASR转写文本
    report_json     TEXT    DEFAULT '{}',      -- DeepSeek分析报告(JSON)
    transcript_oss_key TEXT,                  -- v7.1: OSS转写文档路径
    status          TEXT    DEFAULT 'uploaded' CHECK(status IN ('uploaded','transcribing','transcribed','analyzing','completed','failed')),
    error_message   TEXT,
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_vrec_visit ON visit_recordings(visit_id);

-- ── 管理员操作日志 ──
CREATE TABLE admin_operations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id     INTEGER REFERENCES staff(id),
    action_type     TEXT,
    target_table    TEXT,
    target_id       INTEGER,
    before_snapshot TEXT,
    reason          TEXT,
    operated_at     INTEGER NOT NULL
);

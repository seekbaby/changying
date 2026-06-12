/**
 * 数据库初始化与连接管理
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'flowradar.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL模式 + 外键约束
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

/**
 * 初始化数据库（建表+填充种子数据，幂等操作）
 */
function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath = path.join(__dirname, 'seed.sql');

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const seed = fs.readFileSync(seedPath, 'utf-8');

  // 检查是否已初始化
  const tableCount = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table'"
  ).get().cnt;

  if (tableCount === 0) {
    console.log('[DB] 首次初始化，执行schema...');
    db.exec(schema);
    console.log('[DB] 填充种子数据...');
    db.exec(seed);
    console.log('[DB] 初始化完成');
  } else {
    console.log(`[DB] 数据库已存在 (${tableCount} 张表)，跳过初始化`);
  }

  // 增量迁移（幂等）
  runMigrations();
}

/** 增量迁移：为已有数据库补建缺失的表/列 */
function runMigrations() {
  // ── v2.0: visit_photos ──
  const hasPhotos = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='visit_photos'"
  ).get().cnt;
  if (hasPhotos === 0) {
    console.log('[DB] 迁移: 创建 visit_photos 表...');
    db.exec(`
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
    `);
  }

  // ── v2.5: visits.current_doctor_id ──
  const hasDoctorCol = db.prepare(
    "SELECT count(*) as cnt FROM pragma_table_info('visits') WHERE name='current_doctor_id'"
  ).get().cnt;
  if (hasDoctorCol === 0) {
    console.log('[DB] 迁移: visits 表添加 current_doctor_id 列...');
    db.exec(`ALTER TABLE visits ADD COLUMN current_doctor_id INTEGER REFERENCES staff(id);`);
  }

  // ── v2.5: visit_doctors ──
  const hasDoctors = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='visit_doctors'"
  ).get().cnt;
  if (hasDoctors === 0) {
    console.log('[DB] 迁移: 创建 visit_doctors 表...');
    db.exec(`
      CREATE TABLE visit_doctors (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
        doctor_id       INTEGER NOT NULL REFERENCES staff(id),
        procedure_name  TEXT    DEFAULT '',
        started_at      INTEGER NOT NULL,
        ended_at        INTEGER
      );
      CREATE INDEX idx_vd_visit ON visit_doctors(visit_id);
      CREATE INDEX idx_vd_doctor ON visit_doctors(doctor_id);
    `);
  }

  // ── v2.5: inventory_items ──
  const hasInv = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='inventory_items'"
  ).get().cnt;
  if (hasInv === 0) {
    console.log('[DB] 迁移: 创建 inventory_items 表...');
    db.exec(`
      CREATE TABLE inventory_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL UNIQUE,
        unit            TEXT    DEFAULT '支',
        current_stock   INTEGER DEFAULT 0,
        safety_stock    INTEGER DEFAULT 5,
        is_active       INTEGER DEFAULT 1,
        created_at      INTEGER NOT NULL
      );
    `);
  }

  // ── v2.5: inventory_logs ──
  const hasInvLog = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='inventory_logs'"
  ).get().cnt;
  if (hasInvLog === 0) {
    console.log('[DB] 迁移: 创建 inventory_logs 表...');
    db.exec(`
      CREATE TABLE inventory_logs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
        type            TEXT    NOT NULL CHECK(type IN ('inbound','ordered','consumed')),
        quantity        INTEGER NOT NULL,
        visit_id        INTEGER REFERENCES visits(id),
        operator_id     INTEGER REFERENCES staff(id),
        note            TEXT    DEFAULT '',
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX idx_il_item ON inventory_logs(item_id);
      CREATE INDEX idx_il_visit ON inventory_logs(visit_id);
    `);
  }

  // ── v2.5: visit_inventory ──
  const hasVI = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='visit_inventory'"
  ).get().cnt;
  if (hasVI === 0) {
    console.log('[DB] 迁移: 创建 visit_inventory 表...');
    db.exec(`
      CREATE TABLE visit_inventory (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
        item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
        qty_ordered     INTEGER DEFAULT 0,
        qty_consumed    INTEGER DEFAULT 0,
        settled         INTEGER DEFAULT 0,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX idx_vi_visit ON visit_inventory(visit_id);
    `);
  }

  // ── v3.0: visit_inventory 升级（qty_consumed → qty_verified, +source/note）──
  const hasVerified = db.prepare(
    "SELECT count(*) as cnt FROM pragma_table_info('visit_inventory') WHERE name='qty_verified'"
  ).get().cnt;
  if (hasVerified === 0) {
    console.log('[DB] 迁移: visit_inventory 升级到 v3.0...');
    // 1. 从 qty_consumed 迁移数据到新列 qty_verified
    db.exec(`ALTER TABLE visit_inventory ADD COLUMN qty_verified INTEGER DEFAULT 0`);
    db.exec(`UPDATE visit_inventory SET qty_verified = qty_consumed WHERE qty_consumed > 0`);
    // 2. 添加 source 和 note
    const hasSource = db.prepare(
      "SELECT count(*) as cnt FROM pragma_table_info('visit_inventory') WHERE name='source'"
    ).get().cnt;
    if (hasSource === 0) {
      db.exec(`ALTER TABLE visit_inventory ADD COLUMN source TEXT DEFAULT 'pre_op'`);
      db.exec(`ALTER TABLE visit_inventory ADD COLUMN note TEXT DEFAULT ''`);
    }
  }
  // ── v4.1: visits.assigned_assistant_id ──
  const hasAssistantCol = db.prepare(
    "SELECT count(*) as cnt FROM pragma_table_info('visits') WHERE name='assigned_assistant_id'"
  ).get().cnt;
  if (hasAssistantCol === 0) {
    console.log('[DB] 迁移: visits 表添加 assigned_assistant_id 列...');
    db.exec(`ALTER TABLE visits ADD COLUMN assigned_assistant_id INTEGER REFERENCES staff(id);`);
  }

  // ── v4.0: visit_recordings（面诊录音+AI分析）──
  const hasRecordings = db.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='visit_recordings'"
  ).get().cnt;
  if (hasRecordings === 0) {
    console.log('[DB] 迁移: 创建 visit_recordings 表...');
    db.exec(`
      CREATE TABLE visit_recordings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_id        INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
        guest_name      TEXT    NOT NULL,
        file_path       TEXT    NOT NULL,
        file_size       INTEGER,
        duration_sec    REAL,
        transcript      TEXT    DEFAULT '',
        report_json     TEXT    DEFAULT '{}',
        status          TEXT    DEFAULT 'uploaded' CHECK(status IN ('uploaded','transcribing','transcribed','analyzing','completed','failed')),
        error_message   TEXT,
        created_at      INTEGER NOT NULL,
        completed_at    INTEGER
      );
      CREATE INDEX idx_vrec_visit ON visit_recordings(visit_id);
    `);
  }

  // ── ★ v7.0 fix: 移除 rooms.type 的 CHECK 约束（允许自定义房间类型）──
  // SQLite 不支持 ALTER TABLE DROP CHECK，需重建表（幂等：检查现有表是否有 CHECK）
  const hasOldCheck = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type='table' AND name='rooms'
  `).get();
  if (hasOldCheck && hasOldCheck.sql && hasOldCheck.sql.toLowerCase().includes('check')) {
    console.log('[DB] 修复 v7.0: 移除 rooms.type CHECK 约束...');
    try {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE IF NOT EXISTS rooms_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          name           TEXT    NOT NULL UNIQUE,
          type           TEXT    NOT NULL,
          capacity       INTEGER DEFAULT 1,
          equipment_tags TEXT,
          is_active      INTEGER DEFAULT 1,
          sort_order     INTEGER DEFAULT 0
        );
        INSERT OR IGNORE INTO rooms_new SELECT id, name, type, capacity, equipment_tags, is_active, sort_order FROM rooms;
        DROP TABLE IF EXISTS rooms;
        ALTER TABLE rooms_new RENAME TO rooms;
        CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(type);
      `);
    } catch (e) {
      console.warn('[DB] 房间类型迁移失败（可能已迁移）:', e.message);
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // ── ★ v7.1: add transcript_oss_key column ──
  try {
    db.exec('ALTER TABLE visit_recordings ADD COLUMN transcript_oss_key TEXT');
    console.log('[DB] v7.1 迁移: 已添加 transcript_oss_key 列');
  } catch (e) {
    // 列已存在，忽略
  }

  // ── ★ v7.1.1: add completed_at column ──
  try {
    db.exec('ALTER TABLE visit_recordings ADD COLUMN completed_at INTEGER');
    console.log('[DB] v7.1.1 迁移: 已添加 completed_at 列');
  } catch (e) {
    // 列已存在，忽略
  }

  // ── ★ v7.1.1: fix stale 'uploading' status → 'uploaded' ──
  try {
    const fixed = db.prepare("UPDATE visit_recordings SET status = 'uploaded' WHERE status = 'uploading'").run();
    if (fixed.changes > 0) {
      console.log(`[DB] v7.1.1 修复: ${fixed.changes} 条 'uploading' 状态记录 → 'uploaded'`);
    }
  } catch (e) {
    console.warn('[DB] 修复 uploading 状态迁移失败:', e.message);
  }
}

module.exports = { db, initDatabase, DB_PATH };

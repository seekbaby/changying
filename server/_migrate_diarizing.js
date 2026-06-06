// Migration: add 'diarizing' to visit_recordings status CHECK constraint
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'flowradar.db');
const db = new Database(DB_PATH);

console.log('DB:', DB_PATH);

// 1. Check current constraint
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='visit_recordings'").get();
console.log('Current schema:', schema.sql.substring(0, 500));

// 2. Start transaction
db.exec('BEGIN');

try {
  // 3. Create new table with updated constraint
  db.exec(`
    CREATE TABLE visit_recordings_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id        INTEGER NOT NULL,
      guest_name      TEXT,
      file_name       TEXT    NOT NULL,
      file_size       INTEGER,
      duration_sec    REAL,
      transcript      TEXT    DEFAULT '',
      report_markdown TEXT    DEFAULT '',
      status          TEXT    DEFAULT 'uploading'
          CHECK(status IN (
              'uploading','uploaded','transcribing','transcribed','diarizing','analyzing','completed','failed'
          )),
      error_message   TEXT,
      created_at      INTEGER NOT NULL,
      completed_at    INTEGER,
      annotation      TEXT,
      curation_status TEXT    DEFAULT 'new',
      in_library_b    INTEGER DEFAULT 0,
      edited_analysis TEXT,
      case_type       TEXT,
      prompt_version  TEXT
    );
  `);

  // 4. Copy data
  db.exec('INSERT INTO visit_recordings_new SELECT * FROM visit_recordings');

  // 5. Drop old table
  db.exec('DROP TABLE visit_recordings');

  // 6. Rename
  db.exec('ALTER TABLE visit_recordings_new RENAME TO visit_recordings');

  // 7. Recreate indexes
  db.exec('CREATE INDEX idx_recordings_visit ON visit_recordings(visit_id)');

  db.exec('COMMIT');
  console.log('✅ Migration successful');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
}

// Verify
const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='visit_recordings'").get();
const hasDiarizing = newSchema.sql.includes('diarizing');
console.log('diarizing in schema:', hasDiarizing);

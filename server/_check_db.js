const Database = require('better-sqlite3');
const db = new Database('../data/flowradar.db');

console.log('=== visit_recordings 表结构 ===');
db.prepare("PRAGMA table_info(visit_recordings)").all().forEach(c => console.log('  ' + c.name + ' (' + c.type + ')'));

console.log('\n=== 最新已完成录音 ===');
try {
  const rows = db.prepare(`
    SELECT id, status, guest_name, 
           length(transcript) as tlen,
           substr(transcript, 1, 800) as t 
    FROM visit_recordings 
    WHERE status='completed' 
    ORDER BY id DESC LIMIT 2
  `).all();
  
  rows.forEach(r => {
    console.log('\n--- #' + r.id + ' ' + r.guest_name + ' ---');
    console.log('transcript length: ' + r.tlen + ' chars');
    if (r.t) {
      console.log('transcript:');
      console.log(r.t.substring(0, 800));
    } else {
      console.log('transcript: (null)');
    }
  });
} catch(e) {
  console.log('Error:', e.message);
}

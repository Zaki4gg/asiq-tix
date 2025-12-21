import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dbFile) {
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Apply schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  return db;
}

export function seedAdmins(db, addresses) {
  if (!Array.isArray(addresses)) return;
  const norm = (a) => (a || '').toLowerCase().trim();
  const stmt = db.prepare(`INSERT OR IGNORE INTO admins (address, note) VALUES (?, ?)`);
  db.transaction(() => {
    addresses
      .map(norm)
      .filter(a => /^0x[a-f0-9]{40}$/.test(a))
      .forEach(a => stmt.run(a, 'seeded-from-env'));
  })();
}

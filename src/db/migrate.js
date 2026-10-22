import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { stamp } from '../lib/time.js';

/**
 * Pelari migrasi ringkas: setiap fail .sql dalam migrations/ digunakan sekali,
 * mengikut susunan nama fail, dalam satu transaksi.
 */
export async function runMigrations(db, { log = console } = {}) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const dir = config.migrationsDir;
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.query('SELECT id FROM schema_migrations')).map((r) => r.id));
  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async () => {
      for (const statement of splitStatements(sql)) {
        await db.exec(statement);
      }
      await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [file, stamp()]);
    });
    applied.push(file);
    log.info?.(`[migrate] digunakan: ${file}`);
  }

  return applied;
}

/** Pecahkan skrip SQL kepada statement tunggal (abaikan koma bertindih dalam trigger). */
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { getDb, closeDb } = await import('./index.js');
  const db = await getDb();
  const applied = await runMigrations(db);
  console.log(applied.length ? `Selesai. ${applied.length} migrasi digunakan.` : 'Skema sudah terkini.');
  await closeDb();
}

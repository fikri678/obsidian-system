import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Pemacu SQLite tanpa dependency luar (node:sqlite terbina dalam Node >= 22.5).
 * Mendedahkan antara muka pangkalan data yang sama seperti pemacu PostgreSQL,
 * jadi repositori tidak perlu diubah apabila berpindah pelayan.
 */
export function createSqliteDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  let depth = 0;

  const normalizeParams = (params = []) =>
    params.map((p) => {
      if (p === undefined) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      return p;
    });

  return {
    dialect: 'sqlite',
    file,

    async query(sql, params = []) {
      return db.prepare(sql).all(...normalizeParams(params)).map((row) => ({ ...row }));
    },

    async get(sql, params = []) {
      const row = db.prepare(sql).get(...normalizeParams(params));
      return row ? { ...row } : null;
    },

    async run(sql, params = []) {
      const info = db.prepare(sql).run(...normalizeParams(params));
      return { changes: Number(info.changes || 0), lastInsertRowid: info.lastInsertRowid };
    },

    async exec(sql) {
      db.exec(sql);
    },

    /** Transaksi bersarang menggunakan SAVEPOINT. */
    async tx(fn) {
      const outer = depth === 0;
      const savepoint = `sp_${depth}`;
      depth += 1;
      db.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
      try {
        const result = await fn();
        db.exec(outer ? 'COMMIT' : `RELEASE ${savepoint}`);
        return result;
      } catch (err) {
        try { db.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`); } catch { /* abaikan */ }
        throw err;
      } finally {
        depth -= 1;
      }
    },

    async close() {
      db.close();
    }
  };
}

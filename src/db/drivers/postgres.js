import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Pemandu PostgreSQL — disediakan untuk migrasi masa depan.
 * Tidak dimuatkan secara lalai; pasang `pg` dan tetapkan DB_DRIVER=postgres.
 * Semua SQL dalam repositori menggunakan placeholder '?' dan akan
 * dinormalisasi kepada '$1, $2, ...' di sini.
 */
export async function createPostgresDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL diperlukan untuk DB_DRIVER=postgres');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: 10 });
  let depth = 0;

  const normalizeSql = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  return {
    dialect: 'postgres',
    file: connectionString,

    async query(sql, params = []) {
      const res = await pool.query(normalizeSql(sql), params);
      return res.rows;
    },

    async get(sql, params = []) {
      const res = await pool.query(normalizeSql(sql), params);
      return res.rows[0] || null;
    },

    async run(sql, params = []) {
      const res = await pool.query(normalizeSql(sql), params);
      return { changes: res.rowCount || 0 };
    },

    async exec(sql) {
      await pool.query(sql);
    },

    async tx(fn) {
      const client = await pool.connect();
      const savepoint = `sp_${depth++}`;
      try {
        await client.query(depth === 1 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
        const result = await fn();
        await client.query(depth === 1 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (err) {
        try { await client.query(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`); } catch { /* abaikan */ }
        throw err;
      } finally {
        depth -= 1;
        client.release();
      }
    },

    async close() {
      await pool.end();
    }
  };
}

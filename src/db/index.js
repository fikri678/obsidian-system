import { config } from '../config.js';
import { createSqliteDatabase } from './drivers/sqlite.js';
import { createPostgresDatabase } from './drivers/postgres.js';
import { runMigrations } from './migrate.js';

let instance = null;
let bootstrapped = null;

/** Cipta/pulangkan satu sambungan pangkalan data untuk keseluruhan proses. */
export async function getDb() {
  if (instance) return instance;
  if (config.dbDriver === 'postgres') {
    instance = await createPostgresDatabase(config.databaseUrl);
  } else if (config.dbDriver === 'sqlite') {
    instance = await createSqliteDatabase(config.dbFile);
  } else {
    throw new Error(`DB_DRIVER tidak dikenali: ${config.dbDriver}`);
  }
  return instance;
}

/**
 * Sediakan skema + data demo (sekali sahaja).
 * Memanggil dua kali selamat kerana migrasi idempotent dan seed menyemak data.
 */
export async function bootstrapDatabase({ seedIfEmpty = true, log = console } = {}) {
  if (bootstrapped) return bootstrapped;
  const db = await getDb();
  const applied = await runMigrations(db, { log });
  if (seedIfEmpty) {
    const { seedIfEmpty: seed } = await import('./seed.js');
    await seed(db, { log });
  }
  bootstrapped = { db, applied };
  return bootstrapped;
}

export async function closeDb() {
  if (instance) {
    await instance.close();
    instance = null;
    bootstrapped = null;
  }
}

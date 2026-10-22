import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Muat .env ringkas (tiada dependency luar)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 4173),
  host: process.env.HOST || '127.0.0.1',
  isProd: process.env.NODE_ENV === 'production',
  // Cookie Secure: aktif secara lalai dalam production, boleh dipaksa untuk
  // deployment di belakang proksi HTTPS yang menerima trafik HTTP dari origin.
  cookieSecure: process.env.COOKIE_SECURE !== undefined
    ? ['1', 'true', 'yes'].includes(String(process.env.COOKIE_SECURE).toLowerCase())
    : process.env.NODE_ENV === 'production',

  // Persistence: 'sqlite' (lalai) — 'postgres' disediakan untuk migrasi akan datang
  dbDriver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'nivora.db'),
  databaseUrl: process.env.DATABASE_URL || '',

  publicDir: path.join(ROOT, 'public'),
  migrationsDir: path.join(ROOT, 'src', 'db', 'migrations'),

  sessionCookie: 'nivora_sid',
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 7),

  // Had cubaan log masuk (in-memory sahaja)
  loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 8),
  loginWindowMs: num(process.env.LOGIN_WINDOW_MS, 10 * 60 * 1000)
};

export const DEMO = {
  admin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@nivora.my',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin123'
  },
  merchant: {
    email: process.env.SEED_MERCHANT_EMAIL || 'kakani@nivora.my',
    password: process.env.SEED_MERCHANT_PASSWORD || 'user123'
  }
};

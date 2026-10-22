import { stamp } from '../../lib/time.js';

const DEFAULTS = {
  platformName: 'NIVORA',
  platformTagline: 'Pengurusan Pesanan & Untung Kuih Malaysia',
  pickupSlots: ['08:00', '10:30', '14:30', '16:30', '18:00'],
  lowMarginThresholdPct: 35,
  currency: 'RM'
};

export function settingsRepo(db) {
  return {
    async all() {
      const rows = await db.query('SELECT key, value FROM settings');
      const out = { ...DEFAULTS };
      for (const row of rows) {
        out[row.key] = safeParse(row.value, row.value);
      }
      return out;
    },

    async get(key) {
      const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
      if (!row) return DEFAULTS[key];
      return safeParse(row.value, row.value);
    },

    async setMany(values) {
      for (const [key, value] of Object.entries(values)) {
        const serialized = JSON.stringify(value);
        const exists = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
        if (exists) {
          await db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [serialized, stamp(), key]);
        } else {
          await db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, serialized, stamp()]);
        }
      }
      return this.all();
    }
  };
}

function safeParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

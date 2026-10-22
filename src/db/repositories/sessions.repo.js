import { createHash, randomBytes } from 'node:crypto';
import { addDaysISO, stamp, todayISO } from '../../lib/time.js';

const sha256 = (v) => createHash('sha256').update(v).digest('hex');

export function sessionsRepo(db) {
  return {
    newToken() {
      const token = randomBytes(32).toString('base64url');
      return { token, id: sha256(token) };
    },

    async create({ id, userId, ttlDays, userAgent, ip }) {
      const expiresAt = `${addDaysISO(todayISO(), ttlDays)} ${stamp().slice(11)}`;
      await db.run(`
        INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, userId, stamp(), expiresAt, userAgent || '', ip || '']);
      return expiresAt;
    },

    async findUserByToken(token) {
      if (!token) return null;
      const row = await db.get(`
        SELECT s.id AS session_id, s.expires_at, u.*
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
      `, [sha256(token)]);
      if (!row) return null;
      if (String(row.expires_at) < stamp()) {
        await db.run('DELETE FROM sessions WHERE id = ?', [row.session_id]);
        return null;
      }
      if (row.status !== 'active') return null;
      return {
        sessionId: row.session_id,
        user: {
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          email: row.email,
          role: row.role,
          status: row.status,
          lastLoginAt: row.last_login_at
        }
      };
    },

    async removeByToken(token) {
      if (!token) return;
      await db.run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
    },

    async removeForUser(userId) {
      await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    },

    async purgeExpired() {
      await db.run('DELETE FROM sessions WHERE expires_at < ?', [stamp()]);
    }
  };
}

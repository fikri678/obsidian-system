import { randomUUID } from 'node:crypto';
import { stamp } from '../../lib/time.js';

export function auditRepo(db) {
  return {
    async log({ actorUser = null, tenantId = null, action, entity = null, entityId = null, detail = null }) {
      await db.run(`
        INSERT INTO audit_logs (id, actor_user_id, actor_name, tenant_id, action, entity, entity_id, detail, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `aud_${randomUUID()}`,
        actorUser?.id || null,
        actorUser?.name || 'Sistem',
        tenantId,
        action,
        entity,
        entityId,
        detail ? JSON.stringify(detail) : null,
        stamp()
      ]);
    },

    async list({ tenantId = null, limit = 100, q = '' } = {}) {
      const where = [];
      const params = [];
      if (tenantId) { where.push('tenant_id = ?'); params.push(tenantId); }
      if (q) {
        where.push('(lower(actor_name) LIKE ? OR lower(action) LIKE ? OR lower(COALESCE(entity, \'\')) LIKE ?)');
        const like = `%${q.toLowerCase()}%`;
        params.push(like, like, like);
      }
      params.push(Math.min(300, Number(limit) || 100));
      const rows = await db.query(`
        SELECT a.*, t.name AS tenant_name
        FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.created_at DESC LIMIT ?
      `, params);
      return rows.map((r) => ({
        id: r.id,
        actorName: r.actor_name,
        actorUserId: r.actor_user_id,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        detail: r.detail ? safeParse(r.detail) : null,
        createdAt: r.created_at
      }));
    }
  };
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

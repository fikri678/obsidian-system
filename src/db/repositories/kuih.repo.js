const mapKuih = (r) => r && ({
  id: r.id,
  tenantId: r.tenant_id,
  name: r.name,
  description: r.description || '',
  unit: r.unit || 'biji',
  priceCents: Number(r.price_cents || 0),
  costCents: Number(r.cost_cents || 0),
  status: r.status,
  sortOrder: Number(r.sort_order || 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export function kuihRepo(db) {
  return {
    async listByTenant(tenantId, { includeArchived = false } = {}) {
      const sql = includeArchived
        ? 'SELECT * FROM kuih WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC'
        : "SELECT * FROM kuih WHERE tenant_id = ? AND status = 'active' ORDER BY sort_order ASC, name ASC";
      return (await db.query(sql, [tenantId])).map(mapKuih);
    },

    async findById(id, tenantId = null) {
      const row = tenantId
        ? await db.get('SELECT * FROM kuih WHERE id = ? AND tenant_id = ?', [id, tenantId])
        : await db.get('SELECT * FROM kuih WHERE id = ?', [id]);
      return mapKuih(row);
    },

    async create(k) {
      await db.run(`
        INSERT INTO kuih (id, tenant_id, name, description, unit, price_cents, cost_cents, status, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [k.id, k.tenantId, k.name, k.description || '', k.unit || 'biji', k.priceCents || 0,
        k.costCents || 0, k.status || 'active', k.sortOrder || 0, k.createdAt, k.updatedAt]);
      return this.findById(k.id);
    },

    async update(id, tenantId, fields) {
      const allowed = {
        name: 'name', description: 'description', unit: 'unit', priceCents: 'price_cents',
        costCents: 'cost_cents', status: 'status', sortOrder: 'sort_order', updatedAt: 'updated_at'
      };
      const sets = [];
      const params = [];
      for (const [key, col] of Object.entries(allowed)) {
        if (fields[key] !== undefined) { sets.push(`${col} = ?`); params.push(fields[key]); }
      }
      if (!sets.length) return this.findById(id, tenantId);
      params.push(id, tenantId);
      await db.run(`UPDATE kuih SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
      return this.findById(id, tenantId);
    },

    async archive(id, tenantId) {
      const res = await db.run("UPDATE kuih SET status = 'archived', updated_at = ? WHERE id = ? AND tenant_id = ?",
        [new Date().toISOString().slice(0, 19).replace('T', ' '), id, tenantId]);
      return res.changes > 0;
    },

    async countActive(tenantId) {
      const row = await db.get("SELECT COUNT(*) AS n FROM kuih WHERE tenant_id = ? AND status = 'active'", [tenantId]);
      return Number(row?.n || 0);
    }
  };
}

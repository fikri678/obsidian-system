const mapIngredient = (r) => r && ({
  id: r.id,
  tenantId: r.tenant_id,
  name: r.name,
  unit: r.unit || 'kg',
  priceCents: Number(r.price_cents || 0),
  note: r.note || '',
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export function ingredientsRepo(db) {
  return {
    async listByTenant(tenantId) {
      return (await db.query('SELECT * FROM ingredients WHERE tenant_id = ? ORDER BY name ASC', [tenantId]))
        .map(mapIngredient);
    },

    async findById(id, tenantId) {
      return mapIngredient(await db.get('SELECT * FROM ingredients WHERE id = ? AND tenant_id = ?', [id, tenantId]));
    },

    async create(i) {
      await db.run(`
        INSERT INTO ingredients (id, tenant_id, name, unit, price_cents, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [i.id, i.tenantId, i.name, i.unit || 'kg', i.priceCents || 0, i.note || '', i.createdAt, i.updatedAt]);
      return this.findById(i.id, i.tenantId);
    },

    async update(id, tenantId, fields) {
      const allowed = { name: 'name', unit: 'unit', priceCents: 'price_cents', note: 'note', updatedAt: 'updated_at' };
      const sets = [];
      const params = [];
      for (const [key, col] of Object.entries(allowed)) {
        if (fields[key] !== undefined) { sets.push(`${col} = ?`); params.push(fields[key]); }
      }
      if (!sets.length) return this.findById(id, tenantId);
      params.push(id, tenantId);
      await db.run(`UPDATE ingredients SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
      return this.findById(id, tenantId);
    },

    async remove(id, tenantId) {
      const res = await db.run('DELETE FROM ingredients WHERE id = ? AND tenant_id = ?', [id, tenantId]);
      return res.changes > 0;
    }
  };
}

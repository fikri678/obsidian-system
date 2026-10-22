const mapTenant = (r) => r && ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  ownerName: r.owner_name || '',
  phone: r.phone || '',
  location: r.location || '',
  tagline: r.tagline || '',
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export function tenantsRepo(db) {
  return {
    async list({ status = null, q = '' } = {}) {
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (q) { where.push('(lower(name) LIKE ? OR lower(location) LIKE ?)'); params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`); }
      const sql = `SELECT * FROM tenants ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC`;
      return (await db.query(sql, params)).map(mapTenant);
    },

    async findById(id) {
      return mapTenant(await db.get('SELECT * FROM tenants WHERE id = ?', [id]));
    },

    async findBySlug(slug) {
      return mapTenant(await db.get('SELECT * FROM tenants WHERE slug = ?', [String(slug).toLowerCase()]));
    },

    async create(t) {
      await db.run(`
        INSERT INTO tenants (id, name, slug, owner_name, phone, location, tagline, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [t.id, t.name, t.slug, t.ownerName || '', t.phone || '', t.location || '', t.tagline || '',
        t.status || 'active', t.createdAt, t.updatedAt]);
      return this.findById(t.id);
    },

    async update(id, fields) {
      const allowed = {
        name: 'name', slug: 'slug', ownerName: 'owner_name', phone: 'phone',
        location: 'location', tagline: 'tagline', status: 'status', updatedAt: 'updated_at'
      };
      const sets = [];
      const params = [];
      for (const [key, col] of Object.entries(allowed)) {
        if (fields[key] !== undefined) { sets.push(`${col} = ?`); params.push(fields[key]); }
      }
      if (!sets.length) return this.findById(id);
      params.push(id);
      await db.run(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
      return this.findById(id);
    },

    async remove(id) {
      const res = await db.run('DELETE FROM tenants WHERE id = ?', [id]);
      return res.changes > 0;
    },

    async count() {
      const row = await db.get('SELECT COUNT(*) AS n FROM tenants');
      return Number(row?.n || 0);
    }
  };
}

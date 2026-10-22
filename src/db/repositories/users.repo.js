const mapUser = (r) => r && ({
  id: r.id,
  tenantId: r.tenant_id,
  name: r.name,
  email: r.email,
  role: r.role,
  status: r.status,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export function usersRepo(db) {
  return {
    async findByEmail(email) {
      const row = await db.get('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()]);
      if (!row) return null;
      return { ...mapUser(row), passwordHash: row.password_hash };
    },

    async findById(id) {
      return mapUser(await db.get('SELECT * FROM users WHERE id = ?', [id]));
    },

    async list({ role = null, tenantId = null, q = '' } = {}) {
      const where = [];
      const params = [];
      if (role) { where.push('role = ?'); params.push(role); }
      if (tenantId) { where.push('tenant_id = ?'); params.push(tenantId); }
      if (q) {
        where.push('(lower(name) LIKE ? OR lower(email) LIKE ?)');
        params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
      }
      const sql = `SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
      return (await db.query(sql, params)).map(mapUser);
    },

    async listWithTenant() {
      const rows = await db.query(`
        SELECT u.*, t.name AS tenant_name, t.slug AS tenant_slug
        FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
        ORDER BY u.created_at DESC
      `);
      return rows.map((r) => ({ ...mapUser(r), tenantName: r.tenant_name, tenantSlug: r.tenant_slug }));
    },

    async create(user) {
      await db.run(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [user.id, user.tenantId || null, user.name, user.email.toLowerCase(), user.passwordHash,
        user.role || 'user', user.status || 'active', user.createdAt, user.updatedAt]);
      return this.findById(user.id);
    },

    async update(id, fields) {
      const allowed = {
        name: 'name',
        email: 'email',
        tenantId: 'tenant_id',
        role: 'role',
        status: 'status',
        lastLoginAt: 'last_login_at',
        passwordHash: 'password_hash',
        updatedAt: 'updated_at'
      };
      const sets = [];
      const params = [];
      for (const [key, col] of Object.entries(allowed)) {
        if (fields[key] !== undefined) {
          sets.push(`${col} = ?`);
          params.push(key === 'email' ? String(fields[key]).toLowerCase() : fields[key]);
        }
      }
      if (!sets.length) return this.findById(id);
      params.push(id);
      await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
      return this.findById(id);
    },

    async remove(id) {
      const res = await db.run('DELETE FROM users WHERE id = ?', [id]);
      return res.changes > 0;
    },

    async count({ role = null } = {}) {
      const row = role
        ? await db.get('SELECT COUNT(*) AS n FROM users WHERE role = ?', [role])
        : await db.get('SELECT COUNT(*) AS n FROM users');
      return Number(row?.n || 0);
    }
  };
}

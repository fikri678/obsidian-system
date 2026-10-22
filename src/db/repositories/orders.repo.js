const mapOrder = (r) => r && ({
  id: r.id,
  tenantId: r.tenant_id,
  tenantName: r.tenant_name || undefined,
  code: r.code,
  customerName: r.customer_name,
  phone: r.phone,
  pickupDate: r.pickup_date,
  pickupTime: r.pickup_time,
  status: r.status,
  channel: r.channel,
  note: r.note || '',
  totalCents: Number(r.total_cents || 0),
  costCents: Number(r.cost_cents || 0),
  discountCents: Number(r.discount_cents || 0),
  profitCents: Number(r.total_cents || 0) - Number(r.cost_cents || 0),
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapItem = (r) => ({
  id: r.id,
  orderId: r.order_id,
  kuihId: r.kuih_id,
  name: r.name,
  qty: Number(r.qty || 0),
  unitPriceCents: Number(r.unit_price_cents || 0),
  unitCostCents: Number(r.unit_cost_cents || 0),
  lineTotalCents: Number(r.line_total_cents || 0)
});

export const ORDER_STATUSES = ['baru', 'disediakan', 'sedia', 'selesai', 'batal'];

export function ordersRepo(db) {
  const repo = {
    async list({ tenantId = null, status = null, q = '', from = null, to = null, limit = 100, offset = 0, withTenant = false } = {}) {
      const where = [];
      const params = [];
      if (tenantId) { where.push('o.tenant_id = ?'); params.push(tenantId); }
      if (status && status !== 'ALL') { where.push('o.status = ?'); params.push(status); }
      if (from) { where.push('o.pickup_date >= ?'); params.push(from); }
      if (to) { where.push('o.pickup_date <= ?'); params.push(to); }
      if (q) {
        where.push('(lower(o.customer_name) LIKE ? OR o.phone LIKE ? OR lower(o.code) LIKE ?)');
        const like = `%${String(q).toLowerCase()}%`;
        params.push(like, like, like);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limitClause = `LIMIT ${Math.min(500, Math.max(1, Number(limit) || 100))} OFFSET ${Math.max(0, Number(offset) || 0)}`;

      const rows = await db.query(`
        SELECT o.* ${withTenant ? ', t.name AS tenant_name' : ''}
        FROM orders o ${withTenant ? 'JOIN tenants t ON t.id = o.tenant_id' : ''}
        ${clause}
        ORDER BY o.pickup_date DESC, o.pickup_time DESC, o.created_at DESC
        ${limitClause}
      `, params);

      const orders = rows.map(mapOrder);
      if (!orders.length) return orders;

      const ids = orders.map((o) => o.id);
      const placeholders = ids.map(() => '?').join(',');
      const items = await db.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, ids);
      const byOrder = new Map();
      for (const item of items) {
        if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
        byOrder.get(item.order_id).push(mapItem(item));
      }
      return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
    },

    async findById(id, tenantId = null) {
      const row = tenantId
        ? await db.get('SELECT * FROM orders WHERE id = ? AND tenant_id = ?', [id, tenantId])
        : await db.get('SELECT * FROM orders WHERE id = ?', [id]);
      const order = mapOrder(row);
      if (!order) return null;
      order.items = (await db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY name ASC', [id])).map(mapItem);
      return order;
    },

    async findByCode(tenantId, code) {
      return mapOrder(await db.get('SELECT * FROM orders WHERE tenant_id = ? AND code = ?', [tenantId, code]));
    },

    async nextCode(tenantId) {
      const name = `order_code_${tenantId}`;
      await db.run(`
        INSERT INTO counters (name, value) VALUES (?, 1)
        ON CONFLICT(name) DO UPDATE SET value = value + 1
      `, [name]);
      const row = await db.get('SELECT value FROM counters WHERE name = ?', [name]);
      return `KUIH-${1000 + Number(row?.value || 1)}`;
    },

    async create(order, items) {
      return db.tx(async () => {
        const code = order.code || await repo.nextCode(order.tenantId);
        await db.run(`
          INSERT INTO orders (id, tenant_id, code, customer_name, phone, pickup_date, pickup_time, status,
                              channel, note, total_cents, cost_cents, discount_cents, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [order.id, order.tenantId, code, order.customerName, order.phone, order.pickupDate, order.pickupTime,
          order.status || 'baru', order.channel || 'walkin', order.note || '', order.totalCents || 0,
          order.costCents || 0, order.discountCents || 0, order.createdBy || null, order.createdAt, order.updatedAt]);

        for (const item of items) {
          await db.run(`
            INSERT INTO order_items (id, order_id, kuih_id, name, qty, unit_price_cents, unit_cost_cents, line_total_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [item.id, order.id, item.kuihId || null, item.name, item.qty,
            item.unitPriceCents, item.unitCostCents, item.lineTotalCents]);
        }
        return repo.findById(order.id, order.tenantId);
      });
    },

    async updateStatus(id, status, tenantId = null) {
      const params = [status, new Date().toISOString().slice(0, 19).replace('T', ' ')];
      const sql = tenantId
        ? 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        : 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?';
      params.push(id);
      if (tenantId) params.push(tenantId);
      await db.run(sql, params);
      return repo.findById(id, tenantId);
    },

    async metrics({ tenantId = null, from = null, to = null } = {}) {
      const where = ["status <> 'batal'"];
      const params = [];
      if (tenantId) { where.push('tenant_id = ?'); params.push(tenantId); }
      if (from) { where.push('pickup_date >= ?'); params.push(from); }
      if (to) { where.push('pickup_date <= ?'); params.push(to); }
      const row = await db.get(`
        SELECT COUNT(*) AS orders,
               COALESCE(SUM(total_cents), 0) AS gross,
               COALESCE(SUM(cost_cents), 0) AS cost,
               SUM(CASE WHEN status = 'selesai' THEN 1 ELSE 0 END) AS done
        FROM orders WHERE ${where.join(' AND ')}
      `, params);
      const gross = Number(row?.gross || 0);
      const cost = Number(row?.cost || 0);
      return {
        orders: Number(row?.orders || 0),
        done: Number(row?.done || 0),
        grossCents: gross,
        costCents: cost,
        netCents: gross - cost,
        marginPct: gross > 0 ? Math.round(((gross - cost) / gross) * 1000) / 10 : 0,
        avgOrderCents: Number(row?.orders || 0) ? Math.round(gross / Number(row.orders)) : 0
      };
    },

    async series({ tenantId = null, from, to } = {}) {
      const where = ["status <> 'batal'", 'pickup_date BETWEEN ? AND ?'];
      const params = [from, to];
      if (tenantId) { where.unshift('tenant_id = ?'); params.unshift(tenantId); }
      const rows = await db.query(`
        SELECT pickup_date AS day, COUNT(*) AS orders,
               COALESCE(SUM(total_cents), 0) AS gross,
               COALESCE(SUM(cost_cents), 0) AS cost
        FROM orders WHERE ${where.join(' AND ')}
        GROUP BY pickup_date ORDER BY pickup_date ASC
      `, params);
      return rows.map((r) => ({
        date: r.day,
        orders: Number(r.orders || 0),
        grossCents: Number(r.gross || 0),
        netCents: Number(r.gross || 0) - Number(r.cost || 0)
      }));
    },

    async topKuih({ tenantId = null, from, to, limit = 5 } = {}) {
      const where = ["o.status <> 'batal'", 'o.pickup_date BETWEEN ? AND ?'];
      const params = [from, to];
      if (tenantId) { where.unshift('o.tenant_id = ?'); params.unshift(tenantId); }
      params.push(Math.min(20, Number(limit) || 5));
      const rows = await db.query(`
        SELECT oi.name AS name, SUM(oi.qty) AS qty, SUM(oi.line_total_cents) AS revenue
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${where.join(' AND ')}
        GROUP BY oi.name ORDER BY qty DESC LIMIT ?
      `, params);
      return rows.map((r) => ({ name: r.name, qty: Number(r.qty || 0), revenueCents: Number(r.revenue || 0) }));
    },

    async statusCounts({ tenantId = null, from, to } = {}) {
      const where = ['pickup_date BETWEEN ? AND ?'];
      const params = [from, to];
      if (tenantId) { where.unshift('tenant_id = ?'); params.unshift(tenantId); }
      const rows = await db.query(`
        SELECT status, COUNT(*) AS n FROM orders WHERE ${where.join(' AND ')} GROUP BY status
      `, params);
      const out = { baru: 0, disediakan: 0, sedia: 0, selesai: 0, batal: 0 };
      for (const r of rows) out[r.status] = Number(r.n || 0);
      return out;
    },

    async pickupsForDate(tenantId, date) {
      const rows = await db.query(`
        SELECT o.*, (SELECT COALESCE(SUM(qty), 0) FROM order_items oi WHERE oi.order_id = o.id) AS total_qty
        FROM orders o
        WHERE o.tenant_id = ? AND o.pickup_date = ? AND o.status NOT IN ('selesai', 'batal')
        ORDER BY o.pickup_time ASC
      `, [tenantId, date]);

      const orders = rows.map((r) => ({ ...mapOrder(r), totalQty: Number(r.total_qty || 0) }));
      if (!orders.length) return orders;

      const ids = orders.map((o) => o.id);
      const placeholders = ids.map(() => '?').join(',');
      const items = await db.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, ids);
      const byOrder = new Map();
      for (const item of items) {
        if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
        byOrder.get(item.order_id).push(mapItem(item));
      }
      return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
    },

    async count({ tenantId = null } = {}) {
      const row = tenantId
        ? await db.get('SELECT COUNT(*) AS n FROM orders WHERE tenant_id = ?', [tenantId])
        : await db.get('SELECT COUNT(*) AS n FROM orders');
      return Number(row?.n || 0);
    },

    async tenantBreakdown() {
      const rows = await db.query(`
        SELECT t.id, t.name, t.slug, t.status,
               COUNT(o.id) AS orders,
               COALESCE(SUM(CASE WHEN o.status <> 'batal' THEN o.total_cents ELSE 0 END), 0) AS gross,
               COALESCE(SUM(CASE WHEN o.status <> 'batal' THEN o.cost_cents ELSE 0 END), 0) AS cost
        FROM tenants t LEFT JOIN orders o ON o.tenant_id = t.id
        GROUP BY t.id, t.name, t.slug, t.status
        ORDER BY gross DESC
      `);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        orders: Number(r.orders || 0),
        grossCents: Number(r.gross || 0),
        netCents: Number(r.gross || 0) - Number(r.cost || 0)
      }));
    }
  };

  return repo;
}

import { addDaysISO, dateRange, daysAgoISO, labelDate, todayISO } from '../lib/time.js';
import { percent } from '../lib/money.js';

export function platformService({ repos, settings, audit }) {
  return {
    async overview() {
      const today = todayISO();
      const from = daysAgoISO(13);
      const [tenants, userCount, orderCount, allMetrics, series, breakdown, statusCounts, recentOrders, activity, config] =
        await Promise.all([
          repos.tenants.list(),
          repos.users.count(),
          repos.orders.count(),
          repos.orders.metrics({ from: '2000-01-01', to: today }),
          repos.orders.series({ from, to: today }),
          repos.orders.tenantBreakdown(),
          repos.orders.statusCounts({ from: addDaysISO(today, -29), to: today }),
          repos.orders.list({ limit: 8, withTenant: true }),
          audit.list({ limit: 8 }),
          settings.all()
        ]);

      const byDate = new Map(series.map((p) => [p.date, p]));
      const chart = dateRange(from, today).map((date) => {
        const point = byDate.get(date);
        return {
          date,
          label: labelDate(date).replace(/ \d{4}$/, ''),
          orders: point?.orders || 0,
          grossCents: point?.grossCents || 0,
          netCents: point?.netCents || 0
        };
      });

      const last7 = chart.slice(-7).reduce((s, p) => s + p.grossCents, 0);
      const prev7 = chart.slice(-14, -7).reduce((s, p) => s + p.grossCents, 0);

      return {
        config: {
          platformName: config.platformName,
          platformTagline: config.platformTagline,
          lowMarginThresholdPct: config.lowMarginThresholdPct,
          pickupSlots: config.pickupSlots
        },
        counts: {
          tenants: tenants.length,
          activeTenants: tenants.filter((t) => t.status === 'active').length,
          users: userCount,
          orders: orderCount
        },
        metrics: allMetrics,
        growthPct: prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 1000) / 10 : null,
        series: chart,
        tenantBreakdown: breakdown,
        statusCounts,
        recentOrders,
        activity
      };
    },

    async listTenants() {
      const [tenants, breakdown, users] = await Promise.all([
        repos.tenants.list(),
        repos.orders.tenantBreakdown(),
        repos.users.listWithTenant()
      ]);
      const stats = new Map(breakdown.map((b) => [b.id, b]));
      return tenants.map((t) => {
        const stat = stats.get(t.id) || { orders: 0, grossCents: 0, netCents: 0 };
        return {
          ...t,
          orders: stat.orders,
          grossCents: stat.grossCents,
          netCents: stat.netCents,
          marginPct: percent(stat.netCents, stat.grossCents),
          userCount: users.filter((u) => u.tenantId === t.id).length
        };
      });
    },

    async createTenant(actor, payload) {
      const { randomUUID } = await import('node:crypto');
      const { requireString, optionalString, slugify } = await import('../lib/validate.js');
      const { stamp } = await import('../lib/time.js');
      const { HttpError } = await import('../lib/errors.js');

      const name = requireString(payload.name, 'Nama kedai', { max: 120 });
      let slug = slugify(payload.slug || name);
      if (!slug) throw new HttpError(400, 'Slug kedai tidak sah.');

      const existing = await repos.tenants.findBySlug(slug);
      if (existing) slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;

      const now = stamp();
      const tenant = await repos.tenants.create({
        id: `tnt_${randomUUID()}`,
        name,
        slug,
        ownerName: optionalString(payload.ownerName, { max: 120 }),
        phone: optionalString(payload.phone, { max: 40 }),
        location: optionalString(payload.location, { max: 200 }),
        tagline: optionalString(payload.tagline, { max: 200 }),
        status: payload.status === 'suspended' ? 'suspended' : 'active',
        createdAt: now,
        updatedAt: now
      });
      await audit.log({ actorUser: actor, tenantId: tenant.id, action: 'tenant.created', entity: 'tenant', entityId: tenant.id, detail: { name: tenant.name } });
      return tenant;
    },

    async updateTenant(actor, id, payload) {
      const { requireString, optionalString, slugify, requireEnum } = await import('../lib/validate.js');
      const { stamp } = await import('../lib/time.js');
      const tenant = await repos.tenants.findById(id);
      if (!tenant) {
        const { notFound } = await import('../lib/errors.js');
        throw notFound('Kedai tidak dijumpai.');
      }
      const fields = { updatedAt: stamp() };
      if (payload.name !== undefined) fields.name = requireString(payload.name, 'Nama kedai', { max: 120 });
      if (payload.slug !== undefined) fields.slug = slugify(payload.slug) || tenant.slug;
      if (payload.ownerName !== undefined) fields.ownerName = optionalString(payload.ownerName, { max: 120 });
      if (payload.phone !== undefined) fields.phone = optionalString(payload.phone, { max: 40 });
      if (payload.location !== undefined) fields.location = optionalString(payload.location, { max: 200 });
      if (payload.tagline !== undefined) fields.tagline = optionalString(payload.tagline, { max: 200 });
      if (payload.status !== undefined) fields.status = requireEnum(payload.status, ['active', 'suspended'], 'Status');
      const updated = await repos.tenants.update(id, fields);
      await audit.log({ actorUser: actor, tenantId: id, action: 'tenant.updated', entity: 'tenant', entityId: id, detail: { name: updated.name } });
      return updated;
    },

    async listAudit({ tenantId = null, q = '', limit = 100 } = {}) {
      return audit.list({ tenantId, q, limit });
    },

    async getSettings() {
      return settings.all();
    },

    async updateSettings(actor, payload) {
      const { HttpError } = await import('../lib/errors.js');
      const next = {};
      if (payload.platformName !== undefined) next.platformName = String(payload.platformName).trim().slice(0, 80) || 'NIVORA';
      if (payload.platformTagline !== undefined) next.platformTagline = String(payload.platformTagline).trim().slice(0, 160);
      if (payload.lowMarginThresholdPct !== undefined) {
        const n = Number(payload.lowMarginThresholdPct);
        if (!Number.isFinite(n) || n < 0 || n > 95) throw new HttpError(400, 'Ambang margin tidak sah.');
        next.lowMarginThresholdPct = Math.round(n);
      }
      if (payload.pickupSlots !== undefined) {
        if (!Array.isArray(payload.pickupSlots) || !payload.pickupSlots.length) {
          throw new HttpError(400, 'Sekurang-kurangnya satu slot pengambilan diperlukan.');
        }
        const slots = [...new Set(payload.pickupSlots.map((s) => String(s).trim()))]
          .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s))
          .sort();
        if (!slots.length) throw new HttpError(400, 'Format slot mesti HH:MM.');
        next.pickupSlots = slots;
      }
      const updated = await settings.setMany(next);
      await audit.log({ actorUser: actor, action: 'settings.updated', entity: 'settings', detail: next });
      return updated;
    }
  };
}

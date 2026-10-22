import { HttpError, forbidden, notFound } from '../lib/errors.js';
import { optionalString, requireEmail, requireEnum, requirePassword, requireString } from '../lib/validate.js';
import { stamp } from '../lib/time.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicConfig } from './auth.routes.js';

export function registerAdminRoutes(app, { services, repos }) {
  const admin = requireAdmin();

  app.get('/api/admin/overview', admin, async (ctx) => {
    ctx.ok(await services.platform.overview());
  });

  /* ---------------- PENIAGA ---------------- */
  app.get('/api/admin/tenants', admin, async (ctx) => {
    ctx.ok(await services.platform.listTenants());
  });

  app.post('/api/admin/tenants', admin, async (ctx) => {
    ctx.created(await services.platform.createTenant(ctx.user, ctx.body || {}));
  });

  app.patch('/api/admin/tenants/:id', admin, async (ctx) => {
    ctx.ok(await services.platform.updateTenant(ctx.user, ctx.params.id, ctx.body || {}));
  });

  app.get('/api/admin/tenants/:id/menu', admin, async (ctx) => {
    const tenant = await repos.tenants.findById(ctx.params.id);
    if (!tenant) throw notFound('Kedai tidak dijumpai.');
    const [kuih, recipes] = await Promise.all([
      repos.kuih.listByTenant(tenant.id, { includeArchived: true }),
      repos.recipes.listByTenant(tenant.id)
    ]);
    ctx.ok({ tenant, kuih, recipes });
  });

  /* ---------------- PENGGUNA ---------------- */
  app.get('/api/admin/users', admin, async (ctx) => {
    const users = await repos.users.listWithTenant();
    ctx.ok(users);
  });

  app.post('/api/admin/users', admin, async (ctx) => {
    const body = ctx.body || {};
    const role = requireEnum(body.role || 'user', ['admin', 'user'], 'Peranan');
    const user = await services.auth.createUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role,
      tenantId: body.tenantId || null,
      actor: ctx.user
    });
    ctx.created(user);
  });

  app.patch('/api/admin/users/:id', admin, async (ctx) => {
    const body = ctx.body || {};
    const id = ctx.params.id;
    const target = await repos.users.findById(id);
    if (!target) throw notFound('Pengguna tidak dijumpai.');
    if (id === ctx.user.id && (body.role !== undefined || body.status !== undefined)) {
      throw forbidden('Anda tidak boleh mengubah peranan atau status akaun sendiri.');
    }

    const fields = { updatedAt: stamp() };
    if (body.name !== undefined) fields.name = requireString(body.name, 'Nama', { max: 120 });
    if (body.email !== undefined) {
      const email = requireEmail(body.email);
      const existing = await repos.users.findByEmail(email);
      if (existing && existing.id !== id) throw new HttpError(409, 'E-mel ini sudah digunakan.');
      fields.email = email;
    }
    if (body.role !== undefined) {
      fields.role = requireEnum(body.role, ['admin', 'user'], 'Peranan');
      if (fields.role === 'admin') fields.tenantId = null;
    }
    if (body.tenantId !== undefined) fields.tenantId = body.tenantId || null;
    if (body.status !== undefined) fields.status = requireEnum(body.status, ['active', 'inactive'], 'Status');

    if (fields.role === 'user' || target.role === 'user') {
      const tenantId = fields.tenantId !== undefined ? fields.tenantId : target.tenantId;
      if (!tenantId && target.role === 'user') throw new HttpError(400, 'Pengguna peniaga mesti dikaitkan dengan kedai.');
    }

    const user = await repos.users.update(id, fields);
    if (fields.status === 'inactive') await repos.sessions.removeForUser(id);
    if (body.password) await services.auth.resetPassword(id, body.password, ctx.user);
    await repos.audit.log({
      actorUser: ctx.user, tenantId: user.tenantId, action: 'user.updated', entity: 'user', entityId: id,
      detail: { fields: Object.keys(fields).filter((k) => k !== 'updatedAt') }
    });
    ctx.ok(user);
  });

  app.delete('/api/admin/users/:id', admin, async (ctx) => {
    if (ctx.params.id === ctx.user.id) throw forbidden('Anda tidak boleh memadam akaun sendiri.');
    const target = await repos.users.findById(ctx.params.id);
    if (!target) throw notFound('Pengguna tidak dijumpai.');
    await repos.sessions.removeForUser(target.id);
    await repos.users.remove(target.id);
    await repos.audit.log({
      actorUser: ctx.user, tenantId: target.tenantId, action: 'user.deleted', entity: 'user', entityId: target.id,
      detail: { email: target.email }
    });
    ctx.ok({ ok: true });
  });

  /* ---------------- PESANAN SEMUA KEDAI ---------------- */
  app.get('/api/admin/orders', admin, async (ctx) => {
    const orders = await services.orders.list(null, {
      tenantId: ctx.query.tenantId || null,
      status: ctx.query.status && ctx.query.status !== 'ALL' ? ctx.query.status : null,
      q: ctx.query.q || '',
      from: ctx.query.from || null,
      to: ctx.query.to || null,
      limit: ctx.query.limit || 200,
      withTenant: true
    });
    ctx.ok({ orders, count: orders.length });
  });

  app.patch('/api/admin/orders/:id/status', admin, async (ctx) => {
    const body = ctx.body || {};
    const order = await repos.orders.findById(ctx.params.id);
    if (!order) throw notFound('Pesanan tidak dijumpai.');
    const updated = await services.orders.setStatus(order.id, order.tenantId, body.status, ctx.user);
    ctx.ok(updated);
  });

  /* ---------------- AUDIT & TETAPAN ---------------- */
  app.get('/api/admin/audit', admin, async (ctx) => {
    ctx.ok(await services.platform.listAudit({
      tenantId: ctx.query.tenantId || null,
      q: ctx.query.q || '',
      limit: ctx.query.limit || 120
    }));
  });

  app.get('/api/admin/settings', admin, async (ctx) => {
    ctx.ok(publicConfig(await services.platform.getSettings()));
  });

  app.patch('/api/admin/settings', admin, async (ctx) => {
    ctx.ok(publicConfig(await services.platform.updateSettings(ctx.user, ctx.body || {})));
  });
}

import { requireMerchant } from '../middleware/auth.js';

export function registerMerchantRoutes(app, { services }) {
  const merchant = requireMerchant();

  /* ---------------- PAPAN PEMUKA ---------------- */
  app.get('/api/dashboard', merchant, async (ctx) => {
    const data = await services.dashboard.overview(ctx.tenant.id, {
      range: ctx.query.range || 'today',
      from: ctx.query.from,
      to: ctx.query.to
    });
    ctx.ok(data);
  });

  /* ---------------- PESANAN ---------------- */
  app.get('/api/orders', merchant, async (ctx) => {
    const orders = await services.orders.list(ctx.tenant.id, {
      status: ctx.query.status && ctx.query.status !== 'ALL' ? ctx.query.status : null,
      q: ctx.query.q || '',
      from: ctx.query.from || null,
      to: ctx.query.to || null,
      limit: ctx.query.limit,
      offset: ctx.query.offset
    });
    ctx.ok({ orders, count: orders.length });
  });

  app.get('/api/orders/:id', merchant, async (ctx) => {
    ctx.ok(await services.orders.get(ctx.params.id, ctx.tenant.id));
  });

  app.post('/api/orders', merchant, async (ctx) => {
    const order = await services.orders.create(ctx.tenant.id, ctx.user, ctx.body || {});
    ctx.created(order);
  });

  app.patch('/api/orders/:id/status', merchant, async (ctx) => {
    const body = ctx.body || {};
    const order = await services.orders.setStatus(ctx.params.id, ctx.tenant.id, body.status, ctx.user);
    ctx.ok(order);
  });

  app.post('/api/orders/:id/advance', merchant, async (ctx) => {
    ctx.ok(await services.orders.advance(ctx.params.id, ctx.tenant.id, ctx.user));
  });

  app.get('/api/orders/:id/whatsapp', merchant, async (ctx) => {
    const order = await services.orders.get(ctx.params.id, ctx.tenant.id);
    ctx.ok(services.orders.receipt(order, ctx.tenant));
  });

  /* ---------------- MENU KUIH ---------------- */
  app.get('/api/kuih', merchant, async (ctx) => {
    ctx.ok(await services.catalog.listKuih(ctx.tenant.id, { includeArchived: ctx.query.all === '1' }));
  });

  app.post('/api/kuih', merchant, async (ctx) => {
    ctx.created(await services.catalog.createKuih(ctx.tenant.id, ctx.user, ctx.body || {}));
  });

  app.patch('/api/kuih/:id', merchant, async (ctx) => {
    ctx.ok(await services.catalog.updateKuih(ctx.tenant.id, ctx.user, ctx.params.id, ctx.body || {}));
  });

  app.delete('/api/kuih/:id', merchant, async (ctx) => {
    await services.catalog.archiveKuih(ctx.tenant.id, ctx.user, ctx.params.id);
    ctx.ok({ ok: true });
  });

  /* ---------------- BAHAN MENTAH ---------------- */
  app.get('/api/ingredients', merchant, async (ctx) => {
    ctx.ok(await services.catalog.listIngredients(ctx.tenant.id));
  });

  app.post('/api/ingredients', merchant, async (ctx) => {
    ctx.created(await services.catalog.createIngredient(ctx.tenant.id, ctx.user, ctx.body || {}));
  });

  app.patch('/api/ingredients/:id', merchant, async (ctx) => {
    ctx.ok(await services.catalog.updateIngredient(ctx.tenant.id, ctx.user, ctx.params.id, ctx.body || {}));
  });

  app.delete('/api/ingredients/:id', merchant, async (ctx) => {
    await services.catalog.deleteIngredient(ctx.tenant.id, ctx.user, ctx.params.id);
    ctx.ok({ ok: true });
  });

  /* ---------------- RESIPI ---------------- */
  app.get('/api/recipes', merchant, async (ctx) => {
    ctx.ok(await services.catalog.listRecipes(ctx.tenant.id));
  });

  app.post('/api/recipes', merchant, async (ctx) => {
    ctx.created(await services.catalog.createRecipe(ctx.tenant.id, ctx.user, ctx.body || {}));
  });

  app.patch('/api/recipes/:id', merchant, async (ctx) => {
    ctx.ok(await services.catalog.updateRecipe(ctx.tenant.id, ctx.user, ctx.params.id, ctx.body || {}));
  });

  app.delete('/api/recipes/:id', merchant, async (ctx) => {
    await services.catalog.deleteRecipe(ctx.tenant.id, ctx.user, ctx.params.id);
    ctx.ok({ ok: true });
  });

  /* ---------------- PROFIL KEDAI ---------------- */
  app.get('/api/tenant', merchant, async (ctx) => {
    ctx.ok(ctx.tenant);
  });

  app.patch('/api/tenant', merchant, async (ctx) => {
    ctx.ok(await services.catalog.updateTenant(ctx.tenant.id, ctx.user, ctx.body || {}));
  });

  /* ---------------- PEMBANTU DATA ---------------- */
  app.post('/api/assistant', merchant, async (ctx) => {
    const body = ctx.body || {};
    ctx.ok(await services.assistant.ask(ctx.tenant.id, body.question));
  });
}

import { HttpError, notFound, validation } from '../lib/errors.js';
import { publicConfig } from './auth.routes.js';
import { todayISO } from '../lib/time.js';
import { normalisePhoneMY } from '../lib/phone.js';

const hits = new Map();

function rateLimit(ip, { max = 8, windowMs = 10 * 60 * 1000, message = 'Terlalu banyak pesanan dihantar. Sila cuba sebentar lagi.' } = {}) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, message);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
}

export function registerPublicRoutes(app, { services, repos }) {
  app.get('/api/public/config', async (ctx) => {
    ctx.ok(publicConfig(await repos.settings.all()));
  });

  /**
   * Senarai kedai aktif untuk pemilih kedai pelanggan (tanpa log masuk).
   */
  app.get('/api/public/tenants', async (ctx) => {
    const tenants = await repos.tenants.list({ status: 'active' });
    const shops = [];

    for (const tenant of tenants) {
      const menu = await repos.kuih.listByTenant(tenant.id);
      shops.push({
        name: tenant.name,
        slug: tenant.slug,
        tagline: tenant.tagline,
        location: tenant.location,
        phone: tenant.phone,
        menuCount: menu.length,
        minPriceCents: menu.length ? Math.min(...menu.map((item) => item.priceCents)) : null,
        topMenu: menu.slice(0, 3).map((item) => ({ name: item.name, emoji: emojiFor(item.name) }))
      });
    }

    ctx.ok({ shops });
  });

  app.get('/api/public/tenants/:slug', async (ctx) => {
    const tenant = await repos.tenants.findBySlug(ctx.params.slug);
    if (!tenant || tenant.status !== 'active') throw notFound('Kedai tidak dijumpai atau tidak aktif.');
    const menu = await repos.kuih.listByTenant(tenant.id);
    const settings = await repos.settings.all();
    ctx.ok({
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        ownerName: tenant.ownerName,
        location: tenant.location,
        phone: tenant.phone,
        tagline: tenant.tagline
      },
      menu: menu.map((k) => ({
        id: k.id, name: k.name, description: k.description, unit: k.unit,
        priceCents: k.priceCents, emoji: emojiFor(k.name)
      })),
      pickupSlots: settings.pickupSlots,
      minDate: todayISO(),
      platformName: settings.platformName
    });
  });

  /**
   * Semakan status tempahan pelanggan tanpa log masuk.
   * Nombor resit + nombor telefon bertindak sebagai bukti pemilikan.
   */
  app.get('/api/public/tenants/:slug/orders/:code', async (ctx) => {
    rateLimit(ctx.ip, {
      max: 20,
      message: 'Terlalu banyak semakan. Sila cuba sebentar lagi.'
    });

    const tenant = await repos.tenants.findBySlug(ctx.params.slug);
    if (!tenant || tenant.status !== 'active') throw notFound('Kedai tidak dijumpai atau tidak aktif.');

    const phone = String(ctx.query.phone || '').trim();
    if ((phone.match(/\d/g) || []).length < 8) {
      throw validation('Masukkan nombor WhatsApp yang digunakan semasa tempahan.', { field: 'phone' });
    }

    const summary = await repos.orders.findByCode(tenant.id, String(ctx.params.code || '').toUpperCase());
    if (!summary) throw notFound('Tempahan tidak dijumpai. Semak nombor resit dan nombor telefon.');

    const order = await repos.orders.findById(summary.id, tenant.id);
    if (!order || normalisePhoneMY(order.phone) !== normalisePhoneMY(phone)) {
      throw notFound('Tempahan tidak dijumpai. Semak nombor resit dan nombor telefon.');
    }

    ctx.ok({
      code: order.code,
      status: order.status,
      pickupDate: order.pickupDate,
      pickupTime: order.pickupTime,
      totalCents: order.totalCents,
      note: order.note || '',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents
      })),
      tenant: {
        name: tenant.name,
        location: tenant.location,
        phone: tenant.phone
      }
    });
  });

  app.post('/api/public/orders', async (ctx) => {
    rateLimit(ctx.ip);
    const body = ctx.body || {};
    const tenant = await repos.tenants.findBySlug(body.tenantSlug || '');
    if (!tenant || tenant.status !== 'active') throw notFound('Kedai tidak dijumpai.');

    const order = await services.orders.create(tenant.id, null, {
      customerName: body.customerName,
      phone: body.phone,
      pickupDate: body.pickupDate,
      pickupTime: body.pickupTime,
      note: body.note,
      items: body.items
    }, { channel: 'web' });

    ctx.created({
      code: order.code,
      pickupDate: order.pickupDate,
      pickupTime: order.pickupTime,
      totalCents: order.totalCents,
      status: order.status,
      tenantName: tenant.name,
      location: tenant.location,
      items: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents
      }))
    });
  });

  app.get('/api/health', async (ctx) => {
    const row = await repos.settings.all();
    ctx.ok({ ok: true, platform: row.platformName, time: new Date().toISOString() });
  });
}

function emojiFor(name) {
  const n = name.toLowerCase();
  if (n.includes('karipap')) return '🥟';
  if (n.includes('seri muka') || n.includes('puding')) return '🍮';
  if (n.includes('lapis')) return '🌈';
  if (n.includes('pulut')) return '🍃';
  if (n.includes('keria')) return '🍩';
  if (n.includes('popia')) return '🌯';
  if (n.includes('onde') || n.includes('klepon')) return '🟢';
  if (n.includes('kek') || n.includes('cake')) return '🍰';
  return '🍡';
}

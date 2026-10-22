import { unauthorized, forbidden } from '../lib/errors.js';

/**
 * Lampirkan ctx.user & ctx.tenant berdasarkan cookie sesi.
 * Tidak menghalang permintaan; gunakan requireAuth selepas ini.
 */
export function attachUser(services) {
  return async (ctx) => {
    const token = ctx.cookies[services.sessionCookieName];
    const session = await services.auth.resolveSession(token);
    ctx.sessionToken = token;
    ctx.user = session?.user || null;
    ctx.tenant = session?.tenant || null;
  };
}

export function requireAuth() {
  return async (ctx, next) => {
    if (!ctx.user) throw unauthorized();
    await next();
  };
}

export function requireAdmin() {
  return async (ctx, next) => {
    if (!ctx.user) throw unauthorized();
    if (ctx.user.role !== 'admin') throw forbidden('Hanya pentadbir boleh mengakses bahagian ini.');
    await next();
  };
}

export function requireMerchant() {
  return async (ctx, next) => {
    if (!ctx.user) throw unauthorized();
    if (ctx.user.role !== 'user') throw forbidden('Bahagian ini untuk akaun peniaga.');
    if (!ctx.tenant) throw forbidden('Akaun anda belum dikaitkan dengan kedai.');
    if (ctx.tenant.status !== 'active') throw forbidden('Kedai anda sedang tidak aktif. Hubungi pentadbir.');
    await next();
  };
}

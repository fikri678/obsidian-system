import { config } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export function registerAuthRoutes(app, { services, repos }) {
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * 24 * 60 * 60
  };

  app.post('/api/auth/login', async (ctx) => {
    const body = ctx.body || {};
    const result = await services.auth.login({
      email: body.email,
      password: body.password,
      ip: ctx.ip,
      userAgent: ctx.ua
    });

    ctx.setCookie(config.sessionCookie, result.token, cookieOpts);
    const settings = await repos.settings.all();
    ctx.ok({
      user: result.user,
      tenant: result.tenant,
      expiresAt: result.expiresAt,
      config: publicConfig(settings)
    });
  });

  app.post('/api/auth/logout', async (ctx) => {
    if (ctx.sessionToken) await services.auth.logout(ctx.sessionToken);
    ctx.clearCookie(config.sessionCookie, { path: '/' });
    ctx.ok({ ok: true });
  });

  app.get('/api/auth/me', async (ctx) => {
    if (!ctx.user) throw unauthorized();
    const settings = await repos.settings.all();
    ctx.ok({
      user: ctx.user,
      tenant: ctx.tenant,
      config: publicConfig(settings)
    });
  });

  app.post('/api/auth/password', requireAuth(), async (ctx) => {
    const body = ctx.body || {};
    await services.auth.changePassword(ctx.user.id, body.currentPassword, body.newPassword);
    ctx.clearCookie(config.sessionCookie, { path: '/' });
    ctx.ok({ ok: true, message: 'Kata laluan dikemas kini. Sila log masuk semula.' });
  });
}

export function publicConfig(settings) {
  return {
    platformName: settings.platformName,
    platformTagline: settings.platformTagline,
    pickupSlots: settings.pickupSlots,
    lowMarginThresholdPct: settings.lowMarginThresholdPct,
    currency: settings.currency || 'RM'
  };
}

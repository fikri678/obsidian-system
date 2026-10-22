import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { HttpError, forbidden, unauthorized } from '../lib/errors.js';
import { requireEmail, requirePassword, requireString } from '../lib/validate.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { stamp } from '../lib/time.js';

export function authService({ repos }) {
  const attempts = new Map();

  function checkRateLimit(key) {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now - entry.firstAt > config.loginWindowMs) {
      attempts.set(key, { count: 0, firstAt: now });
      return;
    }
    if (entry.count >= config.loginMaxAttempts) {
      const mins = Math.ceil((config.loginWindowMs - (now - entry.firstAt)) / 60000);
      throw new HttpError(429, `Terlalu banyak cubaan log masuk. Sila cuba lagi dalam ${mins} minit.`);
    }
  }

  function noteFailure(key) {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now - entry.firstAt > config.loginWindowMs) {
      attempts.set(key, { count: 1, firstAt: now });
    } else {
      entry.count += 1;
    }
  }

  const service = {
    async login({ email, password, ip = '', userAgent = '' }) {
      const cleanEmail = requireEmail(email);
      const cleanPassword = requirePassword(password, { min: 1 });
      const key = `${ip}|${cleanEmail}`;
      checkRateLimit(key);

      const record = await repos.users.findByEmail(cleanEmail);
      const ok = record ? await verifyPassword(cleanPassword, record.passwordHash) : false;

      if (!ok) {
        noteFailure(key);
        await repos.audit.log({
          action: 'auth.login_failed',
          entity: 'user',
          detail: { email: cleanEmail, ip }
        });
        throw unauthorized('E-mel atau kata laluan tidak betul.');
      }
      if (record.status !== 'active') throw forbidden('Akaun anda telah dinyahaktifkan. Hubungi pentadbir.');

      attempts.delete(key);

      const { token, id } = repos.sessions.newToken();
      const expiresAt = await repos.sessions.create({
        id, userId: record.id, ttlDays: config.sessionTtlDays, userAgent, ip
      });
      await repos.users.update(record.id, { lastLoginAt: stamp() });
      await repos.audit.log({
        actorUser: record,
        tenantId: record.tenantId,
        action: 'auth.login',
        entity: 'user',
        entityId: record.id
      });

      const user = await repos.users.findById(record.id);
      const tenant = user.tenantId ? await repos.tenants.findById(user.tenantId) : null;
      return { token, expiresAt, user, tenant };
    },

    async logout(token) {
      await repos.sessions.removeByToken(token);
    },

    async resolveSession(token) {
      if (!token) return null;
      const session = await repos.sessions.findUserByToken(token);
      if (!session) return null;
      const tenant = session.user.tenantId ? await repos.tenants.findById(session.user.tenantId) : null;
      return { ...session, tenant };
    },

    async changePassword(userId, currentPassword, newPassword) {
      const user = await repos.users.findByEmail(
        (await repos.users.findById(userId))?.email || ''
      );
      if (!user) throw unauthorized();
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) throw new HttpError(400, 'Kata laluan semasa tidak betul.');
      const next = requirePassword(newPassword, { min: 6 });
      if (next === currentPassword) throw new HttpError(400, 'Kata laluan baru mesti berbeza daripada yang lama.');
      await repos.users.update(userId, { passwordHash: await hashPassword(next), updatedAt: stamp() });
      await repos.sessions.removeForUser(userId);
      await repos.audit.log({ actorUser: user, tenantId: user.tenantId, action: 'auth.password_changed', entity: 'user', entityId: userId });
      return true;
    },

    async createUser({ name, email, password, role = 'user', tenantId = null, actor = null }) {
      const cleanName = requireString(name, 'Nama', { max: 120 });
      const cleanEmail = requireEmail(email);
      const cleanPassword = requirePassword(password, { min: 6 });
      if (!['admin', 'user'].includes(role)) throw new HttpError(400, 'Peranan tidak sah.');
      if (role === 'user' && !tenantId) throw new HttpError(400, 'Pengguna peniaga memerlukan tenant.');

      const existing = await repos.users.findByEmail(cleanEmail);
      if (existing) throw new HttpError(409, 'E-mel ini sudah didaftarkan.');

      const now = stamp();
      const user = await repos.users.create({
        id: `usr_${crypto.randomUUID()}`,
        tenantId: role === 'admin' ? null : tenantId,
        name: cleanName,
        email: cleanEmail,
        passwordHash: await hashPassword(cleanPassword),
        role,
        status: 'active',
        createdAt: now,
        updatedAt: now
      });
      await repos.audit.log({
        actorUser: actor, tenantId: user.tenantId, action: 'user.created', entity: 'user',
        entityId: user.id, detail: { email: user.email, role: user.role }
      });
      return user;
    },

    async resetPassword(userId, newPassword, actor = null) {
      const target = await repos.users.findById(userId);
      if (!target) throw new HttpError(404, 'Pengguna tidak dijumpai.');
      const password = requirePassword(newPassword, { min: 6 });
      await repos.users.update(userId, { passwordHash: await hashPassword(password), updatedAt: stamp() });
      await repos.sessions.removeForUser(userId);
      await repos.audit.log({
        actorUser: actor, tenantId: target.tenantId, action: 'user.password_reset', entity: 'user', entityId: userId
      });
      return true;
    },

    requireAdmin(ctx) {
      if (!ctx.user) throw unauthorized();
      if (ctx.user.role !== 'admin') throw forbidden('Hanya pentadbir boleh mengakses bahagian ini.');
    },

    requireTenant(ctx) {
      if (!ctx.user) throw unauthorized();
      if (ctx.user.role !== 'user') throw forbidden('Bahagian ini untuk akaun peniaga.');
      if (!ctx.tenant) throw forbidden('Akaun anda belum dikaitkan dengan mana-mana kedai.');
    }
  };

  return service;
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './errors.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const MAX_BODY = 1024 * 1024; // 1 MB

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  bits.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) bits.push('Secure');
  return bits.join('; ');
}

function compile(pattern) {
  const keys = [];
  const normalized = pattern.replace(/\/+$/, '') || '/';
  if (normalized === '/') return { regex: /^\/$/, keys };
  const regexStr = normalized
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${regexStr}/?$`), keys };
}

class Ctx {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    this.path = decodeURIComponent(url.pathname);
    this.method = req.method || 'GET';
    this.query = Object.fromEntries(url.searchParams.entries());
    this.params = {};
    this.body = null;
    this.user = null;
    this.tenant = null;
    this.cookies = parseCookies(req.headers.cookie);
    this._cookies = [];
    this.statusCode = 200;
  }

  get ip() {
    return this.req.socket?.remoteAddress || '';
  }

  get ua() {
    return String(this.req.headers['user-agent'] || '').slice(0, 250);
  }

  header(name, value) {
    if (value !== undefined && value !== null) this.res.setHeader(name, value);
    return this;
  }

  setCookie(name, value, opts = {}) {
    this._cookies.push(serializeCookie(name, value, opts));
    return this;
  }

  clearCookie(name, opts = {}) {
    this._cookies.push(serializeCookie(name, '', { ...opts, maxAge: 0 }));
    return this;
  }

  _flushCookies() {
    if (!this._cookies.length) return;
    const existing = this.res.getHeader('Set-Cookie');
    const list = Array.isArray(existing) ? existing.slice() : existing ? [existing] : [];
    this.res.setHeader('Set-Cookie', list.concat(this._cookies));
    this._cookies = [];
  }

  json(status, payload) {
    const body = JSON.stringify(payload);
    this.statusCode = status;
    this._flushCookies();
    this.res.statusCode = status;
    this.res.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.res.setHeader('Cache-Control', 'no-store');
    this.res.end(body);
  }

  ok(data = null) { this.json(200, { data }); }
  created(data = null) { this.json(201, { data }); }
  noContent() { this.json(204, {}); }

  text(status, body, type = 'text/plain; charset=utf-8') {
    this.statusCode = status;
    this._flushCookies();
    this.res.statusCode = status;
    this.res.setHeader('Content-Type', type);
    this.res.end(body);
  }

  redirect(location, status = 302) {
    this._flushCookies();
    this.res.statusCode = status;
    this.res.setHeader('Location', location);
    this.res.end();
  }

  async readBody() {
    if (this.method === 'GET' || this.method === 'HEAD') return null;
    const type = String(this.req.headers['content-type'] || '');
    const chunks = [];
    let size = 0;
    for await (const chunk of this.req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Permintaan terlalu besar.');
      chunks.push(chunk);
    }
    if (!chunks.length) return null;
    const raw = Buffer.concat(chunks).toString('utf8');
    if (type.includes('application/json')) {
      try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Format JSON tidak sah.'); }
    }
    return raw;
  }
}

export function createApp({ publicDir, onRequest }) {
  const routes = [];
  const middlewares = [];

  const add = (method) => (pattern, ...handlers) => {
    const { regex, keys } = compile(pattern);
    routes.push({ method, regex, keys, handlers });
  };

  const app = {
    use(fn) { middlewares.push(fn); return app; },
    get: add('GET'),
    post: add('POST'),
    patch: add('PATCH'),
    put: add('PUT'),
    delete: add('DELETE'),

    async listen(port, host) {
      const server = http.createServer((req, res) => handle(app, req, res));
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return server;
    }
  };

  async function handle(app, req, res) {
    const started = Date.now();
    const ctx = new Ctx(req, res);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');

    try {
      // Pertahanan CSRF ringan: tolak permintaan mutasi dari asal berbeza.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(ctx.method)) {
        const site = req.headers['sec-fetch-site'];
        if (site === 'cross-site') throw new HttpError(403, 'Permintaan rentas laman disekat.');
        const origin = req.headers.origin;
        if (origin) {
          let originHost = '';
          try { originHost = new URL(origin).host; } catch { originHost = ''; }
          if (originHost && req.headers.host && originHost !== req.headers.host) {
            throw new HttpError(403, 'Asal permintaan tidak sah.');
          }
        }
      }

      if (ctx.path.startsWith('/api/')) {
        ctx.body = await ctx.readBody();
        for (const mw of middlewares) await mw(ctx);
      }

      let matched = null;
      let methodMismatch = false;
      for (const route of routes) {
        const m = ctx.path.match(route.regex);
        if (!m) continue;
        if (route.method !== ctx.method) { methodMismatch = true; continue; }
        matched = { route, m };
        break;
      }

      if (!matched) {
        if (ctx.path.startsWith('/api/')) {
          throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Kaedah tidak dibenarkan.' : 'Endpoint tidak dijumpai.');
        }
        return serveStatic(ctx, publicDir);
      }

      ctx.params = {};
      matched.route.keys.forEach((key, i) => { ctx.params[key] = decodeURIComponent(matched.m[i + 1] || ''); });

      let idx = 0;
      const next = async () => {
        const fn = matched.route.handlers[idx++];
        if (!fn) return;
        await fn(ctx, next);
      };
      await next();

      if (!res.writableEnded) ctx.json(204, {});
    } catch (err) {
      if (res.writableEnded) return;
      const isHttp = err instanceof HttpError;
      const status = isHttp ? err.status : 500;
      if (!isHttp) console.error('[error]', err);
      if (status >= 500) {
        ctx.json(500, { error: { message: 'Ralat dalaman pelayan. Sila cuba lagi.', code: 'INTERNAL' } });
      } else {
        ctx.json(status, {
          error: { message: err.message, code: err.code || 'ERROR', details: err.details || undefined }
        });
      }
    } finally {
      if (onRequest) {
        onRequest({
          method: ctx.method,
          path: ctx.path,
          status: res.statusCode,
          ms: Date.now() - started,
          user: ctx.user ? `${ctx.user.email} [${ctx.user.role}]` : 'anon'
        });
      }
    }
  }

  function serveStatic(ctx, root) {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      throw new HttpError(405, 'Kaedah tidak dibenarkan.');
    }
    const urlPath = ctx.path === '/' ? '/index.html' : ctx.path === '/app' ? '/app.html' : ctx.path;
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const filePath = path.normalize(path.join(root, decoded));
    if (!filePath.startsWith(path.normalize(root))) {
      throw new HttpError(403, 'Akses dinafikan.');
    }
    let stat = null;
    try { stat = fs.statSync(filePath); } catch { stat = null; }

    if (!stat || !stat.isFile()) {
      // Fallback SPA untuk laluan dalaman
      const fallback = path.join(root, 'app.html');
      if (!decoded.includes('.') && fs.existsSync(fallback)) {
        return sendFile(ctx, fallback, true);
      }
      return sendFile(ctx, path.join(root, '404.html'), false, 404);
    }
    return sendFile(ctx, filePath, false);
  }

  function sendFile(ctx, filePath, noCache, status = 200) {
    if (!fs.existsSync(filePath)) {
      return ctx.text(404, 'Tidak dijumpai', 'text/plain; charset=utf-8');
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    const dynamic = ['.html', '.js', '.css'].includes(ext);
    ctx.res.statusCode = status;
    ctx.res.setHeader('Content-Type', type);
    ctx.res.setHeader('Cache-Control', dynamic ? 'no-cache, must-revalidate' : 'public, max-age=3600');
    if (ctx.method === 'HEAD') return ctx.res.end();
    ctx.res.end(data);
  }

  return app;
}

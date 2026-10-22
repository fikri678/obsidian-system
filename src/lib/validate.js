import { validation } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min) throw validation(`${field} diperlukan (minimum ${min} aksara).`, { field });
  if (s.length > max) throw validation(`${field} terlalu panjang (maksimum ${max} aksara).`, { field });
  return s;
}

export function optionalString(value, { max = 500 } = {}) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function requireEmail(value) {
  const s = requireString(value, 'E-mel', { max: 160 }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw validation('Format e-mel tidak sah.', { field: 'email' });
  return s;
}

export function requirePassword(value, { min = 6 } = {}) {
  const s = typeof value === 'string' ? value : '';
  if (s.length < min) throw validation(`Kata laluan mesti sekurang-kurangnya ${min} aksara.`, { field: 'password' });
  if (s.length > 200) throw validation('Kata laluan terlalu panjang.', { field: 'password' });
  return s;
}

export function requireEnum(value, allowed, field) {
  const s = String(value || '');
  if (!allowed.includes(s)) throw validation(`${field} tidak sah.`, { field, allowed });
  return s;
}

export function requireInt(value, field, { min = 0, max = 10_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw validation(`${field} mesti nombor bulat antara ${min} dan ${max}.`, { field });
  }
  return n;
}

export function requireNumber(value, field, { min = 0, max = 10_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw validation(`${field} mesti nombor antara ${min} dan ${max}.`, { field });
  }
  return n;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function safeJson(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

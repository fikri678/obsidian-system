/** Semua wang disimpan sebagai integer sen (cents) supaya tepat & mudah dibawa ke SQL lain. */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  const n = Number(cents || 0);
  return Math.round(n) / 100;
}

export function formatRM(cents) {
  const n = fromCents(cents);
  return `RM ${n.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((Number(part) / Number(whole)) * 1000) / 10;
}

export function clampInt(value, { min = 0, max = 1_000_000, fallback = 0 } = {}) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

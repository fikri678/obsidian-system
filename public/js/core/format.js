export const money = (cents) => {
  const n = Number(cents || 0) / 100;
  return `RM ${n.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const moneyShort = (cents) => {
  const n = Number(cents || 0) / 100;
  if (Math.abs(n) >= 1000) return `RM ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `RM ${n.toFixed(0)}`;
};

export const num = (value) => Number(value || 0).toLocaleString('ms-MY');

export const pct = (value, digits = 0) => `${Number(value || 0).toFixed(digits)}%`;

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis'];
const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

export function parseISO(dateISO) {
  if (!dateISO) return null;
  const [y, m, d] = String(dateISO).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function dateLabel(dateISO, { withDay = false, short = false } = {}) {
  const dt = parseISO(dateISO);
  if (!dt) return dateISO || '';
  if (short) return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
  const base = `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  return withDay ? `${DAYS[dt.getDay()]}, ${base}` : base;
}

export function timeLabel(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return value || '';
  const [h, m] = value.split(':').map(Number);
  const suffix = h < 12 ? 'PG' : 'PTG';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function stampLabel(stamp) {
  if (!stamp) return '';
  const [date, time = ''] = String(stamp).split(' ');
  return `${dateLabel(date)} · ${time.slice(0, 5)}`;
}

export function relativeDay(dateISO) {
  if (!dateISO) return '';
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dt = parseISO(dateISO);
  if (!dt) return '';
  const diff = Math.round((dt - t) / 86400000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Esok';
  if (diff === -1) return 'Semalam';
  if (diff > 1 && diff < 7) return `${diff} hari lagi`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} hari lalu`;
  return dateLabel(dateISO, { short: true });
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(dateISO, days) {
  const dt = parseISO(dateISO) || new Date();
  dt.setDate(dt.getDate() + Number(days || 0));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function initials(name) {
  return String(name || '?')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function firstName(name) {
  return String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';
}

export function statusLabel(status) {
  return {
    baru: 'Baru Diterima',
    disediakan: 'Sedang Disediakan',
    sedia: 'Sedia Diambil',
    selesai: 'Selesai',
    batal: 'Dibatalkan'
  }[status] || status || '';
}

export function channelLabel(channel) {
  return {
    walkin: 'Walk-in',
    whatsapp: 'WhatsApp',
    telefon: 'Telefon',
    web: 'Online',
    suara: 'Suara'
  }[channel] || channel || '—';
}

export function marginPct(priceCents, costCents) {
  if (!priceCents) return 0;
  return Math.round(((priceCents - costCents) / priceCents) * 1000) / 10;
}

export function phoneClean(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function waLink(phone, text) {
  const clean = phoneClean(phone).replace(/^\+?60/, '60').replace(/^0/, '60');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text || '')}`;
}

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV(filename, header, rows) {
  const lines = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function emojiFor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('karipap')) return '🥟';
  if (n.includes('seri muka')) return '🍮';
  if (n.includes('lapis')) return '🌈';
  if (n.includes('pulut')) return '🍃';
  if (n.includes('keria')) return '🍩';
  if (n.includes('popia')) return '🌯';
  if (n.includes('onde') || n.includes('klepon')) return '🟢';
  if (n.includes('kek') || n.includes('cake')) return '🍰';
  if (n.includes('talam')) return '🍥';
  return '🍡';
}

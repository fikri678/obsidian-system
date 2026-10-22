const pad = (n) => String(n).padStart(2, '0');

/** Cap waktu setempat "YYYY-MM-DD HH:MM:SS" (boleh diisih secara leksikografi). */
export function stamp(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

/** Tarikh setempat "YYYY-MM-DD". */
export function isoDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function addDaysISO(dateISO, days) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + Number(days || 0));
  return isoDate(dt);
}

export function daysAgoISO(days) {
  return addDaysISO(todayISO(), -Number(days || 0));
}

/** Senarai tarikh (ISO) dari mula hingga akhir, inklusif. */
export function dateRange(startISO, endISO) {
  const out = [];
  let cur = startISO;
  let guard = 0;
  while (cur <= endISO && guard < 800) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
    guard += 1;
  }
  return out;
}

export function isDateISO(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeHHMM(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "14:30" -> "2:30 PTG" */
export function labelTime(value) {
  if (!isTimeHHMM(value)) return value || '';
  const [h, m] = value.split(':').map(Number);
  const suffix = h < 12 ? 'PG' : 'PTG';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis'];
const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

export function labelDate(dateISO, { withDay = false } = {}) {
  if (!isDateISO(dateISO)) return dateISO || '';
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const base = `${d} ${MONTHS[m - 1]} ${y}`;
  return withDay ? `${DAYS[dt.getDay()]}, ${base}` : base;
}

export function daysBetween(aISO, bISO) {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

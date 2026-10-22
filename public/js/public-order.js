import { get, post, ApiError } from './core/api.js';
import { money, num, dateLabel, timeLabel, todayISO, addDays, marginPct, emojiFor } from './core/format.js';
import { esc, toast, openModal, statusBadge } from './core/ui.js';
import { icon, brandMark } from './core/icons.js';

const root = document.getElementById('publicApp');
const slug = new URLSearchParams(location.search).get('t') || '';

let shop = null;
const qty = new Map();
let slots = [];

function shell(inner) {
  return `<div class="public-hero">
    <div class="public-hero-inner">
      <div class="between wrap">
        <a class="public-brand" href="/">
          <div class="brand-mark">${brandMark}</div>
          <span>NIV<span style="color:#95D5B2">ORA</span></span>
        </a>
        <span class="chip" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);color:#e7e5e4">
          ${icon('shield')} Tempahan selamat
        </span>
      </div>
      ${inner.hero}
    </div>
  </div>
  <div class="public-body">${inner.body}</div>
  <div class="public-foot">Dikuasakan oleh NIVORA · Sistem Pesanan & Untung Kuih</div>`;
}

function errorPage(title, text) {
  root.innerHTML = shell({
    hero: `<h1 class="public-title">${esc(title)}</h1><p class="public-tagline">${esc(text)}</p>`,
    body: `<div class="card card-pad" style="max-width:520px;margin:0 auto;text-align:center">
      <div class="empty-ico" style="margin:0 auto 12px">${icon('store')}</div>
      <div class="empty-title">Pautan tidak sah</div>
      <p class="empty-text" style="margin:8px auto 16px">${esc(text)}</p>
      <a class="btn btn-primary" href="/">Kembali ke halaman utama</a>
    </div>`
  });
}

function shopCardMarkup(item) {
  const top = item.topMenu?.[0];
  return `<a class="shop-card" href="/order.html?t=${encodeURIComponent(item.slug)}">
    <div class="shop-head">
      <div class="shop-avatar">${top?.emoji || '🍡'}</div>
      <div class="shop-id">
        <div class="shop-name">${esc(item.name)}</div>
        ${item.tagline ? `<div class="shop-tag">${esc(item.tagline)}</div>` : ''}
      </div>
    </div>
    <div class="shop-meta">
      ${item.location ? `<span>${icon('pin')} ${esc(item.location)}</span>` : ''}
      <span>${icon('clock')} ${item.menuCount} jenis kuih</span>
      ${item.minPriceCents != null ? `<span>${icon('cash')} dari ${money(item.minPriceCents)}</span>` : ''}
    </div>
    ${item.topMenu?.length
      ? `<div class="shop-items">${item.topMenu.map((k) => `<span class="chip chip-sm">${k.emoji} ${esc(k.name)}</span>`).join('')}</div>`
      : ''}
    <div class="shop-foot">
      <span class="badge badge-baru">Buka tempahan</span>
      <span class="shop-cta">Tempah di sini ${icon('arrowRight')}</span>
    </div>
  </a>`;
}

async function renderDirectory() {
  document.title = 'Pilih Kedai Kuih · NIVORA';

  let shops = [];
  try {
    const data = await get('/api/public/tenants');
    shops = data.shops || [];
  } catch (err) {
    errorPage('Kedai tidak dapat dimuatkan', err instanceof ApiError ? err.message : 'Sila cuba sebentar lagi.');
    return;
  }

  root.innerHTML = shell({
    hero: `
      <div class="public-title">Pilih kedai kuih anda</div>
      <p class="public-tagline">Tempah terus daripada peniaga tempatan. Tiada akaun diperlukan — resit dihantar ke WhatsApp anda.</p>
      <div class="public-meta">
        <span class="chip">${icon('store')} ${shops.length} kedai dibuka</span>
        <span class="chip">${icon('receipt')} Resit WhatsApp</span>
        <span class="chip">${icon('user')} Tanpa akaun</span>
      </div>`,
    body: shops.length
      ? `<div class="shop-grid">${shops.map(shopCardMarkup).join('')}</div>`
      : `<div class="card card-pad" style="max-width:460px;margin:0 auto;text-align:center">
           <div class="empty-ico" style="margin:0 auto 12px">${icon('store')}</div>
           <div class="empty-title">Belum ada kedai dibuka</div>
           <p class="empty-text" style="margin:8px auto 0">Sila cuba sebentar lagi.</p>
         </div>`
  });
}

async function openShopSwitcher() {
  const modal = openModal({
    title: 'Pilih kedai',
    subtitle: 'Tukar kedai untuk membuat tempahan di tempat lain.',
    body: '<div class="shop-list" id="shopList"><div class="tiny muted">Memuatkan senarai kedai…</div></div>',
    footer: '<a class="btn btn-ghost" href="/order.html">Lihat semua kedai</a>'
  });

  const list = modal.root.querySelector('#shopList');

  try {
    const data = await get('/api/public/tenants');
    const shops = data.shops || [];
    if (!shops.length) {
      list.innerHTML = '<div class="tiny muted">Tiada kedai aktif buat masa ini.</div>';
      return;
    }

    list.innerHTML = shops.map((item) => {
      const current = item.slug === slug;
      return `<a class="shop-row ${current ? 'is-current' : ''}" href="/order.html?t=${encodeURIComponent(item.slug)}">
        <div class="shop-avatar sm">${item.topMenu?.[0]?.emoji || '🍡'}</div>
        <div class="shop-id" style="flex:1;min-width:0">
          <div class="shop-name">${esc(item.name)}</div>
          <div class="shop-tag">${esc(item.location || `${item.menuCount} jenis kuih`)}</div>
        </div>
        ${current ? '<span class="badge badge-baru">Semasa</span>' : icon('chevronRight')}
      </a>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div class="callout callout-red">${esc(err.message || 'Gagal memuatkan senarai kedai.')}</div>`;
  }
}

async function boot() {
  if (!slug) {
    await renderDirectory();
    return;
  }

  try {
    shop = await get(`/api/public/tenants/${encodeURIComponent(slug)}`);
  } catch (err) {
    errorPage('Kedai tidak dijumpai', err instanceof ApiError ? err.message : 'Sila semak pautan anda.');
    return;
  }

  document.title = `${shop.tenant.name} · Tempahan Kuih | NIVORA`;

  slots = shop.pickupSlots?.length ? shop.pickupSlots : ['08:00', '10:30', '14:30', '16:30'];
  shop.menu.forEach((item) => qty.set(item.id, 0));

  root.innerHTML = shell({
    hero: `
      <div class="public-title">${esc(shop.tenant.name)}</div>
      <p class="public-tagline">${esc(shop.tenant.tagline || 'Tempah kuih segar untuk pengambilan sendiri.')}</p>
      <div class="public-meta">
        ${shop.tenant.location ? `<span class="chip">${icon('pin')} ${esc(shop.tenant.location)}</span>` : ''}
        ${shop.tenant.phone ? `<span class="chip">${icon('phone')} ${esc(shop.tenant.phone)}</span>` : ''}
        <span class="chip">${icon('clock')} ${shop.menu.length} jenis kuih</span>
        <span class="chip">${icon('user')} Tanpa akaun</span>
      </div>
      <div class="public-actions">
        <a class="btn btn-primary" href="#orderPanel">${icon('store')} Tempah Kuih</a>
        <button type="button" class="btn" id="checkOrderBtn"
          style="background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.24);color:#fff">
          ${icon('receipt')} Semak Tempahan
        </button>
        <button type="button" class="btn" id="switchShopBtn"
          style="background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.24);color:#fff">
          ${icon('refresh')} Tukar Kedai
        </button>
      </div>`,
    body: `
      <div class="public-grid">
        <form class="card" id="orderForm" novalidate data-panel="order">
          <div class="card-head">
            <div><div class="card-title">Borang tempahan</div><div class="card-sub">Isi butiran dan pilih kuih anda</div></div>
            <span class="badge badge-amber">Resit WhatsApp automatik</span>
          </div>
          <div class="card-body stack" style="gap:16px">
            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label class="label" for="pName">Nama anda <span class="req">*</span></label>
                <input class="input" id="pName" placeholder="Contoh: Puan Hanim" autocomplete="name" required>
              </div>
              <div class="field">
                <label class="label" for="custPhone">Nombor WhatsApp Pelanggan <span class="req">*</span></label>
                <input class="input" id="custPhone" name="custPhone" placeholder="012-3456789" inputmode="tel" autocomplete="tel" required>
                <span class="hint">Wajib — resit digital akan dihantar ke nombor ini.</span>
              </div>
            </div>
            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label class="label" for="pDate">Tarikh pengambilan <span class="req">*</span></label>
                <input class="input" id="pDate" type="date" value="${todayISO()}" min="${todayISO()}" max="${addDays(todayISO(), 60)}">
              </div>
              <div class="field">
                <label class="label" for="pTime">Waktu pengambilan <span class="req">*</span></label>
                <select class="select" id="pTime">
                  ${slots.map((s) => `<option value="${s}">${timeLabel(s)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div>
              <div class="between" style="margin-bottom:8px">
                <span class="label" style="margin:0">Pilih kuih & kuantiti</span>
                <span class="tiny muted">Tekan + / −</span>
              </div>
              ${shop.menu.length ? `<div class="menu-grid" id="menuGrid">
                ${shop.menu.map((k) => `
                  <div class="menu-card" data-card="${esc(k.id)}">
                    <div class="menu-emoji">${emojiFor(k.name)}</div>
                    <div class="menu-info">
                      <div class="menu-name">${esc(k.name)}</div>
                      <div class="menu-price">${money(k.priceCents)} / ${esc(k.unit || 'biji')}</div>
                    </div>
                    <div class="stepper">
                      <button type="button" data-step="-1" data-id="${esc(k.id)}" aria-label="Kurang">−</button>
                      <input class="qty-input" type="number" min="0" max="2000" value="0" data-qty="${esc(k.id)}" aria-label="Kuantiti ${esc(k.name)}">
                      <button type="button" data-step="1" data-id="${esc(k.id)}" aria-label="Tambah">+</button>
                    </div>
                  </div>`).join('')}
              </div>` : `<div class="callout callout-amber">Kedai ini belum membuka menu tempahan. Sila hubungi peniaga.</div>`}
            </div>

            <div class="field">
              <label class="label" for="pNote">Nota untuk peniaga (pilihan)</label>
              <textarea class="textarea" id="pNote" placeholder="Contoh: Kurang manis, bungkus berasingan untuk 2 kotak."></textarea>
            </div>

            <div class="callout callout-blue" style="display:flex;gap:8px;align-items:flex-start">
              ${icon('info')}
              <span>Tempahan disahkan melalui papan pemuka NIVORA. Resit dihantar ke WhatsApp anda. Bayaran dibuat semasa pengambilan.</span>
            </div>
          </div>
        </form>

        <aside class="card summary-card">
          <div class="card-head">
            <div><div class="card-title">Ringkasan</div><div class="card-sub" id="sumDate">${dateLabel(todayISO(), { withDay: true })}</div></div>
            <span class="badge badge-blue" id="sumTime">${timeLabel(slots[0])}</span>
          </div>
          <div class="card-body">
            <div id="sumItems"><div class="tiny muted center" style="padding:18px 0">Belum ada kuih dipilih.</div></div>
            <div class="summary-row"><span>Jumlah unit</span><span id="sumPieces">0</span></div>
            <div class="summary-row total"><span>Jumlah bayaran</span><span id="sumTotal">RM 0.00</span></div>
            <button class="btn btn-primary btn-lg btn-block mt-16" id="submitBtn" ${shop.menu.length ? '' : 'disabled'}>
              ${icon('send')} Sahkan &amp; Hantar Tempahan
            </button>
            <p class="tiny muted center mt-8">Tiada bayaran dalam talian. Bayar semasa ambil.</p>
          </div>
        </aside>
      </div>`
  });

  bind();
  root.querySelector('#checkOrderBtn')?.addEventListener('click', () => openStatusLookup());
  root.querySelector('#switchShopBtn')?.addEventListener('click', () => openShopSwitcher());
}

function bind() {
  const nameEl = root.querySelector('#pName');
  const phoneEl = root.querySelector('#custPhone');
  const dateEl = root.querySelector('#pDate');
  const timeEl = root.querySelector('#pTime');
  const noteEl = root.querySelector('#pNote');

  function paint() {
    const parts = shop.menu.filter((k) => (qty.get(k.id) || 0) > 0);
    const total = parts.reduce((s, k) => s + qty.get(k.id) * k.priceCents, 0);
    const pieces = parts.reduce((s, k) => s + qty.get(k.id), 0);

    root.querySelector('#sumItems').innerHTML = parts.length
      ? parts.map((k) => `<div class="summary-row" style="padding:6px 0">
          <span class="ellipsis">${qty.get(k.id)} × ${esc(k.name)}</span>
          <span>${money(qty.get(k.id) * k.priceCents)}</span>
        </div>`).join('')
      : '<div class="tiny muted center" style="padding:18px 0">Belum ada kuih dipilih.</div>';

    root.querySelector('#sumPieces').textContent = `${num(pieces)} unit`;
    root.querySelector('#sumTotal').textContent = money(total);
    root.querySelector('#sumDate').textContent = dateLabel(dateEl.value, { withDay: true });
    root.querySelector('#sumTime').textContent = timeLabel(timeEl.value);

    root.querySelectorAll('[data-card]').forEach((card) => {
      card.classList.toggle('selected', (qty.get(card.dataset.card) || 0) > 0);
    });
  }

  function setQty(id, value) {
    const next = Math.max(0, Math.min(2000, Math.trunc(Number(value) || 0)));
    qty.set(id, next);
    const input = root.querySelector(`[data-qty="${CSS.escape(id)}"]`);
    if (input) input.value = next;
    paint();
  }

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => setQty(btn.dataset.id, (qty.get(btn.dataset.id) || 0) + Number(btn.dataset.step)));
  });
  root.querySelectorAll('[data-qty]').forEach((input) => {
    input.addEventListener('change', () => setQty(input.dataset.qty, input.value));
    input.addEventListener('focus', () => input.select());
  });
  dateEl.addEventListener('change', paint);
  timeEl.addEventListener('change', paint);

  root.querySelector('#submitBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const picked = [...qty.entries()].filter(([, q]) => q > 0);

    if (!name) { toast('Sila isi nama anda.', 'error'); nameEl.focus(); return; }
    if (!phone) { toast('Nombor WhatsApp wajib diisi untuk menerima resit digital.', 'error'); phoneEl.focus(); return; }
    if ((phone.match(/\d/g) || []).length < 8) { toast('Nombor telefon tidak sah.', 'error'); phoneEl.focus(); return; }
    if (!picked.length) { toast('Sila pilih sekurang-kurangnya satu kuih.', 'error'); return; }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Menghantar…</span>';

    try {
      const order = await post('/api/public/orders', {
        tenantSlug: slug,
        customerName: name,
        phone,
        pickupDate: dateEl.value,
        pickupTime: timeEl.value,
        note: noteEl.value.trim(),
        items: picked.map(([kuihId, q]) => ({ kuihId, qty: q }))
      });

      // Resit TIDAK dihantar terus kepada pelanggan.
      // Peniaga akan mengesahkan tempahan dan menghantar resit melalui WhatsApp
      // dari papan pemuka NIVORA.
      success(order, { phone });
    } catch (err) {
      toast(err.message || 'Tempahan gagal dihantar.', 'error');
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  paint();
}

function success(order, { phone = '' } = {}) {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  root.innerHTML = shell({
    hero: `<div class="public-title">Tempahan dihantar!</div>
      <p class="public-tagline">Peniaga akan mengesahkan tempahan anda dan menghantar resit melalui WhatsApp.</p>`,
    body: `
      <div class="card" style="max-width:600px;margin:0 auto">
        <div class="card-body" style="text-align:center;padding:28px">
          <div style="width:62px;height:62px;border-radius:20px;background:var(--green-soft);color:var(--green);display:grid;place-items:center;margin:0 auto">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>
          </div>
          <div class="tiny muted upper" style="margin-top:14px">Nombor resit</div>
          <div class="mono" style="font-size:24px;font-weight:800;letter-spacing:-.02em">${esc(order.code)}</div>

          <div class="card card-pad mt-16" style="box-shadow:none;background:var(--surface-2);text-align:left">
            <div class="summary-row"><span>Kedai</span><span class="strong">${esc(order.tenantName)}</span></div>
            <div class="summary-row"><span>Pengambilan</span><span class="strong">${esc(timeLabel(order.pickupTime))}, ${esc(dateLabel(order.pickupDate, { withDay: true }))}</span></div>
            <div class="summary-row"><span>Lokasi</span><span class="strong">${esc(order.location || '—')}</span></div>
            <div class="summary-row total"><span>Jumlah bayaran</span><span>${money(order.totalCents)}</span></div>
          </div>

          <div class="callout callout-green mt-16" style="text-align:left">
            Tempahan anda sudah masuk ke papan pemuka peniaga. Resit digital akan dihantar oleh
            peniaga ke WhatsApp${phone ? ` <b>${esc(phone)}</b>` : ' anda'} selepas tempahan disahkan.
          </div>

          <p class="tiny muted mt-12" style="text-align:left">
            Simpan nombor resit <span class="mono strong">${esc(order.code)}</span> untuk menyemak status.
          </p>

          <button type="button" class="btn btn-primary btn-block mt-12" id="successCheckStatus">Semak status tempahan ini</button>
          <a class="link" style="display:block;margin-top:14px" href="/order.html">Buat tempahan lain</a>
          <div class="tiny muted center mt-8">${esc(shop?.tenant?.phone ? `Pertanyaan: ${shop.tenant.phone}` : '')}</div>
        </div>
      </div>`
  });

  root.querySelector('#successCheckStatus')?.addEventListener('click', () => {
    openStatusLookup({ code: order.code, phone });
  });
}

boot();

/* ================= Semakan tempahan pelanggan (tanpa log masuk) ================= */

const STATUS_FLOW = [
  ['baru', 'Baru Diterima', 'Tempahan diterima dan menunggu pengesahan peniaga.'],
  ['disediakan', 'Sedang Disediakan', 'Kuih anda sedang disediakan.'],
  ['sedia', 'Sedia Diambil', 'Sedia untuk diambil pada slot yang dipilih.'],
  ['selesai', 'Selesai', 'Tempahan telah selesai. Terima kasih!']
];

function timelineMarkup(status) {
  if (status === 'batal') {
    return '<div class="callout callout-red">Tempahan ini telah dibatalkan. Hubungi peniaga untuk maklumat lanjut.</div>';
  }
  const idx = STATUS_FLOW.findIndex(([key]) => key === status);
  return `<div class="timeline">
    ${STATUS_FLOW.map(([key, label, desc], i) => `
      <div class="tl-step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
        <span class="tl-dot">${i < idx ? '✓' : ''}</span>
        <div class="tl-title">${label}</div>
        <div class="tl-desc">${desc}</div>
      </div>`).join('')}
  </div>`;
}

function lookupResultMarkup(o) {
  return `
    <div class="card card-pad" style="box-shadow:none;background:var(--surface-2)">
      <div class="between" style="gap:10px">
        <div>
          <div class="tiny muted upper">Nombor resit</div>
          <div class="mono strong" style="font-size:18px;letter-spacing:-.02em">${esc(o.code)}</div>
        </div>
        ${statusBadge(o.status)}
      </div>
      <div class="summary-row"><span>Pengambilan</span><span class="strong">${esc(timeLabel(o.pickupTime))}, ${esc(dateLabel(o.pickupDate, { withDay: true }))}</span></div>
      <div class="summary-row"><span>Jumlah bayaran</span><span class="strong">${money(o.totalCents)}</span></div>
    </div>

    ${timelineMarkup(o.status)}

    <div>
      <div class="upper muted" style="margin-bottom:4px">Item tempahan</div>
      ${o.items.map((i) => `<div class="summary-row" style="padding:5px 0"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.lineTotalCents)}</span></div>`).join('')}
    </div>

    ${o.note ? `<div class="callout callout-blue">📝 ${esc(o.note)}</div>` : ''}`;
}

function openStatusLookup({ code = '', phone = '' } = {}) {
  const modal = openModal({
    title: 'Semak tempahan anda',
    subtitle: 'Tiada akaun diperlukan — guna nombor resit dan nombor WhatsApp anda.',
    body: `
      <div class="stack" style="gap:12px">
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label" for="lkCode">Nombor resit</label>
            <input class="input mono" id="lkCode" placeholder="KUIH-1086" value="${esc(code)}" autocomplete="off" autocapitalize="characters">
          </div>
          <div class="field">
            <label class="label" for="lkPhone">Nombor WhatsApp</label>
            <input class="input" id="lkPhone" placeholder="012-3456789" value="${esc(phone)}" inputmode="tel" autocomplete="tel">
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="lkBtn">${icon('search')} Semak Status</button>
        <div id="lkResult" class="stack" style="gap:12px"></div>
        <div class="callout callout-blue tiny">Status dikemas kini oleh peniaga di papan pemuka NIVORA. Resit rasmi dihantar oleh peniaga melalui WhatsApp selepas tempahan disahkan.</div>
      </div>`,
    footer: `<button class="btn btn-ghost" data-dismiss>Tutup</button>`
  });

  modal.root.querySelector('[data-dismiss]').addEventListener('click', modal.close);

  const codeEl = modal.root.querySelector('#lkCode');
  const phoneEl = modal.root.querySelector('#lkPhone');
  const btn = modal.root.querySelector('#lkBtn');
  const out = modal.root.querySelector('#lkResult');

  async function run() {
    const codeVal = codeEl.value.trim().toUpperCase();
    const phoneVal = phoneEl.value.trim();

    if (!codeVal) { toast('Masukkan nombor resit anda.', 'error'); codeEl.focus(); return; }
    if ((phoneVal.match(/\d/g) || []).length < 8) { toast('Masukkan nombor WhatsApp yang sah.', 'error'); phoneEl.focus(); return; }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Menyemak…</span>';
    out.innerHTML = '';

    try {
      const order = await get(
        `/api/public/tenants/${encodeURIComponent(slug)}/orders/${encodeURIComponent(codeVal)}?phone=${encodeURIComponent(phoneVal)}`
      );
      out.innerHTML = lookupResultMarkup(order);
    } catch (err) {
      out.innerHTML = `<div class="callout callout-red">${esc(err.message || 'Tempahan tidak dijumpai.')}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  btn.addEventListener('click', run);
  [codeEl, phoneEl].forEach((el) => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  });

  if (code && phone) setTimeout(run, 300);
  else setTimeout(() => codeEl.focus(), 120);
}


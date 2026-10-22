import { get, post } from '../../core/api.js';
import { money, num, dateLabel, timeLabel, todayISO, emojiFor, waLink, marginPct } from '../../core/format.js';
import { esc, toast, openModal } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Rekod Manual';

/**
 * Rekod pesanan manual untuk pesanan walk-in, telefon atau WhatsApp.
 * Borang ini sengaja diringkaskan — pesanan online pelanggan masuk
 * secara automatik melalui /order.html.
 */
export async function render(root, ctx) {
  const [menu, tenant] = await Promise.all([get('/api/kuih'), get('/api/tenant')]);
  const slots = (ctx.config.pickupSlots?.length ? ctx.config.pickupSlots : ['08:00', '10:30', '14:30', '16:30', '18:00']);
  const quantities = new Map(menu.map((k) => [k.id, 0]));
  let discount = 0;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Rekod Pesanan Manual</h2>
        <p class="page-sub">Untuk pesanan walk-in, telefon atau WhatsApp. Tempahan pelanggan online masuk automatik ke senarai pesanan.</p>
      </div>
      <button class="btn btn-ghost" data-go="/orders">${icon('receipt')} Lihat Pesanan</button>
    </div>

    <div class="grid grid-split">
      <div class="stack" style="gap:16px">

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Butiran pelanggan</div>
              <div class="card-sub">Maklumat untuk pengesahan tempahan</div>
            </div>
            <span class="badge badge-slate">${esc(tenant.name)}</span>
          </div>
          <div class="card-body stack" style="gap:14px">
            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label class="label" for="custName">Nama pelanggan <span class="req">*</span></label>
                <input class="input" id="custName" placeholder="Contoh: Puan Hanim" autocomplete="off">
              </div>
              <div class="field">
                <label class="label" for="custPhone">Nombor WhatsApp <span class="req">*</span></label>
                <input class="input" id="custPhone" placeholder="012-3456789" inputmode="tel" autocomplete="off">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label class="label" for="custDate">Tarikh pengambilan <span class="req">*</span></label>
                <input class="input" id="custDate" type="date" value="${todayISO()}" min="${todayISO()}">
              </div>
              <div class="field">
                <label class="label" for="custTime">Slot pengambilan <span class="req">*</span></label>
                <select class="select" id="custTime">
                  ${slots.map((s) => `<option value="${s}">${timeLabel(s)}${s === '08:00' ? ' (Sarapan)' : s === '10:30' ? ' (Minum pagi)' : s === '16:30' ? ' (Minum petang)' : ''}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label class="label" for="custChannel">Saluran tempahan</label>
                <select class="select" id="custChannel">
                  <option value="walkin">Walk-in</option>
                  <option value="telefon">Telefon</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div class="field">
                <label class="label" for="custNote">Nota (pilihan)</label>
                <input class="input" id="custNote" placeholder="Kurang manis, bungkus berasingan…">
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Pilih kuih & kuantiti</div>
              <div class="card-sub">${menu.length} menu aktif · boleh pilih lebih daripada satu</div>
            </div>
            <span class="badge badge-amber" id="itemBadge">0 item</span>
          </div>
          <div class="card-body">
            ${menu.length ? `<div class="menu-grid" id="menuGrid">
              ${menu.map((k) => `
                <div class="menu-card" data-card="${esc(k.id)}">
                  <div class="menu-emoji">${emojiFor(k.name)}</div>
                  <div class="menu-info">
                    <div class="menu-name">${esc(k.name)}</div>
                    <div class="menu-price">${money(k.priceCents)} / ${esc(k.unit || 'biji')}</div>
                  </div>
                  <div class="stepper">
                    <button type="button" data-step="-1" data-id="${esc(k.id)}">−</button>
                    <input class="qty-input" type="number" min="0" max="5000" value="0" data-qty="${esc(k.id)}" aria-label="Kuantiti ${esc(k.name)}">
                    <button type="button" data-step="1" data-id="${esc(k.id)}">+</button>
                  </div>
                </div>`).join('')}
            </div>` : `<div class="empty"><div class="empty-ico">${icon('store')}</div><div class="empty-title">Menu masih kosong</div><div class="empty-text">Tambah menu kuih terlebih dahulu sebelum merekod pesanan.</div><button class="btn btn-primary btn-sm mt-8" data-go="/menu">Tambah menu</button></div>`}
          </div>
        </section>
      </div>

      <aside class="card summary-card">
        <div class="card-head">
          <div>
            <div class="card-title">Ringkasan pesanan</div>
            <div class="card-sub" id="summaryRange">${dateLabel(todayISO(), { withDay: true })}</div>
          </div>
          <span class="badge badge-blue" id="summarySlot">${timeLabel(slots[0])}</span>
        </div>
        <div class="card-body">
          <div id="summaryItems" class="stack" style="gap:0;margin-bottom:6px">
            <div class="tiny muted center" style="padding:16px 0">Belum ada item dipilih.</div>
          </div>

          <div class="summary-row"><span>Jenis kuih</span><span id="sumKinds">0 jenis</span></div>
          <div class="summary-row"><span>Jumlah unit</span><span id="sumPieces">0 unit</span></div>
          <div class="summary-row"><span>Kos bahan</span><span id="sumCost" style="color:var(--red)">RM 0.00</span></div>

          <div class="field mt-8">
            <label class="label" for="discount">Diskaun (RM)</label>
            <input class="input" id="discount" type="number" min="0" step="0.50" value="0" placeholder="0.00">
          </div>

          <div class="summary-row total"><span>Jumlah bayaran</span><span id="sumTotal">RM 0.00</span></div>
          <div class="tiny" style="text-align:right;color:var(--green);font-weight:700" id="sumProfit">Anggaran untung RM 0.00</div>

          <button class="btn btn-primary btn-lg btn-block mt-16" id="submitBtn" ${menu.length ? '' : 'disabled'}>
            ${icon('check')} Hantar pesanan
          </button>
          <button class="btn btn-ghost btn-block mt-8" data-go="/orders">Lihat senarai pesanan</button>

          <div class="callout callout-blue mt-16 tiny">
            Pesanan disimpan sebagai <b>Baru Diterima</b>. Resit digital boleh dihantar kepada pelanggan dari butang WhatsApp selepas ini.
          </div>
        </div>
      </aside>
    </div>`;

  const priceMap = new Map(menu.map((k) => [k.id, k]));
  const nameEl = root.querySelector('#custName');
  const phoneEl = root.querySelector('#custPhone');
  const dateEl = root.querySelector('#custDate');
  const timeEl = root.querySelector('#custTime');
  const noteEl = root.querySelector('#custNote');
  const channelEl = root.querySelector('#custChannel');
  const discountEl = root.querySelector('#discount');
  const summaryItems = root.querySelector('#summaryItems');

  function totals() {
    let pieces = 0;
    let kinds = 0;
    let gross = 0;
    let cost = 0;
    for (const [id, qty] of quantities) {
      if (qty > 0) {
        const k = priceMap.get(id);
        kinds += 1;
        pieces += qty;
        gross += qty * k.priceCents;
        cost += qty * k.costCents;
      }
    }
    const disc = Math.min(gross, Math.max(0, Math.round(Number(discount || 0) * 100)));
    return { pieces, kinds, gross, cost, disc, total: gross - disc, profit: gross - disc - cost };
  }

  function paintSummary() {
    const t = totals();
    root.querySelector('#sumKinds').textContent = `${t.kinds} jenis`;
    root.querySelector('#sumPieces').textContent = `${num(t.pieces)} unit`;
    root.querySelector('#sumCost').textContent = money(t.cost);
    root.querySelector('#sumTotal').textContent = money(t.total);
    root.querySelector('#sumProfit').textContent = `Anggaran untung ${money(t.profit)} (${marginPct(t.total, t.cost)}%)`;
    root.querySelector('#itemBadge').textContent = `${t.kinds} item`;
    root.querySelector('#summarySlot').textContent = timeLabel(timeEl.value);
    root.querySelector('#summaryRange').textContent = dateLabel(dateEl.value, { withDay: true });

    const chosen = [...quantities.entries()].filter(([, q]) => q > 0);
    summaryItems.innerHTML = chosen.length
      ? chosen.map(([id, qty]) => {
        const k = priceMap.get(id);
        return `<div class="summary-row" style="padding:6px 0">
          <span class="ellipsis">${qty} × ${esc(k.name)}</span>
          <span class="nowrap">${money(qty * k.priceCents)}</span>
        </div>`;
      }).join('')
      : '<div class="tiny muted center" style="padding:16px 0">Belum ada item dipilih.</div>';

    root.querySelectorAll('[data-card]').forEach((card) => {
      card.classList.toggle('selected', (quantities.get(card.dataset.card) || 0) > 0);
    });
  }

  function setQty(id, value) {
    if (!priceMap.has(id)) return;
    const qty = Math.max(0, Math.min(5000, Math.trunc(Number(value) || 0)));
    quantities.set(id, qty);
    const input = root.querySelector(`[data-qty="${CSS.escape(id)}"]`);
    if (input) input.value = qty;
    paintSummary();
  }

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      setQty(id, (quantities.get(id) || 0) + Number(btn.dataset.step));
    });
  });

  root.querySelectorAll('[data-qty]').forEach((input) => {
    input.addEventListener('change', () => setQty(input.dataset.qty, input.value));
    input.addEventListener('focus', () => input.select());
  });

  discountEl.addEventListener('input', () => {
    discount = discountEl.value;
    paintSummary();
  });

  [dateEl, timeEl].forEach((el) => el.addEventListener('change', paintSummary));

  /* ---------------- Hantar ---------------- */
  root.querySelector('#submitBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const picked = [...quantities.entries()].filter(([, q]) => q > 0);

    if (!name) { toast('Sila isi nama pelanggan.', 'error'); nameEl.focus(); return; }
    if (!phone || (phone.match(/\d/g) || []).length < 8) { toast('Nombor telefon tidak sah.', 'error'); phoneEl.focus(); return; }
    if (!picked.length) { toast('Sila pilih sekurang-kurangnya satu kuih.', 'error'); return; }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span><span>Menghantar…</span>';

    try {
      const order = await post('/api/orders', {
        customerName: name,
        phone,
        pickupDate: dateEl.value,
        pickupTime: timeEl.value,
        note: noteEl.value.trim(),
        channel: channelEl.value,
        discount: Number(discountEl.value || 0),
        items: picked.map(([kuihId, qty]) => ({ kuihId, qty }))
      });

      showSuccess(order, { name, phone });
      quantities.forEach((_, id) => quantities.set(id, 0));
      root.querySelectorAll('[data-qty]').forEach((input) => { input.value = 0; });
      discountEl.value = '0';
      discount = 0;
      noteEl.value = '';
      paintSummary();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  function showSuccess(order, customer) {
    const modal = openModal({
      title: 'Pesanan manual direkod',
      subtitle: `${order.code} · ${customer.name}`,
      body: `
        <div class="stack" style="gap:14px;text-align:center">
          <div style="width:56px;height:56px;border-radius:18px;background:var(--green-soft);color:var(--green);display:grid;place-items:center;margin:0 auto">
            ${icon('check')}
          </div>
          <div>
            <div class="mono" style="font-size:18px;font-weight:800">${esc(order.code)}</div>
            <div class="small muted">${esc(dateLabel(order.pickupDate, { withDay: true }))} · ${esc(timeLabel(order.pickupTime))}</div>
          </div>
          <div class="card card-pad" style="box-shadow:none;text-align:left">
            ${order.items.map((i) => `<div class="summary-row"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.lineTotalCents)}</span></div>`).join('')}
            <div class="summary-row total"><span>Jumlah</span><span>${money(order.totalCents)}</span></div>
          </div>
          <div class="tiny muted">Status: Baru Diterima · Resit boleh dihantar kepada pelanggan melalui butang di bawah.</div>
        </div>`,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Tutup</button>
        <button class="btn btn-success" data-send-wa>${icon('whatsapp')} Hantar resit ke WhatsApp</button>`
    });

    modal.root.querySelector('[data-close-modal]').addEventListener('click', modal.close);
    modal.root.querySelector('[data-send-wa]').addEventListener('click', async () => {
      try {
        const data = await get(`/api/orders/${order.id}/whatsapp`);
        window.open(data.waUrl || waLink(customer.phone, data.text), '_blank', 'noopener');
        toast('Resit digital dibuka di WhatsApp pelanggan.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  paintSummary();
}

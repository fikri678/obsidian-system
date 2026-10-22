import { get, patch, post, queryString } from '../../core/api.js';
import { money, num, dateLabel, timeLabel, statusLabel, marginPct, channelLabel, waLink, downloadCSV, stampLabel } from '../../core/format.js';
import { esc, statusBadge, emptyState, toast, confirmDialog, openDrawer, loadingBlock, debounce } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Pesanan Pelanggan';

const STATUS_TABS = [
  ['ALL', 'Semua'],
  ['baru', 'Baru'],
  ['disediakan', 'Disediakan'],
  ['sedia', 'Sedia'],
  ['selesai', 'Selesai'],
  ['batal', 'Batal']
];

export async function render(root, ctx) {
  const view = {
    status: ctx.params.status || 'ALL',
    q: ctx.params.q || '',
    orders: [],
    loading: true
  };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">${title}</h2>
        <p class="page-sub">Kemas kini status tempahan, pantau masa pengambilan dan hubungi pelanggan.</p>
      </div>
      <div class="row wrap">
        <button class="btn btn-ghost" id="exportBtn">${icon('download')} Eksport CSV</button>
        <button class="btn btn-primary" data-go="/new-order">${icon('plus')} Rekod Manual</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head" style="flex-direction:column;align-items:stretch;gap:12px">
        <div class="between wrap" style="gap:10px">
          <div class="tabs" id="statusTabs" style="border:0;padding:0">
            ${STATUS_TABS.map(([key, label]) => `<button class="tab ${view.status === key ? 'active' : ''}" data-status="${key}">${label}</button>`).join('')}
          </div>
          <div class="row" style="gap:8px">
            <div class="search" style="width:250px;max-width:100%">
              ${icon('search')}
              <input class="input" id="orderSearch" placeholder="Cari nama, telefon atau kod…" value="${esc(view.q)}">
            </div>
            <button class="icon-btn bordered" id="reloadBtn" title="Muat semula">${icon('refresh')}</button>
          </div>
        </div>
        <div class="tiny muted" id="orderCount">Memuatkan…</div>
      </div>
      <div class="table-wrap" id="ordersTableWrap">
        ${loadingBlock('Memuatkan pesanan…')}
      </div>
    </section>`;

  const tabs = root.querySelector('#statusTabs');
  const countEl = root.querySelector('#orderCount');
  const wrap = root.querySelector('#ordersTableWrap');
  const search = root.querySelector('#orderSearch');

  async function load({ silent = false } = {}) {
    if (!silent) wrap.innerHTML = loadingBlock('Memuatkan pesanan…');
    try {
      const data = await get(`/api/orders${queryString({ status: view.status, q: view.q, limit: 300 })}`);
      view.orders = data.orders;
      paint();
    } catch (err) {
      wrap.innerHTML = `<div class="empty"><div class="empty-title">Ralat memuatkan pesanan</div><div class="empty-text">${esc(err.message)}</div></div>`;
      toast(err.message, 'error');
    }
  }

  function paint() {
    const orders = view.orders;
    countEl.innerHTML = `${num(orders.length)} pesanan dipaparkan · <span class="muted">Jumlah nilai ${money(orders.reduce((s, o) => s + (o.status === 'batal' ? 0 : o.totalCents), 0))}</span>`;

    if (!orders.length) {
      wrap.innerHTML = emptyState({
        iconName: 'receipt',
        title: 'Tiada pesanan ditemui',
        text: view.q || view.status !== 'ALL'
          ? 'Cuba tukar penapis status atau kata kunci carian.'
          : 'Rekod tempahan pertama anda melalui borang pelanggan.',
        action: '<button class="btn btn-primary btn-sm mt-8" data-go="/new-order">Rekod manual</button>'
      });
      return;
    }

    wrap.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Kod & Pelanggan</th>
          <th>Kuih & Kuantiti</th>
          <th>Pengambilan</th>
          <th class="right">Jumlah</th>
          <th>Status</th>
          <th class="center">Tindakan</th>
        </tr></thead>
        <tbody>
          ${orders.map((o) => `
            <tr class="clickable" data-open="${esc(o.id)}">
              <td>
                <div class="cell-main">${esc(o.customerName)}</div>
                <div class="cell-sub mono">${esc(o.code)} · ${esc(o.phone)}</div>
              </td>
              <td style="max-width:230px">
                <div class="small">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</div>
                <div class="cell-sub">${esc(channelLabel(o.channel))} · ${o.items.reduce((s, i) => s + i.qty, 0)} unit</div>
              </td>
              <td>
                <div class="small strong">${esc(timeLabel(o.pickupTime))}</div>
                <div class="cell-sub">${esc(dateLabel(o.pickupDate))}</div>
              </td>
              <td class="right">
                <div class="num strong">${money(o.totalCents)}</div>
                <div class="cell-sub" style="color:var(--green)">Untung ${money(o.profitCents)}</div>
              </td>
              <td>${statusBadge(o.status)}</td>
              <td class="center" onclick="event.stopPropagation()">
                <div class="row" style="justify-content:center;gap:4px">
                  <button class="icon-btn bordered sm" data-advance="${esc(o.id)}" title="Status seterusnya">${icon('chevronRight')}</button>
                  <button class="icon-btn bordered sm" data-wa="${esc(o.id)}" title="Hantar resit WhatsApp ke pelanggan">${icon('whatsapp')}</button>
                  <button class="icon-btn bordered sm" data-open="${esc(o.id)}" title="Lihat butiran">${icon('eye')}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openOrder(view.orders.find((o) => o.id === el.dataset.open), load);
      });
    });

    wrap.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          const updated = await post(`/api/orders/${btn.dataset.advance}/advance`, {});
          toast(`${updated.code}: ${statusLabel(updated.status)}`);
          await load({ silent: true });
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    wrap.querySelectorAll('[data-wa]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await sendWhatsApp(btn.dataset.wa);
      });
    });
  }

  async function sendWhatsApp(orderId) {
    try {
      const data = await get(`/api/orders/${orderId}/whatsapp`);
      const link = data.waUrl || waLink(data.phone, data.text);
      window.open(link, '_blank', 'noopener');
      toast(`Resit digital ${data.code} dibuka di WhatsApp pelanggan.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openOrder(order, reload) {
    if (!order) return;
    const profit = order.totalCents - order.costCents;
    const margin = marginPct(order.totalCents, order.costCents);
    const drawer = openDrawer({
      title: `<div class="row" style="gap:8px"><span class="mono small">${esc(order.code)}</span>${statusBadge(order.status)}</div>`,
      subtitle: `${esc(order.customerName)} · ${esc(order.phone)}`,
      body: `
        <div class="stack" style="gap:14px">
          <div class="grid grid-2" style="gap:10px">
            <div class="metric-box">
              <div class="label">Pengambilan</div>
              <div class="value" style="font-size:15px">${esc(timeLabel(order.pickupTime))}</div>
              <div class="tiny muted">${esc(dateLabel(order.pickupDate, { withDay: true }))}</div>
            </div>
            <div class="metric-box">
              <div class="label">Jumlah pesanan</div>
              <div class="value" style="color:var(--brand)">${money(order.totalCents)}</div>
              <div class="tiny muted">${esc(channelLabel(order.channel))} · ${num(order.items.reduce((s, i) => s + i.qty, 0))} unit</div>
            </div>
          </div>

          <div>
            <div class="upper muted" style="margin-bottom:8px">Item tempahan</div>
            <div class="card" style="box-shadow:none">
              ${order.items.map((item) => `
                <div class="ing-row" style="padding:9px 14px">
                  <span class="ing-name">${esc(item.name)}</span>
                  <span class="tiny muted nowrap">${item.qty} × ${money(item.unitPriceCents)}</span>
                  <span class="ing-cost">${money(item.lineTotalCents)}</span>
                </div>`).join('')}
            </div>
          </div>

          <div class="card card-pad" style="box-shadow:none;background:var(--surface-2)">
            <div class="summary-row"><span>Jualan kasar</span><span>${money(order.totalCents)}</span></div>
            <div class="summary-row"><span>Kos bahan</span><span style="color:var(--red)">-${money(order.costCents)}</span></div>
            <div class="summary-row total"><span>Untung bersih</span><span>${money(profit)}</span></div>
            <div class="tiny muted center" style="margin-top:4px">Margin ${margin}%</div>
          </div>

          ${order.note ? `<div class="callout callout-blue">📝 ${esc(order.note)}</div>` : ''}

          <div>
            <div class="upper muted" style="margin-bottom:8px">Kemas kini status</div>
            <div class="row wrap" style="gap:6px">
              ${['baru', 'disediakan', 'sedia', 'selesai', 'batal'].map((s) => `
                <button class="btn btn-sm ${order.status === s ? 'btn-dark' : 'btn-ghost'}" data-set-status="${s}" ${order.status === 'batal' && s !== 'batal' ? 'disabled' : ''}>
                  ${esc(statusLabel(s))}
                </button>`).join('')}
            </div>
          </div>

          <div class="tiny muted">Direkod ${esc(stampLabel(order.createdAt))}</div>
          <div class="callout callout-blue tiny">Resit tidak dihantar automatik kepada pelanggan. Tekan <b>Hantar Resit ke Pelanggan</b> untuk membuka WhatsApp dengan resit selepas tempahan disahkan.</div>
        </div>`,
      footer: `
        <button class="btn btn-success" data-wa-drawer>${icon('whatsapp')} Hantar Resit ke Pelanggan</button>
        <button class="btn btn-primary" data-advance-drawer>${icon('chevronRight')} Status seterusnya</button>`
    });

    drawer.root.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const status = btn.dataset.setStatus;
        if (status === order.status) return;
        if (status === 'batal') {
          const ok = await confirmDialog({
            title: 'Batalkan pesanan?',
            message: `Pesanan ${order.code} untuk ${order.customerName} akan ditanda batal. Tindakan ini tidak boleh dibatalkan.`,
            confirmLabel: 'Ya, batalkan',
            danger: true
          });
          if (!ok) return;
        }
        btn.disabled = true;
        try {
          await patch(`/api/orders/${order.id}/status`, { status });
          toast(`Status ${order.code} dikemas kini.`);
          drawer.close();
          await reload({ silent: true });
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    drawer.root.querySelector('[data-advance-drawer]')?.addEventListener('click', async () => {
      try {
        await post(`/api/orders/${order.id}/advance`, {});
        drawer.close();
        toast(`Status ${order.code} dimajukan.`);
        await reload({ silent: true });
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    drawer.root.querySelector('[data-wa-drawer]')?.addEventListener('click', () => sendWhatsApp(order.id));
  }

  tabs.querySelectorAll('[data-status]').forEach((tab) => {
    tab.addEventListener('click', () => {
      view.status = tab.dataset.status;
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      load();
    });
  });

  search.addEventListener('input', debounce(() => {
    view.q = search.value.trim();
    load();
  }, 350));

  root.querySelector('#reloadBtn').addEventListener('click', () => load());

  root.querySelector('#exportBtn').addEventListener('click', () => {
    if (!view.orders.length) { toast('Tiada pesanan untuk dieksport.', 'info'); return; }
    downloadCSV(
      `pesanan-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Kod', 'Pelanggan', 'Telefon', 'Tarikh', 'Masa', 'Item', 'Jumlah (RM)', 'Kos (RM)', 'Untung (RM)', 'Status', 'Saluran'],
      view.orders.map((o) => [
        o.code, o.customerName, o.phone, o.pickupDate, o.pickupTime,
        o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
        (o.totalCents / 100).toFixed(2), (o.costCents / 100).toFixed(2), (o.profitCents / 100).toFixed(2),
        statusLabel(o.status), channelLabel(o.channel)
      ])
    );
    toast('Fail CSV dimuat turun.');
  });

  await load();
}

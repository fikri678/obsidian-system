import { get, patch, queryString } from '../../core/api.js';
import { money, num, dateLabel, timeLabel, statusLabel, marginPct, channelLabel, downloadCSV, stampLabel } from '../../core/format.js';
import { esc, statusBadge, toast, openDrawer, emptyState, debounce, loadingBlock, confirmDialog } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Semua Pesanan';

export async function render(root, ctx) {
  const tenants = await get('/api/admin/tenants');
  const view = {
    tenantId: ctx.params.tenantId || 'ALL',
    status: ctx.params.status || 'ALL',
    q: ctx.params.q || '',
    orders: []
  };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Semua pesanan</h2>
        <p class="page-sub">Rentas semua kedai. Pentadbir boleh membetulkan status pesanan jika perlu.</p>
      </div>
      <button class="btn btn-ghost" id="exportBtn">${icon('download')} Eksport CSV</button>
    </div>

    <section class="card">
      <div class="card-head" style="flex-direction:column;align-items:stretch;gap:12px">
        <div class="between wrap" style="gap:10px">
          <div class="tabs" id="statusTabs" style="border:0;padding:0">
            ${[['ALL', 'Semua'], ['baru', 'Baru'], ['disediakan', 'Disediakan'], ['sedia', 'Sedia'], ['selesai', 'Selesai'], ['batal', 'Batal']]
              .map(([k, l]) => `<button class="tab ${view.status === k ? 'active' : ''}" data-status="${k}">${l}</button>`).join('')}
          </div>
          <div class="row wrap" style="gap:8px">
            <select class="select" id="tenantFilter" style="width:190px">
              <option value="ALL">Semua kedai</option>
              ${tenants.map((t) => `<option value="${esc(t.id)}" ${view.tenantId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
            <div class="search" style="width:230px">
              ${icon('search')}
              <input class="input" id="orderSearch" placeholder="Cari nama, telefon, kod…" value="${esc(view.q)}">
            </div>
          </div>
        </div>
        <div class="tiny muted" id="orderCount">Memuatkan…</div>
      </div>
      <div class="table-wrap" id="tableWrap">${loadingBlock('Memuatkan pesanan…')}</div>
    </section>`;

  const wrap = root.querySelector('#tableWrap');
  const countEl = root.querySelector('#orderCount');

  async function load() {
    wrap.innerHTML = loadingBlock('Memuatkan pesanan…');
    try {
      const data = await get(`/api/admin/orders${queryString({ tenantId: view.tenantId, status: view.status, q: view.q, limit: 300 })}`);
      view.orders = data.orders;
      paint();
    } catch (err) {
      wrap.innerHTML = `<div class="empty"><div class="empty-title">Ralat</div><div class="empty-text">${esc(err.message)}</div></div>`;
      toast(err.message, 'error');
    }
  }

  function paint() {
    const orders = view.orders;
    countEl.innerHTML = `${num(orders.length)} pesanan · nilai ${money(orders.reduce((s, o) => s + (o.status === 'batal' ? 0 : o.totalCents), 0))}`;

    if (!orders.length) {
      wrap.innerHTML = emptyState({ iconName: 'receipt', title: 'Tiada pesanan', text: 'Cuba tukar penapis kedai, status atau carian.' });
      return;
    }

    wrap.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Kod</th><th>Kedai</th><th>Pelanggan</th><th>Pengambilan</th>
          <th class="right">Jumlah</th><th class="right">Untung</th><th>Status</th><th class="center">Tindakan</th>
        </tr></thead>
        <tbody>
          ${orders.map((o) => `
            <tr class="clickable" data-open="${esc(o.id)}">
              <td class="mono small">${esc(o.code)}</td>
              <td class="small">${esc(o.tenantName || '—')}</td>
              <td>
                <div class="cell-main">${esc(o.customerName)}</div>
                <div class="cell-sub">${esc(o.phone)} · ${esc(channelLabel(o.channel))}</div>
              </td>
              <td>
                <div class="small">${esc(dateLabel(o.pickupDate))}</div>
                <div class="cell-sub">${esc(timeLabel(o.pickupTime))}</div>
              </td>
              <td class="right num strong">${money(o.totalCents)}</td>
              <td class="right num" style="color:var(--green)">${money(o.profitCents)}</td>
              <td>${statusBadge(o.status)}</td>
              <td class="center" onclick="event.stopPropagation()">
                <div class="row" style="justify-content:center;gap:4px">
                  <button class="icon-btn bordered sm" data-advance="${esc(o.id)}" title="Status seterusnya">${icon('chevronRight')}</button>
                  <button class="icon-btn bordered sm" data-open="${esc(o.id)}" title="Butiran">${icon('eye')}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(view.orders.find((o) => o.id === el.dataset.open), load);
      });
    });

    wrap.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          const updated = await patch(`/api/admin/orders/${btn.dataset.advance}/status`, { status: nextStatus(view.orders.find((o) => o.id === btn.dataset.advance)?.status) });
          toast(`${updated.code}: ${statusLabel(updated.status)}`);
          await load();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  function openDetail(order, reload) {
    if (!order) return;
    const drawer = openDrawer({
      title: `${esc(order.code)} ${statusBadge(order.status)}`,
      subtitle: `${esc(order.tenantName || '')} · ${esc(order.customerName)} · ${esc(order.phone)}`,
      body: `
        <div class="stack" style="gap:14px">
          <div class="grid grid-2" style="gap:10px">
            <div class="metric-box"><div class="label">Pengambilan</div><div class="value" style="font-size:15px">${esc(timeLabel(order.pickupTime))}</div><div class="tiny muted">${esc(dateLabel(order.pickupDate, { withDay: true }))}</div></div>
            <div class="metric-box"><div class="label">Jumlah</div><div class="value" style="color:var(--brand)">${money(order.totalCents)}</div><div class="tiny muted">margin ${marginPct(order.totalCents, order.costCents)}%</div></div>
          </div>
          <div class="card" style="box-shadow:none">
            ${order.items.map((i) => `<div class="ing-row" style="padding:9px 14px"><span class="ing-name">${esc(i.name)}</span><span class="tiny muted">${i.qty}× ${money(i.unitPriceCents)}</span><span class="ing-cost">${money(i.lineTotalCents)}</span></div>`).join('')}
          </div>
          ${order.note ? `<div class="callout callout-blue">${esc(order.note)}</div>` : ''}
          <div>
            <div class="upper muted" style="margin-bottom:8px">Tukar status</div>
            <div class="row wrap" style="gap:6px">
              ${['baru', 'disediakan', 'sedia', 'selesai', 'batal'].map((s) => `<button class="btn btn-sm ${order.status === s ? 'btn-dark' : 'btn-ghost'}" data-set="${s}">${esc(statusLabel(s))}</button>`).join('')}
            </div>
          </div>
          <div class="tiny muted">Direkod ${esc(stampLabel(order.createdAt))} · dikemas kini ${esc(stampLabel(order.updatedAt))}</div>
        </div>`
    });

    drawer.root.querySelectorAll('[data-set]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.set === order.status) return;
        if (btn.dataset.set === 'batal') {
          const ok = await confirmDialog({ title: 'Batalkan pesanan?', message: `${order.code} akan ditanda batal.`, confirmLabel: 'Batalkan', danger: true });
          if (!ok) return;
        }
        try {
          await patch(`/api/admin/orders/${order.id}/status`, { status: btn.dataset.set });
          toast('Status dikemas kini.');
          drawer.close();
          await reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  root.querySelectorAll('[data-status]').forEach((tab) => {
    tab.addEventListener('click', () => {
      view.status = tab.dataset.status;
      root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      load();
    });
  });

  root.querySelector('#tenantFilter').addEventListener('change', (e) => {
    view.tenantId = e.target.value;
    load();
  });

  root.querySelector('#orderSearch').addEventListener('input', debounce((e) => {
    view.q = e.target.value.trim();
    load();
  }, 350));

  root.querySelector('#exportBtn').addEventListener('click', () => {
    if (!view.orders.length) { toast('Tiada data untuk dieksport.', 'info'); return; }
    downloadCSV(
      `semua-pesanan-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Kod', 'Kedai', 'Pelanggan', 'Telefon', 'Tarikh', 'Masa', 'Item', 'Jumlah (RM)', 'Kos (RM)', 'Status'],
      view.orders.map((o) => [
        o.code, o.tenantName || '', o.customerName, o.phone, o.pickupDate, o.pickupTime,
        o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
        (o.totalCents / 100).toFixed(2), (o.costCents / 100).toFixed(2), statusLabel(o.status)
      ])
    );
    toast('Fail CSV dimuat turun.');
  });

  await load();
}

function nextStatus(current) {
  const flow = ['baru', 'disediakan', 'sedia', 'selesai'];
  const idx = flow.indexOf(current);
  if (idx < 0 || idx === flow.length - 1) return current;
  return flow[idx + 1];
}

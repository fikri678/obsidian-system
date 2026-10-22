import { get, post } from '../../core/api.js';
import { areaChart, donut, sparkline } from '../../core/charts.js';
import { money, num, pct, dateLabel, timeLabel, todayISO } from '../../core/format.js';
import { esc, statusBadge, emptyState, toast, copyText } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { publicOrderUrl } from '../../core/state.js';

export const title = 'Papan Pemuka';

const RANGES = [
  ['today', 'Hari ini'],
  ['7d', '7 hari'],
  ['30d', '30 hari'],
  ['90d', '90 hari']
];

function deltaChip(value) {
  if (value === null || value === undefined) return '<span class="delta flat">tiada data lama</span>';
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const ico = value > 0 ? icon('arrowUp') : value < 0 ? icon('arrowDown') : '';
  return `<span class="delta ${dir}">${ico}${Math.abs(value)}%</span>`;
}

export async function render(root, ctx) {
  const range = ctx.params.range || 'today';
  const data = await get(`/api/dashboard?range=${encodeURIComponent(range)}`);
  const { metrics, series, statusCounts, pickups, topKuih, alerts, tenant, recentOrders } = data;

  ctx.setBadge((statusCounts.baru || 0) + (statusCounts.disediakan || 0));

  const sparkValues = series.map((p) => p.grossCents);
  const topMax = Math.max(1, ...topKuih.map((k) => k.qty));
  const netPositive = metrics.netCents >= 0;

  root.innerHTML = `
    <section class="hero">
      <div style="position:relative;z-index:1">
        <div class="hero-eyebrow">
          <span class="hero-dot"></span> Sistem aktif · ${esc(tenant.location || 'Malaysia')}
        </div>
        <h1>${esc(tenant.name)}</h1>
        <p>${esc(tenant.tagline || 'Pantau tempahan, kos bahan dan untung bersih harian anda.')}</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" data-go="/new-order">${icon('plus')} Rekod Manual</button>
        <button class="btn btn-ghost" id="copyOrderLink" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);color:#fff">
          ${icon('share')} Pautan Pelanggan
        </button>
      </div>
    </section>

    ${alerts.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:16px">
      ${alerts.map((a) => `<div class="callout ${a.type === 'warn' ? 'callout-amber' : a.type === 'ready' ? 'callout-green' : 'callout-blue'}" style="display:flex;gap:8px;align-items:flex-start">
        ${icon(a.type === 'warn' ? 'alert' : 'info', '')}
        <span>${esc(a.text)}</span>
      </div>`).join('')}
    </div>` : ''}

    <div class="grid grid-4" style="margin-top:16px">
      <div class="card stat">
        <div class="stat-top">
          <span class="stat-label">Pesanan</span>
          <span class="stat-icon tone-blue">${icon('receipt')}</span>
        </div>
        <div>
          <div class="stat-value">${num(metrics.orders)}</div>
          <div class="stat-foot">
            ${deltaChip(data.deltas?.ordersPct)}
            <span>${esc(data.range.label)}</span>
          </div>
        </div>
      </div>

      <div class="card stat">
        <div class="stat-top">
          <span class="stat-label">Jualan kasar</span>
          <span class="stat-icon tone-green">${icon('cash')}</span>
        </div>
        <div>
          <div class="stat-value">${money(metrics.grossCents)}</div>
          <div class="stat-foot">
            ${deltaChip(data.deltas?.grossPct)}
            <span class="stat-spark">${sparkline(sparkValues, { color: '#40916C' })}</span>
          </div>
        </div>
      </div>

      <div class="card stat">
        <div class="stat-top">
          <span class="stat-label">Anggaran kos bahan</span>
          <span class="stat-icon tone-red">${icon('box')}</span>
        </div>
        <div>
          <div class="stat-value">${money(metrics.costCents)}</div>
          <div class="stat-foot">
            <span>${metrics.grossCents ? pct((metrics.costCents / metrics.grossCents) * 100, 1) : '0%'} daripada jualan</span>
          </div>
        </div>
      </div>

      <div class="card stat">
        <div class="stat-top">
          <span class="stat-label">Untung bersih</span>
          <span class="stat-icon tone-amber">${icon('trending')}</span>
        </div>
        <div>
          <div class="stat-value" style="color:${netPositive ? 'var(--brand)' : 'var(--red)'}">${money(metrics.netCents)}</div>
          <div class="stat-foot">
            <span class="badge ${metrics.marginPct >= 35 ? 'badge-green' : 'badge-red'}">${pct(metrics.marginPct, 1)} margin</span>
            ${deltaChip(data.deltas?.netPct)}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-dash" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Prestasi jualan</div>
            <div class="card-sub">Aliran jualan kasar mengikut tarikh pengambilan</div>
          </div>
          <div class="segmented">
            ${RANGES.map(([key, label]) => `<button data-range="${key}" class="${range === key ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="card-body" style="padding-top:12px">
          <div class="between" style="margin-bottom:10px">
            <div class="chart-legend">
              <span><i style="background:#40916C"></i>Jualan kasar</span>
              <span class="muted">${esc(data.range.label)}</span>
            </div>
            <span class="tiny muted">${series.length} hari</span>
          </div>
          <div id="salesChart"></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Pecahan untung</div>
            <div class="card-sub">Nisbah kos bahan vs untung bersih</div>
          </div>
          <span class="badge badge-amber">${pct(metrics.marginPct, 1)}</span>
        </div>
        <div class="card-body">
          <div id="profitDonut"></div>
          <div class="callout callout-amber mt-16" style="display:flex;gap:8px;align-items:flex-start">
            ${icon('sparkles')}
            <span><b>Tip NIVORA:</b> ${esc(data.insight)}</span>
          </div>
          <button class="btn btn-ghost btn-block mt-12" data-go="/calculator">${icon('calculator')} Buka kalkulator resipi</button>
        </div>
      </section>
    </div>

    <div class="grid grid-split" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Jadual pengambilan hari ini</div>
            <div class="card-sub">${num(pickups.length)} tempahan menunggu · ${dateLabel(todayISO(), { withDay: true })}</div>
          </div>
          <button class="link" data-go="/orders">Lihat semua →</button>
        </div>
        ${pickups.length ? `<div class="list">
          ${pickups.map((order) => `
            <div class="list-row">
              <span class="pickup-time">${esc(timeLabel(order.pickupTime))}</span>
              <div class="list-main">
                <div class="list-title">${esc(order.customerName)}</div>
                <div class="list-sub">${esc(order.items.map((i) => `${i.qty}× ${i.name}`).join(' · '))}</div>
              </div>
              <div class="right hide-sm">
                <div class="tiny muted">${num(order.totalQty)} unit</div>
                <div style="margin-top:3px">${statusBadge(order.status)}</div>
              </div>
              <button class="icon-btn bordered" data-advance="${esc(order.id)}" title="Kemas kini status">${icon('chevronRight')}</button>
            </div>`).join('')}
        </div>` : emptyState({ iconName: 'calendar', title: 'Tiada pengambilan hari ini', text: 'Tempahan baru akan muncul di sini mengikut slot masa pengambilan.' })}
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Kuih paling laris</div>
            <div class="card-sub">${esc(data.range.label)}</div>
          </div>
          <button class="link" data-go="/menu">Menu →</button>
        </div>
        <div class="card-body">
          ${topKuih.length ? `<div class="stack" style="gap:14px">
            ${topKuih.map((k, i) => `
              <div>
                <div class="between" style="margin-bottom:5px">
                  <span class="row" style="gap:7px;min-width:0">
                    <span class="tiny mono muted" style="width:12px">${i + 1}</span>
                    <span class="small strong ellipsis">${esc(k.name)}</span>
                  </span>
                  <span class="tiny muted nowrap">${num(k.qty)} unit · ${money(k.revenueCents)}</span>
                </div>
                <div class="bar-line"><span style="width:${((k.qty / topMax) * 100).toFixed(1)}%"></span></div>
              </div>`).join('')}
          </div>` : emptyState({ iconName: 'store', title: 'Belum ada jualan', text: 'Rekod pesanan pertama untuk melihat kuih paling laris.' })}
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <div>
          <div class="card-title">Tempahan terkini</div>
          <div class="card-sub">6 rekod terakhir direkodkan</div>
        </div>
        <button class="link" data-go="/orders">Semua pesanan →</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Pelanggan</th><th>Item</th><th>Pengambilan</th><th class="right">Jumlah</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${recentOrders.length ? recentOrders.map((o) => `
              <tr>
                <td>
                  <div class="cell-main">${esc(o.customerName)}</div>
                  <div class="cell-sub mono">${esc(o.code)} · ${esc(o.phone)}</div>
                </td>
                <td class="small muted">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</td>
                <td>
                  <div class="small strong">${esc(timeLabel(o.pickupTime))}</div>
                  <div class="cell-sub">${esc(dateLabel(o.pickupDate))}</div>
                </td>
                <td class="right num strong">${money(o.totalCents)}</td>
                <td>${statusBadge(o.status)}</td>
              </tr>`).join('') : `<tr><td colspan="5">${emptyState({ iconName: 'receipt', title: 'Tiada tempahan', text: 'Rekod pesanan baharu untuk mula.' })}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  areaChart(root.querySelector('#salesChart'), series, { value: 'grossCents', height: 238 });

  donut(root.querySelector('#profitDonut'), [
    { label: 'Untung bersih', value: Math.max(0, metrics.netCents), color: '#2D6A4F', display: money(metrics.netCents) },
    { label: 'Kos bahan', value: Math.max(0, metrics.costCents), color: '#B7E4C7', display: money(metrics.costCents) }
  ], { centerLabel: pct(metrics.marginPct, 0), centerSub: 'margin untung', size: 150, thickness: 15 });

  root.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.navigate(`/dashboard?range=${btn.dataset.range}`));
  });

  root.querySelector('#copyOrderLink')?.addEventListener('click', async () => {
    const ok = await copyText(publicOrderUrl());
    toast(ok ? 'Pautan borang pelanggan disalin.' : publicOrderUrl(), ok ? 'success' : 'info');
  });

  root.querySelectorAll('[data-advance]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const updated = await post(`/api/orders/${btn.dataset.advance}/advance`, {});
        toast(`Status ${updated.code} → ${updated.status === 'disediakan' ? 'Sedang Disediakan' : updated.status === 'sedia' ? 'Sedia Diambil' : 'Selesai'}.`);
        await ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

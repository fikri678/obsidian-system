import { get } from '../../core/api.js';
import { areaChart, sparkline } from '../../core/charts.js';
import { money, num, pct, dateLabel, timeLabel, relativeDay } from '../../core/format.js';
import { esc, emptyState } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Gambaran Platform';

export async function render(root, ctx) {
  const data = await get('/api/admin/overview');
  const { counts, metrics, tenantBreakdown, recentOrders, activity, statusCounts, series } = data;
  const topGross = Math.max(1, ...tenantBreakdown.map((t) => t.grossCents));

  root.innerHTML = `
    <section class="hero">
      <div style="position:relative;z-index:1">
        <div class="hero-eyebrow"><span class="hero-dot"></span> Pentadbir platform · ${esc(data.config.platformName)}</div>
        <h1>Semua kedai, satu pandangan.</h1>
        <p>${num(counts.tenants)} peniaga berdaftar · ${num(counts.users)} pengguna · ${num(counts.orders)} pesanan direkodkan.</p>
        <div class="row wrap" style="gap:8px;margin-top:14px">
          <span class="chip" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff">
            ${icon('store')} ${num(counts.activeTenants)} kedai aktif
          </span>
          <span class="chip" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff">
            ${icon('trending')} Pertumbuhan 7 hari ${data.growthPct === null ? '—' : `${data.growthPct > 0 ? '+' : ''}${data.growthPct}%`}
          </span>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" data-go="/admin/tenants">${icon('plus')} Peniaga baharu</button>
        <button class="btn btn-ghost" data-go="/admin/orders" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);color:#fff">${icon('receipt')} Semua pesanan</button>
      </div>
    </section>

    <div class="grid grid-4" style="margin-top:16px">
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Peniaga berdaftar</span><span class="stat-icon tone-blue">${icon('store')}</span></div>
        <div><div class="stat-value">${num(counts.tenants)}</div><div class="stat-foot"><span>${num(counts.activeTenants)} aktif</span></div></div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Pengguna sistem</span><span class="stat-icon tone-violet">${icon('users')}</span></div>
        <div><div class="stat-value">${num(counts.users)}</div><div class="stat-foot"><span>Peniaga & pentadbir</span></div></div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Jualan keseluruhan</span><span class="stat-icon tone-green">${icon('cash')}</span></div>
        <div>
          <div class="stat-value">${money(metrics.grossCents)}</div>
          <div class="stat-foot"><span class="stat-spark">${sparkline(series.map((s) => s.grossCents), { color: '#40916C' })}</span></div>
        </div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Untung bersih platform</span><span class="stat-icon tone-amber">${icon('trending')}</span></div>
        <div>
          <div class="stat-value" style="color:var(--brand)">${money(metrics.netCents)}</div>
          <div class="stat-foot"><span class="badge badge-amber">${pct(metrics.marginPct, 1)} margin</span><span>${money(metrics.avgOrderCents)} purata</span></div>
        </div>
      </div>
    </div>

    <div class="grid grid-dash" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <div><div class="card-title">Jualan 14 hari</div><div class="card-sub">Semua kedai · mengikut tarikh pengambilan</div></div>
          <div class="chart-legend"><span><i style="background:#40916C"></i>Jualan kasar</span></div>
        </div>
        <div class="card-body"><div id="platformChart"></div></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><div class="card-title">Status pesanan</div><div class="card-sub">30 hari terakhir</div></div>
          <span class="badge badge-slate">${num(Object.values(statusCounts).reduce((a, b) => a + b, 0))} pesanan</span>
        </div>
        <div class="card-body stack" style="gap:10px">
          ${[['baru', 'Baru Diterima', 'badge-baru', '#B7E4C7'], ['disediakan', 'Sedang Disediakan', 'badge-disediakan', '#95D5B2'], ['sedia', 'Sedia Diambil', 'badge-sedia', '#52B788'], ['selesai', 'Selesai', 'badge-selesai', '#2D6A4F'], ['batal', 'Dibatalkan', 'badge-batal', '#A7D8B9']]
            .map(([key, label, cls, color]) => {
              const count = statusCounts[key] || 0;
              const total = Math.max(1, Object.values(statusCounts).reduce((a, b) => a + b, 0));
              return `<div>
                <div class="between" style="margin-bottom:4px">
                  <span class="badge ${cls}">${label}</span>
                  <span class="small strong">${num(count)}</span>
                </div>
                <div class="bar-line"><span style="width:${((count / total) * 100).toFixed(1)}%;background:${color}"></span></div>
              </div>`;
            }).join('')}
          <button class="btn btn-ghost btn-block mt-8" data-go="/admin/orders">Urus semua pesanan</button>
        </div>
      </section>
    </div>

    <div class="grid grid-split" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <div><div class="card-title">Prestasi peniaga</div><div class="card-sub">Disusun mengikut jualan kasar</div></div>
          <button class="link" data-go="/admin/tenants">Urus peniaga →</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Kedai</th><th class="right">Pesanan</th><th class="right">Jualan</th><th class="right">Untung</th><th>Margin</th></tr></thead>
            <tbody>
              ${tenantBreakdown.map((t) => `
                <tr>
                  <td>
                    <div class="cell-main">${esc(t.name)}</div>
                    <div class="cell-sub mono">/order/${esc(t.slug)}</div>
                  </td>
                  <td class="right num">${num(t.orders)}</td>
                  <td class="right num strong">${money(t.grossCents)}</td>
                  <td class="right num" style="color:var(--green)">${money(t.netCents)}</td>
                  <td style="min-width:110px">
                    <div class="between tiny"><span class="muted">${pct(t.grossCents ? (t.netCents / t.grossCents) * 100 : 0, 1)}</span></div>
                    <div class="bar-line" style="margin-top:4px"><span style="width:${Math.min(100, (t.grossCents / topGross) * 100).toFixed(1)}%"></span></div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><div class="card-title">Aktiviti terkini</div><div class="card-sub">Jejak audit sistem</div></div>
          <button class="link" data-go="/admin/audit">Semua →</button>
        </div>
        <div class="list">
          ${activity.length ? activity.map((a) => `
            <div class="list-row" style="padding:11px 18px">
              <div class="list-ico" style="width:30px;height:30px;font-size:13px">${icon(a.action.includes('order') ? 'receipt' : a.action.includes('tenant') ? 'store' : a.action.includes('user') || a.action.includes('auth') ? 'user' : 'activity')}</div>
              <div class="list-main">
                <div class="list-title" style="font-size:12px">${esc(a.actorName || 'Sistem')} · <span class="muted">${esc(actionLabel(a.action))}</span></div>
                <div class="list-sub">${esc(a.tenantName || 'Platform')} · ${esc(a.createdAt.slice(5, 16))}</div>
              </div>
            </div>`).join('') : emptyState({ iconName: 'activity', title: 'Tiada aktiviti', text: 'Aktiviti akan direkodkan di sini.' })}
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <div><div class="card-title">Pesanan terkini semua kedai</div><div class="card-sub">8 rekod terakhir</div></div>
        <button class="link" data-go="/admin/orders">Lihat semua →</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Kod</th><th>Kedai</th><th>Pelanggan</th><th>Pengambilan</th><th class="right">Jumlah</th><th>Status</th></tr></thead>
          <tbody>
            ${recentOrders.length ? recentOrders.map((o) => `
              <tr>
                <td class="mono small">${esc(o.code)}</td>
                <td class="small">${esc(o.tenantName || '')}</td>
                <td><div class="cell-main">${esc(o.customerName)}</div><div class="cell-sub">${esc(o.phone)}</div></td>
                <td><div class="small">${esc(relativeDay(o.pickupDate))}</div><div class="cell-sub">${esc(timeLabel(o.pickupTime))}</div></td>
                <td class="right num strong">${money(o.totalCents)}</td>
                <td><span class="badge badge-${esc(o.status)}">${esc(statusLabelOf(o.status))}</span></td>
              </tr>`).join('') : `<tr><td colspan="6">${emptyState({ iconName: 'receipt', title: 'Tiada pesanan', text: 'Belum ada pesanan direkodkan.' })}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  areaChart(root.querySelector('#platformChart'), series, { value: 'grossCents', height: 250 });
}

function statusLabelOf(status) {
  return { baru: 'Baru Diterima', disediakan: 'Sedang Disediakan', sedia: 'Sedia Diambil', selesai: 'Selesai', batal: 'Dibatalkan' }[status] || status;
}

function actionLabel(action) {
  const map = {
    'auth.login': 'log masuk',
    'auth.login_failed': 'cubaan log masuk gagal',
    'auth.password_changed': 'tukar kata laluan',
    'order.created': 'pesanan baharu',
    'order.status_changed': 'kemas kini status',
    'kuih.created': 'tambah menu',
    'kuih.updated': 'kemas kini menu',
    'kuih.archived': 'arkib menu',
    'ingredient.created': 'tambah bahan',
    'ingredient.price_updated': 'kemas kini harga bahan',
    'ingredient.deleted': 'padam bahan',
    'recipe.created': 'tambah resipi',
    'recipe.updated': 'kemas kini resipi',
    'recipe.deleted': 'padam resipi',
    'tenant.created': 'daftar kedai',
    'tenant.updated': 'kemas kini kedai',
    'user.created': 'tambah pengguna',
    'user.updated': 'kemas kini pengguna',
    'user.deleted': 'padam pengguna',
    'user.password_reset': 'reset kata laluan',
    'settings.updated': 'kemas kini tetapan',
    'system.seeded': 'seed data demo'
  };
  return map[action] || action;
}

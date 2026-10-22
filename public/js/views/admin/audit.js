import { get, queryString } from '../../core/api.js';
import { esc, emptyState, debounce, loadingBlock, toast } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Log Audit';

export async function render(root, ctx) {
  const tenants = await get('/api/admin/tenants');
  const view = { tenantId: ctx.params.tenantId || 'ALL', q: '' };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Log audit</h2>
        <p class="page-sub">Jejak setiap tindakan penting: log masuk, pesanan, perubahan menu, kos dan pengguna.</p>
      </div>
      <span class="chip">${icon('shield')} Rekod tidak boleh diubah</span>
    </div>

    <section class="card">
      <div class="card-head" style="flex-direction:column;align-items:stretch;gap:10px">
        <div class="between wrap">
          <div class="card-title">Aktiviti sistem</div>
          <div class="row wrap" style="gap:8px">
            <select class="select" id="tenantFilter" style="width:190px">
              <option value="ALL">Semua kedai</option>
              ${tenants.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
            </select>
            <div class="search" style="width:220px">
              ${icon('search')}
              <input class="input" id="auditSearch" placeholder="Cari aktor atau tindakan…">
            </div>
          </div>
        </div>
        <div class="tiny muted" id="auditCount">Memuatkan…</div>
      </div>
      <div id="auditList">${loadingBlock('Memuatkan log…')}</div>
    </section>`;

  const listEl = root.querySelector('#auditList');
  const countEl = root.querySelector('#auditCount');

  async function load() {
    listEl.innerHTML = loadingBlock('Memuatkan log…');
    try {
      const logs = await get(`/api/admin/audit${queryString({ tenantId: view.tenantId, q: view.q, limit: 150 })}`);
      countEl.textContent = `${logs.length} rekod terakhir`;
      if (!logs.length) {
        listEl.innerHTML = emptyState({ iconName: 'activity', title: 'Tiada log', text: 'Aktiviti akan muncul di sini selepas pengguna mula menggunakan sistem.' });
        return;
      }
      listEl.innerHTML = `<div class="list">
        ${logs.map((log) => `
          <div class="list-row" style="align-items:flex-start;padding:12px 20px">
            <div class="list-ico" style="width:30px;height:30px;margin-top:2px">${icon(iconFor(log.action), '')}</div>
            <div class="list-main">
              <div class="between wrap" style="gap:6px">
                <div class="list-title">
                  ${esc(log.actorName || 'Sistem')}
                  <span class="muted" style="font-weight:600"> · ${esc(actionLabel(log.action))}</span>
                </div>
                <span class="tiny mono muted">${esc(log.createdAt)}</span>
              </div>
              <div class="list-sub">
                ${esc(log.tenantName || 'Platform')}${log.entity ? ` · ${esc(log.entity)}` : ''}${log.detail ? '' : ''}
              </div>
              ${log.detail ? `<details style="margin-top:6px">
                <summary class="tiny" style="cursor:pointer;color:var(--brand);font-weight:700">Butiran</summary>
                <pre class="mono tiny" style="margin:6px 0 0;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px;overflow-x:auto;color:var(--ink-2)">${esc(JSON.stringify(log.detail, null, 2))}</pre>
              </details>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
    } catch (err) {
      listEl.innerHTML = `<div class="empty"><div class="empty-title">Ralat</div><div class="empty-text">${esc(err.message)}</div></div>`;
      toast(err.message, 'error');
    }
  }

  root.querySelector('#tenantFilter').addEventListener('change', (e) => {
    view.tenantId = e.target.value;
    load();
  });
  root.querySelector('#auditSearch').addEventListener('input', debounce((e) => {
    view.q = e.target.value.trim();
    load();
  }, 350));

  await load();
}

function iconFor(action = '') {
  if (action.includes('order')) return 'receipt';
  if (action.includes('tenant')) return 'store';
  if (action.includes('user') || action.includes('auth')) return 'user';
  if (action.includes('kuih')) return 'store';
  if (action.includes('ingredient')) return 'box';
  if (action.includes('recipe')) return 'calculator';
  if (action.includes('settings')) return 'sliders';
  return 'activity';
}

function actionLabel(action = '') {
  const map = {
    'auth.login': 'log masuk',
    'auth.login_failed': 'cubaan log masuk gagal',
    'auth.password_changed': 'tukar kata laluan',
    'order.created': 'pesanan baharu direkod',
    'order.status_changed': 'status pesanan dikemas kini',
    'kuih.created': 'menu ditambah',
    'kuih.updated': 'menu dikemas kini',
    'kuih.archived': 'menu diarkibkan',
    'ingredient.created': 'bahan ditambah',
    'ingredient.price_updated': 'harga bahan dikemas kini',
    'ingredient.deleted': 'bahan dipadam',
    'recipe.created': 'resipi ditambah',
    'recipe.updated': 'resipi dikemas kini',
    'recipe.deleted': 'resipi dipadam',
    'recipe.created.cost_synced': 'kos menu disegerak',
    'recipe.updated.cost_synced': 'kos menu disegerak',
    'tenant.created': 'kedai didaftarkan',
    'tenant.updated': 'kedai dikemas kini',
    'user.created': 'pengguna ditambah',
    'user.updated': 'pengguna dikemas kini',
    'user.deleted': 'pengguna dipadam',
    'user.password_reset': 'kata laluan direset',
    'settings.updated': 'tetapan platform dikemas kini',
    'system.seeded': 'data demo dimuatkan'
  };
  return map[action] || action;
}

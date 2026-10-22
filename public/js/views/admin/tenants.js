import { get, post, patch } from '../../core/api.js';
import { money, num, pct, dateLabel } from '../../core/format.js';
import { esc, toast, openModal, openDrawer, confirmDialog, emptyState, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Pengurusan Peniaga';

export async function render(root, ctx) {
  const tenants = await get('/api/admin/tenants');
  const totalGross = tenants.reduce((s, t) => s + t.grossCents, 0);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Peniaga</h2>
        <p class="page-sub">${tenants.length} kedai berdaftar · ${money(totalGross)} jumlah jualan terkumpul.</p>
      </div>
      <button class="btn btn-primary" id="addTenant">${icon('plus')} Daftar peniaga</button>
    </div>

    <section class="card">
      <div class="card-head">
        <div><div class="card-title">Senarai kedai</div><div class="card-sub">Statistik dikira daripada semua pesanan</div></div>
        <span class="chip">${icon('store')} ${tenants.filter((t) => t.status === 'active').length} aktif</span>
      </div>
      ${tenants.length ? `<div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Kedai</th><th>Pemilik</th><th class="right">Pengguna</th><th class="right">Pesanan</th>
            <th class="right">Jualan</th><th class="right">Untung</th><th>Status</th><th class="center">Tindakan</th>
          </tr></thead>
          <tbody>
            ${tenants.map((t) => `
              <tr>
                <td>
                  <div class="cell-main">${esc(t.name)}</div>
                  <div class="cell-sub mono">/order/${esc(t.slug)}</div>
                </td>
                <td>
                  <div class="small">${esc(t.ownerName || '—')}</div>
                  <div class="cell-sub">${esc(t.location || '')}</div>
                </td>
                <td class="right num">${num(t.userCount)}</td>
                <td class="right num">${num(t.orders)}</td>
                <td class="right num strong">${money(t.grossCents)}</td>
                <td class="right num" style="color:var(--green)">${money(t.netCents)}</td>
                <td><span class="badge ${t.status === 'active' ? 'badge-green' : 'badge-slate'}">${t.status === 'active' ? 'Aktif' : 'Digantung'}</span></td>
                <td class="center">
                  <div class="row" style="justify-content:center;gap:4px">
                    <button class="icon-btn bordered sm" data-menu="${esc(t.id)}" title="Lihat menu">${icon('store')}</button>
                    <button class="icon-btn bordered sm" data-edit="${esc(t.id)}" title="Edit kedai">${icon('edit')}</button>
                    <button class="icon-btn bordered sm ${t.status === 'active' ? 'danger' : ''}" data-toggle="${esc(t.id)}" title="${t.status === 'active' ? 'Gantung kedai' : 'Aktifkan kedai'}">
                      ${icon(t.status === 'active' ? 'lock' : 'check')}
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState({
        iconName: 'store',
        title: 'Belum ada peniaga',
        text: 'Daftarkan kedai pertama untuk mula menggunakan platform.',
        action: '<button class="btn btn-primary btn-sm mt-8" id="emptyAdd">Daftar peniaga</button>'
      })}
    </section>

    <div class="callout callout-blue mt-16" style="display:flex;gap:8px;align-items:flex-start">
      ${icon('info')}
      <span>Menggantung kedai menghalang peniaga daripada mengakses sistem, tetapi semua data pesanan, menu dan resipi kekal tersimpan.</span>
    </div>`;

  const openAdd = () => openTenantModal({ ctx });
  root.querySelector('#addTenant')?.addEventListener('click', openAdd);
  root.querySelector('#emptyAdd')?.addEventListener('click', openAdd);

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tenant = tenants.find((t) => t.id === btn.dataset.edit);
      openTenantModal({ ctx, tenant });
    });
  });

  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tenant = tenants.find((t) => t.id === btn.dataset.toggle);
      const suspend = tenant.status === 'active';
      const ok = await confirmDialog({
        title: suspend ? 'Gantung kedai?' : 'Aktifkan semula kedai?',
        message: suspend
          ? `“${tenant.name}” tidak akan dapat log masuk atau menerima tempahan baharu sehingga diaktifkan semula.`
          : `“${tenant.name}” akan mendapat akses semula ke sistem.`,
        confirmLabel: suspend ? 'Gantung' : 'Aktifkan',
        danger: suspend
      });
      if (!ok) return;
      try {
        await patch(`/api/admin/tenants/${tenant.id}`, { status: suspend ? 'suspended' : 'active' });
        toast(suspend ? 'Kedai digantung.' : 'Kedai diaktifkan semula.');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tenant = tenants.find((t) => t.id === btn.dataset.menu);
      try {
        const data = await get(`/api/admin/tenants/${tenant.id}/menu`);
        openDrawer({
          title: esc(data.tenant.name),
          subtitle: `${data.kuih.length} menu · ${data.recipes.length} resipi`,
          body: `
            <div class="stack" style="gap:12px">
              ${data.kuih.length ? data.kuih.map((k) => `
                <div class="card card-pad" style="box-shadow:none">
                  <div class="between">
                    <div>
                      <div class="strong small">${esc(k.name)}</div>
                      <div class="tiny muted">${esc(k.description || '')}</div>
                    </div>
                    <div class="right">
                      <div class="small strong">${money(k.priceCents)}</div>
                      <div class="tiny" style="color:var(--red)">kos ${money(k.costCents)}</div>
                    </div>
                  </div>
                  <div class="between mt-8">
                    <span class="badge ${k.status === 'active' ? 'badge-green' : 'badge-slate'}">${k.status === 'active' ? 'Aktif' : 'Diarkibkan'}</span>
                    <span class="tiny muted">${pct(k.priceCents ? ((k.priceCents - k.costCents) / k.priceCents) * 100 : 0, 1)} margin</span>
                  </div>
                </div>`).join('') : '<div class="tiny muted">Tiada menu.</div>'}
            </div>`
        });
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function openTenantModal({ ctx, tenant = null }) {
  const isEdit = Boolean(tenant);
  const modal = openModal({
    title: isEdit ? 'Edit kedai' : 'Daftar peniaga baharu',
    subtitle: isEdit ? tenant.slug : 'Kedai baharu akan muncul dalam senarai peniaga',
    body: `
      <div class="stack" style="gap:12px">
        <div class="field">
          <label class="label">Nama kedai <span class="req">*</span></label>
          <input class="input" id="tnName" value="${esc(tenant?.name || '')}" placeholder="Contoh: Kak Ani Kuih Tradisional">
        </div>
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">Nama pemilik</label>
            <input class="input" id="tnOwner" value="${esc(tenant?.ownerName || '')}" placeholder="Ani Zaleha">
          </div>
          <div class="field">
            <label class="label">Telefon</label>
            <input class="input" id="tnPhone" value="${esc(tenant?.phone || '')}" placeholder="013-9876543">
          </div>
        </div>
        <div class="field">
          <label class="label">Lokasi</label>
          <input class="input" id="tnLocation" value="${esc(tenant?.location || '')}" placeholder="Kampung Baru, Kuala Lumpur">
        </div>
        <div class="field">
          <label class="label">Tagline</label>
          <input class="input" id="tnTagline" value="${esc(tenant?.tagline || '')}" placeholder="Kuih tradisional segar setiap pagi">
        </div>
        <div class="field">
          <label class="label">Slug pautan awam</label>
          <div class="input-group">
            <span class="prefix">/order/</span>
            <input class="input" id="tnSlug" value="${esc(tenant?.slug || '')}" placeholder="kak-ani">
          </div>
          <span class="hint">Kosongkan untuk dijana daripada nama kedai.</span>
        </div>
        ${isEdit ? `<div class="field">
          <label class="label">Status</label>
          <select class="select" id="tnStatus">
            <option value="active" ${tenant.status === 'active' ? 'selected' : ''}>Aktif</option>
            <option value="suspended" ${tenant.status === 'suspended' ? 'selected' : ''}>Digantung</option>
          </select>
        </div>` : ''}
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>${isEdit ? 'Simpan' : 'Daftar kedai'}</button>`
  });

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: modal.root.querySelector('#tnName').value.trim(),
      ownerName: modal.root.querySelector('#tnOwner').value.trim(),
      phone: modal.root.querySelector('#tnPhone').value.trim(),
      location: modal.root.querySelector('#tnLocation').value.trim(),
      tagline: modal.root.querySelector('#tnTagline').value.trim()
    };
    if (!payload.name) { toast('Nama kedai diperlukan.', 'error'); return; }
    if (isEdit) {
      payload.slug = modal.root.querySelector('#tnSlug').value.trim();
      payload.status = modal.root.querySelector('#tnStatus').value;
    }

    setBusy(btn, true, 'Menyimpan…');
    try {
      if (isEdit) await patch(`/api/admin/tenants/${tenant.id}`, payload);
      else await post('/api/admin/tenants', payload);
      toast(isEdit ? 'Kedai dikemas kini.' : 'Kedai didaftarkan.');
      modal.close();
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

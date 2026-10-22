import { get, post, patch, del } from '../../core/api.js';
import { esc, toast, openModal, confirmDialog, emptyState, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { initials, num, stampLabel } from '../../core/format.js';

export const title = 'Pengguna';

export async function render(root, ctx) {
  const [users, tenants] = await Promise.all([get('/api/admin/users'), get('/api/admin/tenants')]);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  const admins = users.filter((u) => u.role === 'admin').length;
  const inactive = users.filter((u) => u.status !== 'active').length;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Pengguna sistem</h2>
        <p class="page-sub">Urus akses peniaga dan pentadbir platform.</p>
      </div>
      <button class="btn btn-primary" id="addUser">${icon('plus')} Tambah pengguna</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Jumlah pengguna</span><span class="stat-icon tone-blue">${icon('users')}</span></div>
        <div class="stat-value">${num(users.length)}</div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Akaun peniaga</span><span class="stat-icon tone-amber">${icon('store')}</span></div>
        <div class="stat-value">${num(users.length - admins)}</div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Pentadbir</span><span class="stat-icon tone-violet">${icon('shield')}</span></div>
        <div class="stat-value">${num(admins)}</div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Tidak aktif</span><span class="stat-icon tone-red">${icon('lock')}</span></div>
        <div class="stat-value">${num(inactive)}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <div><div class="card-title">Senarai akaun</div><div class="card-sub">Kata laluan disimpan sebagai hash scrypt</div></div>
        <span class="badge badge-slate">${users.length} akaun</span>
      </div>
      ${users.length ? `<div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Pengguna</th><th>Peranan</th><th>Kedai</th><th>Status</th><th>Log masuk terakhir</th><th class="center">Tindakan</th>
          </tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td>
                  <div class="row" style="gap:9px">
                    <div class="avatar ${u.role === 'admin' ? 'avatar-dark' : 'avatar-amber'}" style="width:30px;height:30px;border-radius:9px;font-size:10px">${initials(u.name)}</div>
                    <div>
                      <div class="cell-main">${esc(u.name)}</div>
                      <div class="cell-sub">${esc(u.email)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-violet' : 'badge-blue'}">${u.role === 'admin' ? 'Pentadbir' : 'Peniaga'}</span></td>
                <td class="small">${esc(u.tenantName || '—')}</td>
                <td><span class="badge ${u.status === 'active' ? 'badge-green' : 'badge-slate'}">${u.status === 'active' ? 'Aktif' : 'Tidak aktif'}</span></td>
                <td class="cell-sub">${esc(u.lastLoginAt ? stampLabel(u.lastLoginAt) : 'Belum log masuk')}</td>
                <td class="center">
                  <div class="row" style="justify-content:center;gap:4px">
                    <button class="icon-btn bordered sm" data-edit="${esc(u.id)}" title="Edit">${icon('edit')}</button>
                    <button class="icon-btn bordered sm" data-reset="${esc(u.id)}" title="Reset kata laluan">${icon('lock')}</button>
                    ${u.id === ctx.user.id ? '' : `<button class="icon-btn bordered sm danger" data-del="${esc(u.id)}" title="Padam">${icon('trash')}</button>`}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState({ iconName: 'users', title: 'Tiada pengguna', text: 'Tambah akaun peniaga pertama.' })}
    </section>`;

  const openAdd = () => openUserModal({ ctx, tenants });
  root.querySelector('#addUser').addEventListener('click', openAdd);

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = users.find((u) => u.id === btn.dataset.edit);
      openUserModal({ ctx, tenants, user });
    });
  });

  root.querySelectorAll('[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = users.find((u) => u.id === btn.dataset.reset);
      openResetModal({ ctx, user });
    });
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const user = users.find((u) => u.id === btn.dataset.del);
      const ok = await confirmDialog({
        title: 'Padam pengguna?',
        message: `Akaun ${user.name} (${user.email}) akan dipadam. Data pesanan kedai tidak terjejas.`,
        confirmLabel: 'Padam akaun',
        danger: true
      });
      if (!ok) return;
      try {
        await del(`/api/admin/users/${user.id}`);
        toast('Akaun dipadam.');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function openUserModal({ ctx, tenants, user = null }) {
  const isEdit = Boolean(user);
  const modal = openModal({
    title: isEdit ? 'Edit pengguna' : 'Tambah pengguna',
    subtitle: isEdit ? user.email : 'Pengguna peniaga perlu dikaitkan dengan kedai',
    body: `
      <div class="stack" style="gap:12px">
        <div class="field">
          <label class="label">Nama penuh <span class="req">*</span></label>
          <input class="input" id="uName" value="${esc(user?.name || '')}" placeholder="Ani Zaleha">
        </div>
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">E-mel <span class="req">*</span></label>
            <input class="input" id="uEmail" type="email" value="${esc(user?.email || '')}" placeholder="nama@kedai.com">
          </div>
          <div class="field">
            <label class="label">Peranan</label>
            <select class="select" id="uRole">
              <option value="user" ${user?.role !== 'admin' ? 'selected' : ''}>Peniaga</option>
              <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Pentadbir</option>
            </select>
          </div>
        </div>
        <div class="field" id="tenantField">
          <label class="label">Kedai</label>
          <select class="select" id="uTenant">
            <option value="">— Pilih kedai —</option>
            ${tenants.map((t) => `<option value="${esc(t.id)}" ${user?.tenantId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">${isEdit ? 'Kata laluan baru (pilihan)' : 'Kata laluan'} ${isEdit ? '' : '<span class="req">*</span>'}</label>
          <input class="input" id="uPassword" type="password" autocomplete="new-password" placeholder="${isEdit ? 'Biarkan kosong untuk kekalkan' : 'Minimum 6 aksara'}">
        </div>
        ${isEdit ? `<div class="field">
          <label class="label">Status</label>
          <select class="select" id="uStatus">
            <option value="active" ${user.status === 'active' ? 'selected' : ''}>Aktif</option>
            <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Tidak aktif</option>
          </select>
        </div>` : ''}
        ${user?.id === ctx.user.id ? '<div class="callout callout-amber">Anda tidak boleh mengubah peranan atau status akaun sendiri.</div>' : ''}
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>${isEdit ? 'Simpan' : 'Tambah pengguna'}</button>`
  });

  const roleSel = modal.root.querySelector('#uRole');
  const tenantField = modal.root.querySelector('#tenantField');
  const syncRole = () => { tenantField.style.display = roleSel.value === 'admin' ? 'none' : ''; };
  roleSel.addEventListener('change', syncRole);
  syncRole();

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: modal.root.querySelector('#uName').value.trim(),
      email: modal.root.querySelector('#uEmail').value.trim(),
      role: roleSel.value,
      tenantId: tenantField.style.display === 'none' ? null : (modal.root.querySelector('#uTenant').value || null)
    };
    const password = modal.root.querySelector('#uPassword').value;
    if (isEdit) payload.status = modal.root.querySelector('#uStatus').value;

    if (!payload.name || !payload.email) { toast('Nama dan e-mel diperlukan.', 'error'); return; }
    if (!isEdit && !password) { toast('Kata laluan diperlukan untuk akaun baru.', 'error'); return; }
    if (payload.role === 'user' && !payload.tenantId) { toast('Pilih kedai untuk akaun peniaga.', 'error'); return; }
    if (password) payload.password = password;

    setBusy(btn, true, 'Menyimpan…');
    try {
      if (isEdit) await patch(`/api/admin/users/${user.id}`, payload);
      else await post('/api/admin/users', payload);
      toast(isEdit ? 'Pengguna dikemas kini.' : 'Pengguna ditambah.');
      modal.close();
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

function openResetModal({ ctx, user }) {
  const modal = openModal({
    title: 'Reset kata laluan',
    subtitle: `${user.name} · ${user.email}`,
    body: `
      <div class="stack" style="gap:12px">
        <div class="field">
          <label class="label">Kata laluan baru</label>
          <input class="input" id="newPw" type="password" autocomplete="new-password" placeholder="Minimum 6 aksara">
        </div>
        <div class="callout callout-amber">Semua sesi aktif pengguna ini akan ditamatkan selepas reset.</div>
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>Reset kata laluan</button>`
  });

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const password = modal.root.querySelector('#newPw').value;
    if (password.length < 6) { toast('Kata laluan minimum 6 aksara.', 'error'); return; }
    setBusy(btn, true, 'Memproses…');
    try {
      await patch(`/api/admin/users/${user.id}`, { password });
      toast('Kata laluan direset.');
      modal.close();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

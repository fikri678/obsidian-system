import { get, patch, post } from '../../core/api.js';
import { esc, toast, copyText, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { dateLabel, initials } from '../../core/format.js';
import { publicOrderUrl, state } from '../../core/state.js';

export const title = 'Tetapan Kedai';

export async function render(root, ctx) {
  const tenant = await get('/api/tenant');
  const link = publicOrderUrl();

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Tetapan kedai</h2>
        <p class="page-sub">Maklumat kedai dipaparkan pada borang pesanan pelanggan dan mesej WhatsApp.</p>
      </div>
      <span class="badge badge-green"><span class="dot"></span>Kedai aktif</span>
    </div>

    <div class="grid grid-split">
      <div class="stack" style="gap:16px">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Profil kedai</div>
              <div class="card-sub">Maklumat asas perniagaan</div>
            </div>
            <div class="avatar avatar-amber">${initials(tenant.name)}</div>
          </div>
          <div class="card-body stack" style="gap:12px">
            <div class="grid grid-2" style="gap:10px">
              <div class="field">
                <label class="label">Nama kedai</label>
                <input class="input" id="tName" value="${esc(tenant.name)}">
              </div>
              <div class="field">
                <label class="label">Nama pemilik</label>
                <input class="input" id="tOwner" value="${esc(tenant.ownerName)}">
              </div>
            </div>
            <div class="grid grid-2" style="gap:10px">
              <div class="field">
                <label class="label">Nombor telefon</label>
                <input class="input" id="tPhone" value="${esc(tenant.phone)}">
              </div>
              <div class="field">
                <label class="label">Lokasi</label>
                <input class="input" id="tLocation" value="${esc(tenant.location)}">
              </div>
            </div>
            <div class="field">
              <label class="label">Tagline kedai</label>
              <input class="input" id="tTagline" value="${esc(tenant.tagline)}" placeholder="Kuih tradisional segar setiap pagi">
            </div>
            <div class="between" style="margin-top:4px">
              <span class="tiny muted">Didaftarkan ${esc(dateLabel(tenant.createdAt?.slice(0, 10)))} · slug <span class="mono">${esc(tenant.slug)}</span></span>
              <button class="btn btn-primary" id="saveProfile">Simpan profil</button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Keselamatan akaun</div>
              <div class="card-sub">${esc(ctx.user.email)}</div>
            </div>
            <span class="badge badge-slate">${ctx.user.role === 'admin' ? 'Pentadbir' : 'Peniaga'}</span>
          </div>
          <div class="card-body stack" style="gap:12px">
            <div class="grid grid-3" style="gap:10px">
              <div class="field">
                <label class="label">Kata laluan semasa</label>
                <input class="input" id="pwCurrent" type="password" autocomplete="current-password">
              </div>
              <div class="field">
                <label class="label">Kata laluan baru</label>
                <input class="input" id="pwNew" type="password" autocomplete="new-password">
              </div>
              <div class="field">
                <label class="label">Sahkan kata laluan</label>
                <input class="input" id="pwConfirm" type="password" autocomplete="new-password">
              </div>
            </div>
            <div class="between">
              <span class="tiny muted">Selepas perubahan, anda perlu log masuk semula pada semua peranti.</span>
              <button class="btn btn-dark" id="savePassword">${icon('lock')} Tukar kata laluan</button>
            </div>
          </div>
        </section>
      </div>

      <aside class="stack" style="gap:16px">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Borang pesanan pelanggan</div>
              <div class="card-sub">Kongsi pautan ini dengan pelanggan</div>
            </div>
            <span class="badge badge-amber">Awam</span>
          </div>
          <div class="card-body">
            <div class="field">
              <label class="label">Pautan awam</label>
              <input class="input mono" id="publicUrl" value="${esc(link)}" readonly style="font-size:11px">
            </div>
            <div class="row wrap mt-12">
              <button class="btn btn-primary btn-sm" id="copyUrl">${icon('copy')} Salin pautan</button>
              <a class="btn btn-ghost btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('external')} Buka</a>
            </div>
            <div class="callout callout-blue mt-16" style="font-size:11px">
              Pelanggan boleh memilih kuih, slot pengambilan dan menghantar tempahan tanpa perlu log masuk. Pesanan terus masuk ke senarai anda.
            </div>
          </div>
        </section>

        <section class="card card-pad">
          <div class="upper muted" style="margin-bottom:10px">Ringkasan kedai</div>
          <div class="summary-row"><span>Peranan akaun</span><span class="strong">${ctx.user.role === 'admin' ? 'Pentadbir' : 'Peniaga'}</span></div>
          <div class="summary-row"><span>Nama pengguna</span><span class="strong">${esc(ctx.user.name)}</span></div>
          <div class="summary-row"><span>E-mel</span><span class="strong">${esc(ctx.user.email)}</span></div>
          <div class="summary-row"><span>ID kedai</span><span class="mono tiny">${esc(tenant.id)}</span></div>
          <div class="summary-row"><span>Status</span><span class="badge badge-green">Aktif</span></div>
        </section>

        <div class="callout callout-amber" style="display:flex;gap:8px;align-items:flex-start">
          ${icon('info')}
          <span>Perubahan nama kedai akan dipaparkan serta-merta pada borang pelanggan dan mesej pengesahan WhatsApp.</span>
        </div>
      </aside>
    </div>`;

  root.querySelector('#copyUrl').addEventListener('click', async () => {
    const ok = await copyText(link);
    toast(ok ? 'Pautan disalin.' : link, ok ? 'success' : 'info');
  });

  root.querySelector('#saveProfile').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Menyimpan…');
    try {
      await patch('/api/tenant', {
        name: root.querySelector('#tName').value.trim(),
        ownerName: root.querySelector('#tOwner').value.trim(),
        phone: root.querySelector('#tPhone').value.trim(),
        location: root.querySelector('#tLocation').value.trim(),
        tagline: root.querySelector('#tTagline').value.trim()
      });
      toast('Profil kedai dikemas kini.');
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });

  root.querySelector('#savePassword').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const current = root.querySelector('#pwCurrent').value;
    const next = root.querySelector('#pwNew').value;
    const confirm = root.querySelector('#pwConfirm').value;

    if (!current || !next) { toast('Sila isi kata laluan semasa dan baru.', 'error'); return; }
    if (next !== confirm) { toast('Pengesahan kata laluan tidak sepadan.', 'error'); return; }
    if (next.length < 6) { toast('Kata laluan baru mesti sekurang-kurangnya 6 aksara.', 'error'); return; }

    setBusy(btn, true, 'Menukar…');
    try {
      await post('/api/auth/password', { currentPassword: current, newPassword: next });
      toast('Kata laluan ditukar. Sila log masuk semula.');
      setTimeout(() => location.replace('/'), 1200);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

import { get, patch } from '../../core/api.js';
import { esc, toast, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { timeLabel } from '../../core/format.js';

export const title = 'Tetapan Platform';

export async function render(root, ctx) {
  const config = await get('/api/admin/settings');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Tetapan platform</h2>
        <p class="page-sub">Konfigurasi umum yang digunakan oleh semua kedai dan borang pelanggan.</p>
      </div>
      <span class="badge badge-slate">${esc(config.platformName)}</span>
    </div>

    <div class="grid grid-split">
      <section class="card">
        <div class="card-head">
          <div><div class="card-title">Identiti platform</div><div class="card-sub">Dipaparkan pada halaman log masuk & borang awam</div></div>
          <div class="stat-icon tone-amber">${icon('sparkles')}</div>
        </div>
        <div class="card-body stack" style="gap:14px">
          <div class="field">
            <label class="label">Nama platform</label>
            <input class="input" id="pName" value="${esc(config.platformName)}">
          </div>
          <div class="field">
            <label class="label">Tagline</label>
            <input class="input" id="pTagline" value="${esc(config.platformTagline)}">
          </div>
          <div class="field">
            <label class="label">Ambang amaran margin (%)</label>
            <input class="input" id="pMargin" type="number" min="0" max="95" value="${Number(config.lowMarginThresholdPct || 35)}">
            <span class="hint">Kuih dengan margin di bawah nilai ini akan ditandakan pada papan pemuka peniaga.</span>
          </div>

          <div style="border-top:1px solid var(--line);padding-top:14px">
            <div class="between" style="margin-bottom:8px">
              <div>
                <div class="label">Slot pengambilan</div>
                <div class="hint">Masa yang boleh dipilih pelanggan</div>
              </div>
              <button class="btn btn-ghost btn-sm" id="addSlot">${icon('plus')} Tambah slot</button>
            </div>
            <div class="row wrap" id="slots" style="gap:8px">
              ${(config.pickupSlots || []).map((slot) => slotChip(slot)).join('')}
            </div>
          </div>

          <div class="between" style="margin-top:4px">
            <span class="tiny muted">Perubahan digunakan serta-merta untuk semua kedai.</span>
            <button class="btn btn-primary" id="saveSettings">Simpan tetapan</button>
          </div>
        </div>
      </section>

      <aside class="stack" style="gap:16px">
        <section class="card card-pad">
          <div class="upper muted" style="margin-bottom:10px">Pratonton borang awam</div>
          <div class="card" style="box-shadow:none;background:var(--surface-2);padding:14px">
            <div class="row" style="gap:8px">
              <div class="avatar avatar-dark">${esc((config.platformName || 'O')[0])}</div>
              <div>
                <div class="small strong">${esc(config.platformName)}</div>
                <div class="tiny muted">${esc(config.platformTagline)}</div>
              </div>
            </div>
            <div class="row wrap mt-12" style="gap:6px">
              ${(config.pickupSlots || []).map((s) => `<span class="chip tiny">${esc(timeLabel(s))}</span>`).join('')}
            </div>
          </div>
          <div class="tiny muted mt-12">Slot disusun secara automatik mengikut masa.</div>
        </section>

        <section class="card card-pad">
          <div class="upper muted" style="margin-bottom:10px">Maklumat sistem</div>
          <div class="summary-row"><span>Versi</span><span class="strong">1.0.0</span></div>
          <div class="summary-row"><span>Pangkalan data</span><span class="strong">SQLite (sedia PostgreSQL)</span></div>
          <div class="summary-row"><span>Peranan</span><span class="strong">Pentadbir · Peniaga</span></div>
          <div class="summary-row"><span>Penyimpanan wang</span><span class="strong">Integer sen</span></div>
        </section>

        <div class="callout callout-blue" style="display:flex;gap:8px;align-items:flex-start">
          ${icon('shield')}
          <span>Semua kata laluan di-hash dengan scrypt. Sesi menggunakan cookie HttpOnly dan tamat dalam 7 hari.</span>
        </div>
      </aside>
    </div>`;

  const slotsHost = root.querySelector('#slots');

  function slotChip(value) {
    return `<span class="chip" data-slot style="padding:3px 6px 3px 10px;gap:4px">
      <input type="time" value="${esc(value)}" class="slot-input" style="border:0;background:transparent;font-size:11px;font-weight:700;width:82px;outline:none">
      <button type="button" class="icon-btn sm danger" data-remove-slot title="Buang slot">${icon('x')}</button>
    </span>`;
  }

  function bindSlots() {
    slotsHost.querySelectorAll('[data-remove-slot]').forEach((btn) => {
      btn.onclick = () => {
        if (slotsHost.querySelectorAll('[data-slot]').length <= 1) {
          toast('Sekurang-kurangnya satu slot diperlukan.', 'info');
          return;
        }
        btn.closest('[data-slot]').remove();
      };
    });
  }
  bindSlots();

  root.querySelector('#addSlot').addEventListener('click', () => {
    const tmp = document.createElement('div');
    tmp.innerHTML = slotChip('12:00');
    slotsHost.appendChild(tmp.firstElementChild);
    bindSlots();
  });

  root.querySelector('#saveSettings').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const slots = [...slotsHost.querySelectorAll('.slot-input')].map((i) => i.value).filter(Boolean);
    if (!slots.length) { toast('Masukkan sekurang-kurangnya satu slot masa.', 'error'); return; }

    setBusy(btn, true, 'Menyimpan…');
    try {
      await patch('/api/admin/settings', {
        platformName: root.querySelector('#pName').value.trim(),
        platformTagline: root.querySelector('#pTagline').value.trim(),
        lowMarginThresholdPct: Number(root.querySelector('#pMargin').value || 35),
        pickupSlots: slots
      });
      toast('Tetapan platform disimpan.');
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

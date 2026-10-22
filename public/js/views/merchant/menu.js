import { get, post, patch, del } from '../../core/api.js';
import { money, marginPct, emojiFor } from '../../core/format.js';
import { esc, toast, openModal, confirmDialog, emptyState, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Menu Kuih';

export async function render(root, ctx) {
  const showAll = ctx.params.all === '1';
  const menu = await get(`/api/kuih${showAll ? '?all=1' : ''}`);

  const active = menu.filter((m) => m.status === 'active');
  const bestMargin = active.length ? Math.max(...active.map((m) => marginPct(m.priceCents, m.costCents))) : 0;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Menu kuih</h2>
        <p class="page-sub">${active.length} menu aktif · harga jualan dan kos seunit digunakan dalam setiap pesanan.</p>
      </div>
      <div class="row wrap">
        <label class="chip" style="cursor:pointer;gap:8px">
          <input type="checkbox" id="showAll" ${showAll ? 'checked' : ''} style="accent-color:var(--brand)">
          Tunjuk yang diarkibkan
        </label>
        <button class="btn btn-primary" id="addMenu">${icon('plus')} Tambah kuih</button>
      </div>
    </div>

    ${menu.length ? `<div class="grid grid-3">
      ${menu.map((k) => {
        const margin = marginPct(k.priceCents, k.costCents);
        const isBest = margin === bestMargin && k.status === 'active';
        return `
        <article class="card hover" style="overflow:hidden;${k.status !== 'active' ? 'opacity:.62' : ''}">
          <div class="card-body" style="padding:18px">
            <div class="between" style="align-items:flex-start">
              <div class="menu-emoji" style="width:44px;height:44px;font-size:21px">${emojiFor(k.name)}</div>
              <div class="row" style="gap:4px">
                ${isBest ? '<span class="badge badge-green">Margin terbaik</span>' : ''}
                ${k.status !== 'active' ? '<span class="badge badge-slate">Diarkibkan</span>' : ''}
                <button class="icon-btn bordered sm" data-edit="${esc(k.id)}" title="Edit">${icon('edit')}</button>
              </div>
            </div>
            <div class="strong" style="font-size:14px;margin-top:12px">${esc(k.name)}</div>
            <div class="tiny muted" style="margin-top:3px;min-height:32px;line-height:1.45">${esc(k.description || 'Tiada deskripsi.')}</div>

            <div class="grid grid-2" style="gap:8px;margin-top:12px">
              <div class="metric-box" style="padding:9px 11px">
                <div class="label">Harga jual</div>
                <div class="strong" style="font-size:14px">${money(k.priceCents)}</div>
              </div>
              <div class="metric-box" style="padding:9px 11px">
                <div class="label">Kos seunit</div>
                <div class="strong" style="font-size:14px;color:var(--red)">${money(k.costCents)}</div>
              </div>
            </div>

            <div class="between" style="margin-top:12px">
              <span class="tiny muted">Untung ${money(k.priceCents - k.costCents)} / ${esc(k.unit || 'biji')}</span>
              <span class="badge ${margin >= 35 ? 'badge-green' : margin >= 25 ? 'badge-amber' : 'badge-red'}">${margin}%</span>
            </div>
            <div class="bar-line" style="margin-top:6px"><span style="width:${Math.max(2, Math.min(100, margin))}%"></span></div>
          </div>
          <div class="card-foot between" style="padding:11px 18px">
            <span class="tiny muted">${esc(k.unit || 'biji')} · susunan ${k.sortOrder + 1}</span>
            <div class="row" style="gap:6px">
              ${k.status === 'active' ? `<button class="link tiny" data-archive="${esc(k.id)}">Arkib</button>` : ''}
            </div>
          </div>
        </article>`;
      }).join('')}
    </div>` : `<div class="card">${emptyState({
      iconName: 'store',
      title: 'Menu masih kosong',
      text: 'Tambah kuih pertama anda dengan harga jualan dan kos seunit.',
      action: '<button class="btn btn-primary mt-8" id="emptyAdd">Tambah kuih</button>'
    })}</div>`}

    <div class="callout callout-blue mt-16" style="display:flex;gap:8px;align-items:flex-start">
      ${icon('info')}
      <span>Kos seunit boleh diambil automatik daripada resipi di halaman <b>Kalkulator & Resipi</b>. Harga lama pada pesanan sedia ada tidak berubah kerana setiap pesanan menyimpan snapshot harga.</span>
    </div>`;

  root.querySelector('#showAll').addEventListener('change', (e) => {
    ctx.navigate(`/menu${e.target.checked ? '?all=1' : ''}`);
  });

  const openAdd = () => openMenuModal({ ctx, menu });
  root.querySelector('#addMenu')?.addEventListener('click', openAdd);
  root.querySelector('#emptyAdd')?.addEventListener('click', openAdd);
  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openMenuModal({ ctx, menu, kuih: menu.find((m) => m.id === btn.dataset.edit) }));
  });
  root.querySelectorAll('[data-archive]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kuih = menu.find((m) => m.id === btn.dataset.archive);
      const ok = await confirmDialog({
        title: 'Arkibkan kuih?',
        message: `“${kuih.name}” tidak lagi muncul dalam borang pesanan. Rekod pesanan lama kekal.`,
        confirmLabel: 'Arkibkan',
        danger: true
      });
      if (!ok) return;
      try {
        await del(`/api/kuih/${kuih.id}`);
        toast('Kuih diarkibkan.');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function openMenuModal({ ctx, menu, kuih = null }) {
  const isEdit = Boolean(kuih);
  const modal = openModal({
    title: isEdit ? 'Edit menu kuih' : 'Tambah menu kuih',
    subtitle: 'Harga & kos dalam Ringgit Malaysia',
    body: `
      <div class="stack" style="gap:12px">
        <div class="field">
          <label class="label">Nama kuih <span class="req">*</span></label>
          <input class="input" id="kuihName" value="${esc(kuih?.name || '')}" placeholder="Contoh: Karipap Pusing Daging">
        </div>
        <div class="field">
          <label class="label">Deskripsi</label>
          <input class="input" id="kuihDesc" value="${esc(kuih?.description || '')}" placeholder="Kulit berlapis, inti daging & kentang">
        </div>
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">Harga jual (RM) <span class="req">*</span></label>
            <input class="input" id="kuihPrice" type="number" min="0" step="0.10" value="${kuih ? (kuih.priceCents / 100).toFixed(2) : ''}" placeholder="1.00">
          </div>
          <div class="field">
            <label class="label">Kos seunit (RM)</label>
            <input class="input" id="kuihCost" type="number" min="0" step="0.10" value="${kuih ? (kuih.costCents / 100).toFixed(2) : '0.00'}">
          </div>
        </div>
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">Unit</label>
            <input class="input" id="kuihUnit" value="${esc(kuih?.unit || 'biji')}" placeholder="biji / potong / batang">
          </div>
          <div class="field">
            <label class="label">Susunan paparan</label>
            <input class="input" id="kuihSort" type="number" min="0" value="${kuih?.sortOrder ?? menu.length}">
          </div>
        </div>
        <div class="metric-box" style="display:flex;justify-content:space-between;align-items:center">
          <div><div class="label">Margin seunit</div><div class="tiny muted">Dikira semula secara automatik</div></div>
          <div class="strong" id="marginPreview" style="font-size:17px;color:var(--green)">0%</div>
        </div>
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>${isEdit ? 'Simpan perubahan' : 'Tambah kuih'}</button>`
  });

  const priceEl = modal.root.querySelector('#kuihPrice');
  const costEl = modal.root.querySelector('#kuihCost');
  const preview = modal.root.querySelector('#marginPreview');
  const calc = () => {
    const price = Number(priceEl.value) || 0;
    const cost = Number(costEl.value) || 0;
    const m = marginPct(Math.round(price * 100), Math.round(cost * 100));
    preview.textContent = `${m}%`;
    preview.style.color = m >= 35 ? 'var(--green)' : m >= 25 ? 'var(--brand)' : 'var(--red)';
  };
  priceEl.addEventListener('input', calc);
  costEl.addEventListener('input', calc);
  calc();

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: modal.root.querySelector('#kuihName').value.trim(),
      description: modal.root.querySelector('#kuihDesc').value.trim(),
      price: Number(priceEl.value || 0),
      cost: Number(costEl.value || 0),
      unit: modal.root.querySelector('#kuihUnit').value.trim() || 'biji',
      sortOrder: Number(modal.root.querySelector('#kuihSort').value || 0)
    };
    if (!payload.name) { toast('Nama kuih diperlukan.', 'error'); return; }
    if (payload.price <= 0) { toast('Harga jualan mesti lebih daripada sifar.', 'error'); return; }

    setBusy(btn, true, 'Menyimpan…');
    try {
      if (isEdit) await patch(`/api/kuih/${kuih.id}`, payload);
      else await post('/api/kuih', payload);
      toast(isEdit ? 'Menu dikemas kini.' : 'Menu ditambah.');
      modal.close();
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

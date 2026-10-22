import { get, post, patch, del } from '../../core/api.js';
import { money, num, marginPct, emojiFor } from '../../core/format.js';
import { esc, toast, openModal, confirmDialog, emptyState, setBusy } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const title = 'Kalkulator Modal & Resipi';

export async function render(root, ctx) {
  const [recipes, ingredients, menu] = await Promise.all([
    get('/api/recipes'), get('/api/ingredients'), get('/api/kuih')
  ]);

  const selectedId = recipes.find((r) => r.id === ctx.params.recipe)?.id
    ?? recipes.find((r) => r.kuihId === menu[0]?.id)?.id
    ?? recipes[0]?.id
    ?? null;
  let selected = recipes.find((r) => r.id === selectedId) || null;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Kalkulator kos resipi & margin</h2>
        <p class="page-sub">Kira modal sebenar setiap kuih, simulasi tempahan pukal dan kemas kini harga bahan pasaran.</p>
      </div>
      <div class="row wrap">
        <button class="btn btn-ghost" id="addIngredient">${icon('plus')} Bahan</button>
        <button class="btn btn-primary" id="addRecipe">${icon('plus')} Resipi</button>
      </div>
    </div>

    <div class="grid grid-split">
      <section class="card">
        <div class="card-head" style="flex-direction:column;align-items:stretch;gap:12px">
          <div class="between wrap">
            <div>
              <div class="card-title">Kiraan kos mengikut kuih</div>
              <div class="card-sub">${recipes.length} resipi berdaftar · kos disegerak ke menu</div>
            </div>
            <div class="row" style="gap:6px">
              <select class="select" id="recipeSelect" style="min-width:230px">
                ${recipes.length ? recipes.map((r) => `<option value="${esc(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${esc(r.name)}</option>`).join('') : '<option>Tiada resipi</option>'}
              </select>
              ${selected ? `<button class="icon-btn bordered" id="editRecipe" title="Edit resipi">${icon('edit')}</button>
              <button class="icon-btn bordered danger" id="deleteRecipe" title="Padam resipi">${icon('trash')}</button>` : ''}
            </div>
          </div>
        </div>

        <div class="card-body" id="recipeBody">
          ${selected ? recipeMarkup(selected, menu) : emptyState({
            iconName: 'calculator',
            title: 'Belum ada resipi',
            text: 'Tambah resipi pertama untuk mengira kos modal dan margin setiap kuih.',
            action: '<button class="btn btn-primary btn-sm mt-8" id="emptyAddRecipe">Tambah resipi</button>'
          })}
        </div>
      </section>

      <aside class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Katalog bahan mentah</div>
            <div class="card-sub">${ingredients.length} bahan · harga rujukan semasa</div>
          </div>
          <span class="badge badge-green">Terkini</span>
        </div>
        <div class="list" id="ingredientList">
          ${ingredients.length ? ingredients.map((i) => `
            <div class="list-row" style="padding:11px 16px">
              <div class="list-main">
                <div class="list-title">${esc(i.name)}</div>
                <div class="list-sub">per ${esc(i.unit)}${i.note ? ` · ${esc(i.note)}` : ''}</div>
              </div>
              <div class="right">
                <div class="small strong nowrap">${money(i.priceCents)}</div>
                <button class="link tiny" data-edit-ing="${esc(i.id)}">Ubah</button>
              </div>
            </div>`).join('') : `<div class="empty" style="padding:24px"><div class="empty-text">Belum ada bahan didaftarkan.</div></div>`}
        </div>
        <div class="card-foot">
          <div class="callout callout-blue" style="font-size:11px">
            Harga bahan ialah rujukan semasa. Selepas mengemas kini harga, semak semula kos resipi supaya margin menu kekal tepat.
          </div>
        </div>
      </aside>
    </div>`;

  /* ---------- Resipi terpilih ---------- */
  function paintRecipe() {
    const body = root.querySelector('#recipeBody');
    body.innerHTML = selected
      ? recipeMarkup(selected, menu)
      : emptyState({ iconName: 'calculator', title: 'Belum ada resipi', text: 'Tambah resipi untuk mula mengira kos.' });
    bindSimulation();
  }

  function recipeMarkup(recipe, menuList) {
    const sellCents = recipe.sellPriceCents || (menuList.find((m) => m.id === recipe.kuihId)?.priceCents ?? 0);
    const profit = sellCents - recipe.costPerUnitCents;
    const margin = marginPct(sellCents, recipe.costPerUnitCents);
    const kuih = menuList.find((m) => m.id === recipe.kuihId);
    const sortedItems = [...recipe.items].sort((a, b) => b.lineCostCents - a.lineCostCents);

    return `
      <div class="stack" style="gap:16px">
        <div class="between wrap" style="gap:10px">
          <div class="row" style="gap:10px">
            <div class="list-ico" style="font-size:18px">${emojiFor(recipe.name)}</div>
            <div>
              <div class="strong">${esc(recipe.name)}</div>
              <div class="tiny muted">${recipe.yieldQty} ${esc(recipe.unit)} setiap batch${kuih ? ` · ${esc(kuih.name)}` : ''}</div>
            </div>
          </div>
          <span class="badge ${margin >= 35 ? 'badge-green' : 'badge-red'}">Margin ${margin}%</span>
        </div>

        <div class="grid grid-3" style="gap:10px">
          <div class="metric-box">
            <div class="label">Kos modal seunit</div>
            <div class="value" style="color:var(--red)">${money(recipe.costPerUnitCents)}</div>
          </div>
          <div class="metric-box">
            <div class="label">Harga jualan</div>
            <div class="value">${money(sellCents)}</div>
          </div>
          <div class="metric-box">
            <div class="label">Untung seunit</div>
            <div class="value" style="color:var(--green)">${money(profit)} <span style="font-size:11px;color:var(--ink-3)">(${margin}%)</span></div>
          </div>
        </div>

        <div class="callout callout-blue" style="display:flex;gap:8px;align-items:flex-start">
          ${icon('calculator')}
          <span><b>Formula kos:</b> Untung Bersih = Harga Jualan − Kos Modal Bahan Mentah seunit · Margin = Untung Bersih ÷ Harga Jualan.</span>
        </div>

        <div>
          <div class="upper muted" style="margin-bottom:6px">Pecahan bahan (batch ${recipe.yieldQty} ${esc(recipe.unit)})</div>
          <div>
            ${sortedItems.length ? sortedItems.map((item) => `
              <div class="ing-row">
                <span class="ing-name">${esc(item.name)}${item.unit ? `<span class="tiny muted"> · ${esc(item.unit)}</span>` : ''}</span>
                <span class="tiny muted">${item.qty ? `${item.qty}×` : ''}</span>
                <span class="ing-cost">${money(item.lineCostCents)}</span>
              </div>`).join('') : '<div class="tiny muted" style="padding:8px 0">Tiada bahan dimasukkan.</div>'}
            <div class="ing-row" style="border-top:1px solid var(--line);border-bottom:0;margin-top:4px">
              <span class="strong">Jumlah kos batch</span>
              <span></span>
              <span class="ing-cost" style="color:var(--red)">${money(recipe.totalCostCents)}</span>
            </div>
          </div>
        </div>

        <div class="callout ${margin >= 40 ? 'callout-green' : margin >= 30 ? 'callout-amber' : 'callout-red'}">
          ${margin >= 40
            ? `Margin ${margin}% sihat. Harga ${money(sellCents)} boleh dikekalkan walaupun bahan naik sedikit.`
            : margin >= 30
              ? `Margin ${margin}% masih boleh diterima. Pantau harga bahan utama dan pertimbangkan naik ${money(Math.max(5, Math.round((recipe.costPerUnitCents / 0.65 - sellCents)) * 100) / 100)} jika kos meningkat.`
              : `Margin ${margin}% terlalu nipis. Naikkan harga jualan atau kurangkan kos bahan segera.`}
        </div>

        <div style="border-top:1px solid var(--line);padding-top:14px">
          <div class="upper muted" style="margin-bottom:10px">Simulasi tempahan pukal</div>
          <div class="grid grid-3" style="gap:10px">
            <div class="field">
              <label class="label" for="simQty">Kuantiti ditempah</label>
              <input class="input" id="simQty" type="number" min="0" value="100" inputmode="numeric">
            </div>
            <div class="field">
              <label class="label" for="simPrice">Harga jual seunit (RM)</label>
              <input class="input" id="simPrice" type="number" min="0" step="0.10" value="${(sellCents / 100).toFixed(2)}">
            </div>
            <div class="field">
              <label class="label" for="simExtra">Kos tambahan (RM)</label>
              <input class="input" id="simExtra" type="number" min="0" step="0.50" value="3.00">
            </div>
          </div>
          <div class="grid grid-3" style="gap:10px;margin-top:12px">
            <div class="metric-box">
              <div class="label">Jualan kasar</div>
              <div class="value" id="simGross" style="font-size:16px">RM 0.00</div>
            </div>
            <div class="metric-box">
              <div class="label">Jumlah kos</div>
              <div class="value" id="simCost" style="font-size:16px;color:var(--red)">RM 0.00</div>
            </div>
            <div class="metric-box" style="background:var(--brand-soft);border-color:var(--brand-line)">
              <div class="label">Untung bersih</div>
              <div class="value" id="simProfit" style="font-size:16px;color:var(--brand-ink)">RM 0.00</div>
            </div>
          </div>
          <div class="tiny muted mt-8" id="simNote"></div>
        </div>
      </div>`;
  }

  function bindSimulation() {
    if (!selected) return;
    const qtyEl = root.querySelector('#simQty');
    const priceEl = root.querySelector('#simPrice');
    const extraEl = root.querySelector('#simExtra');
    if (!qtyEl) return;

    const run = () => {
      const qty = Math.max(0, Number(qtyEl.value) || 0);
      const price = Math.max(0, Number(priceEl.value) || 0);
      const extra = Math.max(0, Number(extraEl.value) || 0);
      const gross = Math.round(qty * price * 100);
      const cost = Math.round(qty * (selected.costPerUnitCents / 100) * 100 + extra * 100);
      const profit = gross - cost;
      root.querySelector('#simGross').textContent = money(gross);
      root.querySelector('#simCost').textContent = money(cost);
      root.querySelector('#simProfit').textContent = money(profit);
      root.querySelector('#simNote').textContent = `Margin simulasi ${marginPct(gross, cost)}% · kos seunit ${money(selected.costPerUnitCents)}`;
    };

    [qtyEl, priceEl, extraEl].forEach((el) => el.addEventListener('input', run));
    run();
  }

  editorBindings(root, ctx, { recipes, ingredients, menu });
  bindSimulation();
}

/* ---------------- Modal & tindakan ---------------- */
function editorBindings(root, ctx, data) {
  const { recipes, ingredients, menu } = data;

  root.querySelector('#recipeSelect')?.addEventListener('change', (e) => {
    ctx.navigate(`/calculator?recipe=${encodeURIComponent(e.target.value)}`);
  });

  root.querySelector('#addRecipe')?.addEventListener('click', () => openRecipeModal({ ctx, ingredients, menu }));
  root.querySelector('#emptyAddRecipe')?.addEventListener('click', () => openRecipeModal({ ctx, ingredients, menu }));

  const selected = recipes.find((r) => r.id === root.querySelector('#recipeSelect')?.value);

  root.querySelector('#editRecipe')?.addEventListener('click', () => {
    if (selected) openRecipeModal({ ctx, ingredients, menu, recipe: selected });
  });

  root.querySelector('#deleteRecipe')?.addEventListener('click', async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: 'Padam resipi?',
      message: `Resipi “${selected.name}” akan dipadam. Kos menu kuih tidak lagi disegerakkan daripada resipi ini.`,
      confirmLabel: 'Padam resipi',
      danger: true
    });
    if (!ok) return;
    try {
      await del(`/api/recipes/${selected.id}`);
      toast('Resipi dipadam.');
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.querySelector('#addIngredient')?.addEventListener('click', () => openIngredientModal({ ctx, ingredients }));

  root.querySelectorAll('[data-edit-ing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ing = ingredients.find((i) => i.id === btn.dataset.editIng);
      if (ing) openIngredientModal({ ctx, ingredients, ingredient: ing });
    });
  });
}

export function openIngredientModal({ ctx, ingredient = null }) {
  const isEdit = Boolean(ingredient);
  const modal = openModal({
    title: isEdit ? 'Kemas kini bahan mentah' : 'Tambah bahan mentah',
    subtitle: 'Harga digunakan untuk pengiraan kos resipi',
    body: `
      <div class="stack" style="gap:12px">
        <div class="field">
          <label class="label">Nama bahan <span class="req">*</span></label>
          <input class="input" id="ingName" value="${esc(ingredient?.name || '')}" placeholder="Contoh: Santan Kelapa Segar">
        </div>
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">Harga (RM) <span class="req">*</span></label>
            <input class="input" id="ingPrice" type="number" min="0" step="0.10" value="${ingredient ? (ingredient.priceCents / 100).toFixed(2) : ''}" placeholder="11.00">
          </div>
          <div class="field">
            <label class="label">Unit</label>
            <input class="input" id="ingUnit" value="${esc(ingredient?.unit || 'kg')}" placeholder="kg / liter / pek">
          </div>
        </div>
        <div class="field">
          <label class="label">Nota (pilihan)</label>
          <input class="input" id="ingNote" value="${esc(ingredient?.note || '')}" placeholder="Jenama / pembekal">
        </div>
        ${isEdit ? `<button class="btn btn-danger btn-sm" id="deleteIng" style="align-self:flex-start">${icon('trash')} Padam bahan</button>` : ''}
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>${isEdit ? 'Simpan perubahan' : 'Tambah bahan'}</button>`
  });

  modal.root.querySelector('[data-cancel]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: modal.root.querySelector('#ingName').value.trim(),
      price: Number(modal.root.querySelector('#ingPrice').value || 0),
      unit: modal.root.querySelector('#ingUnit').value.trim() || 'kg',
      note: modal.root.querySelector('#ingNote').value.trim()
    };
    if (!payload.name) { toast('Nama bahan diperlukan.', 'error'); return; }
    setBusy(btn, true, 'Menyimpan…');
    try {
      if (isEdit) await patch(`/api/ingredients/${ingredient.id}`, payload);
      else await post('/api/ingredients', payload);
      toast(isEdit ? 'Harga bahan dikemas kini.' : 'Bahan ditambah.');
      modal.close();
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });

  modal.root.querySelector('#deleteIng')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Padam bahan?', message: `“${ingredient.name}” akan dipadam daripada katalog.`, confirmLabel: 'Padam', danger: true });
    if (!ok) return;
    try {
      await del(`/api/ingredients/${ingredient.id}`);
      toast('Bahan dipadam.');
      modal.close();
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function openRecipeModal({ ctx, ingredients, menu, recipe = null }) {
  const isEdit = Boolean(recipe);
  const items = recipe ? recipe.items.map((i) => ({ ...i })) : [{ name: '', qty: 1, unit: '', lineCost: 0 }];

  const modal = openModal({
    title: isEdit ? 'Edit resipi' : 'Tambah resipi',
    subtitle: 'Kos seunit = jumlah kos batch ÷ hasil (yield)',
    size: 'wide',
    body: `
      <div class="stack" style="gap:12px">
        <div class="grid grid-2" style="gap:10px">
          <div class="field">
            <label class="label">Nama resipi <span class="req">*</span></label>
            <input class="input" id="rcpName" value="${esc(recipe?.name || '')}" placeholder="Resipi Karipap Pusing">
          </div>
          <div class="field">
            <label class="label">Kuih berkaitan</label>
            <select class="select" id="rcpKuih">
              <option value="">— Tiada —</option>
              ${menu.map((m) => `<option value="${esc(m.id)}" ${recipe?.kuihId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-3" style="gap:10px">
          <div class="field">
            <label class="label">Hasil (unit) <span class="req">*</span></label>
            <input class="input" id="rcpYield" type="number" min="1" value="${recipe?.yieldQty || 50}">
          </div>
          <div class="field">
            <label class="label">Unit</label>
            <input class="input" id="rcpUnit" value="${esc(recipe?.unit || 'biji')}">
          </div>
          <div class="field">
            <label class="label">Harga jual seunit (RM)</label>
            <input class="input" id="rcpSell" type="number" min="0" step="0.10" value="${recipe ? (recipe.sellPriceCents / 100).toFixed(2) : ''}">
          </div>
        </div>

        <div>
          <div class="between" style="margin-bottom:6px">
            <span class="upper muted">Bahan & kos batch</span>
            <button class="link" id="addRow" type="button">+ Tambah baris</button>
          </div>
          <div id="rcpItems" class="stack" style="gap:6px">
            ${items.map((item, i) => itemRowHtml(item, i, ingredients)).join('')}
          </div>
          <div class="hint mt-8">Kos diisi untuk keseluruhan batch. Contoh: 50 biji karipap menggunakan RM9 tepung.</div>
        </div>

        <div class="metric-box" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="label">Kos seunit (anggaran)</div>
            <div class="tiny muted">Jumlah kos bahan ÷ hasil</div>
          </div>
          <div class="value" id="rcpCostPreview" style="color:var(--red)">RM 0.00</div>
        </div>
      </div>`,
    footer: `<button class="btn btn-ghost" data-cancel>Batal</button>
             <button class="btn btn-primary" data-save>${isEdit ? 'Simpan resipi' : 'Tambah resipi'}</button>`
  });

  const rowHost = modal.root.querySelector('#rcpItems');

  function bindRows() {
    rowHost.querySelectorAll('[data-remove-row]').forEach((btn) => {
      btn.onclick = () => {
        if (rowHost.children.length <= 1) { toast('Sekurang-kurangnya satu bahan diperlukan.', 'info'); return; }
        btn.closest('.rcp-row').remove();
        preview();
      };
    });
    rowHost.querySelectorAll('.rcp-cost, .rcp-name').forEach((input) => input.addEventListener('input', preview));
    rowHost.querySelectorAll('select[data-ing-pick]').forEach((sel) => {
      sel.onchange = () => {
        const row = sel.closest('.rcp-row');
        const ing = ingredients.find((i) => i.id === sel.value);
        if (ing && !row.querySelector('.rcp-name').value) {
          row.querySelector('.rcp-name').value = ing.name;
          row.querySelector('.rcp-unit').value = ing.unit;
        }
      };
    });
  }

  function preview() {
    let total = 0;
    rowHost.querySelectorAll('.rcp-cost').forEach((input) => { total += Math.round((Number(input.value) || 0) * 100); });
    const yieldQty = Math.max(1, Number(modal.root.querySelector('#rcpYield').value) || 1);
    modal.root.querySelector('#rcpCostPreview').textContent = money(Math.round(total / yieldQty));
  }

  modal.root.querySelector('#addRow').onclick = () => {
    const tmp = document.createElement('div');
    tmp.innerHTML = itemRowHtml({ name: '', qty: 1, unit: '', lineCost: 0 }, rowHost.children.length, ingredients);
    rowHost.appendChild(tmp.firstElementChild);
    bindRows();
    preview();
  };

  modal.root.querySelector('#rcpYield').addEventListener('input', preview);
  bindRows();
  preview();

  modal.root.querySelector('[data-cancel]').onclick = () => modal.close();
  modal.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const name = modal.root.querySelector('#rcpName').value.trim();
    if (!name) { toast('Nama resipi diperlukan.', 'error'); return; }

    const rows = [...rowHost.querySelectorAll('.rcp-row')].map((row) => ({
      ingredientId: row.querySelector('[data-ing-pick]')?.value || null,
      name: row.querySelector('.rcp-name').value.trim(),
      qty: Number(row.querySelector('.rcp-qty').value || 1),
      unit: row.querySelector('.rcp-unit').value.trim(),
      lineCost: Number(row.querySelector('.rcp-cost').value || 0)
    })).filter((r) => r.name);

    if (!rows.length) { toast('Masukkan sekurang-kurangnya satu bahan.', 'error'); return; }

    const payload = {
      name,
      kuihId: modal.root.querySelector('#rcpKuih').value || null,
      yieldQty: Number(modal.root.querySelector('#rcpYield').value || 1),
      unit: modal.root.querySelector('#rcpUnit').value.trim() || 'biji',
      sellPrice: Number(modal.root.querySelector('#rcpSell').value || 0),
      items: rows
    };

    setBusy(btn, true, 'Menyimpan…');
    try {
      const saved = isEdit
        ? await patch(`/api/recipes/${recipe.id}`, payload)
        : await post('/api/recipes', payload);
      toast(isEdit ? 'Resipi dikemas kini.' : 'Resipi ditambah.');
      modal.close();
      ctx.navigate(`/calculator?recipe=${saved.id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

function itemRowHtml(item, index, ingredients) {
  return `<div class="rcp-row" style="display:grid;grid-template-columns:1fr 72px 64px 96px 28px;gap:6px;align-items:center">
    <div class="stack" style="gap:4px">
      <input class="input rcp-name" placeholder="Nama bahan" value="${esc(item.name || '')}" style="padding:7px 9px;font-size:12px">
      <select class="select" data-ing-pick style="padding:4px 26px 4px 8px;font-size:10px;height:auto;color:var(--ink-3);background-position:right 6px center">
        <option value="">— pilih dari katalog —</option>
        ${ingredients.map((ing) => `<option value="${esc(ing.id)}" ${item.ingredientId === ing.id ? 'selected' : ''}>${esc(ing.name)} (${money(ing.priceCents)}/${esc(ing.unit)})</option>`).join('')}
      </select>
    </div>
    <input class="input rcp-qty" type="number" min="0" step="0.1" value="${item.qty ?? 1}" title="Kuantiti" style="padding:7px 6px;font-size:12px">
    <input class="input rcp-unit" placeholder="unit" value="${esc(item.unit || '')}" style="padding:7px 6px;font-size:12px">
    <input class="input rcp-cost" type="number" min="0" step="0.10" value="${item.lineCostCents !== undefined ? (item.lineCostCents / 100).toFixed(2) : (item.lineCost || 0)}" placeholder="Kos RM" title="Kos keseluruhan batch" style="padding:7px 6px;font-size:12px">
    <button type="button" class="icon-btn danger sm" data-remove-row title="Buang">${icon('x')}</button>
  </div>`;
}

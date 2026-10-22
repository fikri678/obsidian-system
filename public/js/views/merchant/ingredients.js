import { get } from '../../core/api.js';
import { money, num, stampLabel } from '../../core/format.js';
import { esc, emptyState, toast } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { openIngredientModal } from './calculator.js';

export const title = 'Bahan Mentah';

export async function render(root, ctx) {
  const ingredients = await get('/api/ingredients');
  const total = ingredients.reduce((s, i) => s + i.priceCents, 0);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">Bahan mentah</h2>
        <p class="page-sub">Harga rujukan pasaran yang digunakan dalam kiraan kos resipi dan margin menu.</p>
      </div>
      <button class="btn btn-primary" id="addIng">${icon('plus')} Tambah bahan</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Bahan berdaftar</span><span class="stat-icon tone-blue">${icon('box')}</span></div>
        <div class="stat-value">${num(ingredients.length)}</div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Nilai katalog</span><span class="stat-icon tone-green">${icon('cash')}</span></div>
        <div class="stat-value" style="font-size:20px">${money(total)}</div>
        <div class="stat-foot"><span>Jumlah harga rujukan</span></div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Bahan termahal</span><span class="stat-icon tone-red">${icon('trending')}</span></div>
        <div class="stat-value" style="font-size:16px">${esc(ingredients.slice().sort((a, b) => b.priceCents - a.priceCents)[0]?.name || '—')}</div>
        <div class="stat-foot"><span>${ingredients.length ? money(Math.max(...ingredients.map((i) => i.priceCents))) : 'RM 0.00'}</span></div>
      </div>
      <div class="card stat">
        <div class="stat-top"><span class="stat-label">Kemas kini terakhir</span><span class="stat-icon tone-amber">${icon('clock')}</span></div>
        <div class="stat-value" style="font-size:15px">${esc(ingredients[0] ? stampLabel(ingredients[0].updatedAt) : '—')}</div>
        <div class="stat-foot"><span>Segerak dengan resipi</span></div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Katalog bahan</div>
          <div class="card-sub">Klik “Ubah” untuk kemas kini harga pasaran</div>
        </div>
        <span class="badge badge-green">${ingredients.length} bahan</span>
      </div>
      ${ingredients.length ? `<div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Bahan</th><th>Unit</th><th class="right">Harga</th><th>Nota</th><th>Dikemas kini</th><th class="center">Tindakan</th>
          </tr></thead>
          <tbody>
            ${ingredients.map((i) => `
              <tr>
                <td>
                  <div class="row" style="gap:9px">
                    <span class="list-ico" style="width:28px;height:28px;font-size:13px">${esc((i.name.match(/[a-zA-Z]/) || ['?'])[0].toUpperCase())}</span>
                    <span class="cell-main">${esc(i.name)}</span>
                  </div>
                </td>
                <td class="small muted">per ${esc(i.unit)}</td>
                <td class="right num strong">${money(i.priceCents)}</td>
                <td class="small muted">${esc(i.note || '—')}</td>
                <td class="cell-sub">${esc(stampLabel(i.updatedAt))}</td>
                <td class="center">
                  <button class="icon-btn bordered sm" data-edit-ing="${esc(i.id)}" title="Ubah harga">${icon('edit')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState({
        iconName: 'box',
        title: 'Belum ada bahan',
        text: 'Daftarkan bahan mentah untuk mengira kos resipi dengan tepat.',
        action: '<button class="btn btn-primary btn-sm mt-8" id="emptyAdd">Tambah bahan</button>'
      })}
    </section>

    <div class="callout callout-amber mt-16" style="display:flex;gap:8px;align-items:flex-start">
      ${icon('sparkles')}
      <span><b>Tip kos:</b> kemas kini harga bahan setiap minggu, kemudian semak semula kos resipi. Setiap pesanan menyimpan kos semasa, jadi laporan lama tidak berubah.</span>
    </div>`;

  const add = () => openIngredientModal({ ctx, ingredients });
  root.querySelector('#addIng')?.addEventListener('click', add);
  root.querySelector('#emptyAdd')?.addEventListener('click', add);
  root.querySelectorAll('[data-edit-ing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ing = ingredients.find((i) => i.id === btn.dataset.editIng);
      if (ing) openIngredientModal({ ctx, ingredients, ingredient: ing });
    });
  });
}

const mapItem = (r) => ({
  id: r.id,
  recipeId: r.recipe_id,
  ingredientId: r.ingredient_id,
  name: r.name,
  qty: Number(r.qty || 0),
  unit: r.unit || '',
  lineCostCents: Number(r.line_cost_cents || 0),
  sortOrder: Number(r.sort_order || 0)
});

const mapRecipe = (r) => r && ({
  id: r.id,
  tenantId: r.tenant_id,
  kuihId: r.kuih_id,
  name: r.name,
  yieldQty: Number(r.yield_qty || 1),
  unit: r.unit || 'biji',
  sellPriceCents: Number(r.sell_price_cents || 0),
  note: r.note || '',
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export function recipesRepo(db) {
  const repo = {
    async listByTenant(tenantId) {
      const recipes = (await db.query('SELECT * FROM recipes WHERE tenant_id = ? ORDER BY name ASC', [tenantId])).map(mapRecipe);
      if (!recipes.length) return [];
      const items = await db.query(`
        SELECT ri.* FROM recipe_items ri
        JOIN recipes r ON r.id = ri.recipe_id
        WHERE r.tenant_id = ?
        ORDER BY ri.sort_order ASC
      `, [tenantId]);
      const byRecipe = new Map();
      for (const item of items) {
        if (!byRecipe.has(item.recipe_id)) byRecipe.set(item.recipe_id, []);
        byRecipe.get(item.recipe_id).push(mapItem(item));
      }
      return recipes.map((r) => {
        const list = byRecipe.get(r.id) || [];
        const totalCostCents = list.reduce((sum, i) => sum + i.lineCostCents, 0);
        return { ...r, items: list, totalCostCents, costPerUnitCents: Math.round(totalCostCents / Math.max(1, r.yieldQty)) };
      });
    },

    async findById(id, tenantId) {
      const recipe = mapRecipe(await db.get('SELECT * FROM recipes WHERE id = ? AND tenant_id = ?', [id, tenantId]));
      if (!recipe) return null;
      const items = (await db.query('SELECT * FROM recipe_items WHERE recipe_id = ? ORDER BY sort_order ASC', [id])).map(mapItem);
      const totalCostCents = items.reduce((sum, i) => sum + i.lineCostCents, 0);
      return { ...recipe, items, totalCostCents, costPerUnitCents: Math.round(totalCostCents / Math.max(1, recipe.yieldQty)) };
    },

    async create(recipe, items) {
      await db.tx(async () => {
        await db.run(`
          INSERT INTO recipes (id, tenant_id, kuih_id, name, yield_qty, unit, sell_price_cents, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [recipe.id, recipe.tenantId, recipe.kuihId || null, recipe.name, recipe.yieldQty || 1,
          recipe.unit || 'biji', recipe.sellPriceCents || 0, recipe.note || '', recipe.createdAt, recipe.updatedAt]);
        await insertItems(db, recipe.id, items);
      });
      return repo.findById(recipe.id, recipe.tenantId);
    },

    async update(id, tenantId, fields, items = null) {
      await db.tx(async () => {
        const allowed = {
          name: 'name', kuihId: 'kuih_id', yieldQty: 'yield_qty', unit: 'unit',
          sellPriceCents: 'sell_price_cents', note: 'note', updatedAt: 'updated_at'
        };
        const sets = [];
        const params = [];
        for (const [key, col] of Object.entries(allowed)) {
          if (fields[key] !== undefined) { sets.push(`${col} = ?`); params.push(fields[key]); }
        }
        if (sets.length) {
          params.push(id, tenantId);
          await db.run(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
        }
        if (Array.isArray(items)) {
          await db.run('DELETE FROM recipe_items WHERE recipe_id = ?', [id]);
          await insertItems(db, id, items);
        }
      });
      return repo.findById(id, tenantId);
    },

    async remove(id, tenantId) {
      const res = await db.run('DELETE FROM recipes WHERE id = ? AND tenant_id = ?', [id, tenantId]);
      return res.changes > 0;
    }
  };

  return repo;
}

async function insertItems(db, recipeId, items = []) {
  let order = 0;
  for (const item of items) {
    await db.run(`
      INSERT INTO recipe_items (id, recipe_id, ingredient_id, name, qty, unit, line_cost_cents, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [item.id, recipeId, item.ingredientId || null, item.name, item.qty || 1, item.unit || '',
      item.lineCostCents || 0, order++]);
  }
}

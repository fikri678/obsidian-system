import { randomUUID } from 'node:crypto';
import { HttpError, notFound } from '../lib/errors.js';
import { optionalString, requireEnum, requireInt, requireNumber, requireString } from '../lib/validate.js';
import { stamp, todayISO } from '../lib/time.js';
import { toCents } from '../lib/money.js';

export function catalogService({ repos, audit }) {
  return {
    /* ---------------- MENU KUIH ---------------- */
    async listKuih(tenantId, { includeArchived = false } = {}) {
      return repos.kuih.listByTenant(tenantId, { includeArchived });
    },

    async createKuih(tenantId, actor, payload) {
      const now = stamp();
      const kuih = await repos.kuih.create({
        id: `kuih_${randomUUID()}`,
        tenantId,
        name: requireString(payload.name, 'Nama kuih', { max: 120 }),
        description: optionalString(payload.description, { max: 300 }),
        unit: optionalString(payload.unit, { max: 20 }) || 'biji',
        priceCents: toCents(requireNumber(payload.price, 'Harga jualan', { min: 0, max: 10000 })),
        costCents: toCents(Number(payload.cost || 0)),
        status: payload.status === 'archived' ? 'archived' : 'active',
        sortOrder: Number(payload.sortOrder || 0),
        createdAt: now,
        updatedAt: now
      });
      await audit.log({
        actorUser: actor, tenantId, action: 'kuih.created', entity: 'kuih', entityId: kuih.id,
        detail: { name: kuih.name, priceCents: kuih.priceCents }
      });
      return kuih;
    },

    async updateKuih(tenantId, actor, id, payload) {
      const existing = await repos.kuih.findById(id, tenantId);
      if (!existing) throw notFound('Kuih tidak dijumpai.');
      const fields = { updatedAt: stamp() };
      if (payload.name !== undefined) fields.name = requireString(payload.name, 'Nama kuih', { max: 120 });
      if (payload.description !== undefined) fields.description = optionalString(payload.description, { max: 300 });
      if (payload.unit !== undefined) fields.unit = optionalString(payload.unit, { max: 20 }) || 'biji';
      if (payload.price !== undefined) fields.priceCents = toCents(requireNumber(payload.price, 'Harga jualan', { min: 0, max: 10000 }));
      if (payload.cost !== undefined) fields.costCents = toCents(requireNumber(payload.cost, 'Kos', { min: 0, max: 10000 }));
      if (payload.status !== undefined) fields.status = requireEnum(payload.status, ['active', 'archived'], 'Status');
      if (payload.sortOrder !== undefined) fields.sortOrder = requireInt(payload.sortOrder, 'Susunan', { min: 0, max: 999 });

      const kuih = await repos.kuih.update(id, tenantId, fields);
      await audit.log({
        actorUser: actor, tenantId, action: 'kuih.updated', entity: 'kuih', entityId: id,
        detail: { name: kuih.name, fields: Object.keys(fields).filter((k) => k !== 'updatedAt') }
      });
      return kuih;
    },

    async archiveKuih(tenantId, actor, id) {
      const existing = await repos.kuih.findById(id, tenantId);
      if (!existing) throw notFound('Kuih tidak dijumpai.');
      await repos.kuih.update(id, tenantId, { status: 'archived', updatedAt: stamp() });
      await audit.log({ actorUser: actor, tenantId, action: 'kuih.archived', entity: 'kuih', entityId: id, detail: { name: existing.name } });
      return true;
    },

    /* ---------------- BAHAN MENTAH ---------------- */
    async listIngredients(tenantId) {
      return repos.ingredients.listByTenant(tenantId);
    },

    async createIngredient(tenantId, actor, payload) {
      const now = stamp();
      const item = await repos.ingredients.create({
        id: `ing_${randomUUID()}`,
        tenantId,
        name: requireString(payload.name, 'Nama bahan', { max: 120 }),
        unit: optionalString(payload.unit, { max: 20 }) || 'kg',
        priceCents: toCents(requireNumber(payload.price, 'Harga', { min: 0, max: 100000 })),
        note: optionalString(payload.note, { max: 200 }),
        createdAt: now,
        updatedAt: now
      });
      await audit.log({ actorUser: actor, tenantId, action: 'ingredient.created', entity: 'ingredient', entityId: item.id, detail: { name: item.name } });
      return item;
    },

    async updateIngredient(tenantId, actor, id, payload) {
      const existing = await repos.ingredients.findById(id, tenantId);
      if (!existing) throw notFound('Bahan tidak dijumpai.');
      const fields = { updatedAt: stamp() };
      if (payload.name !== undefined) fields.name = requireString(payload.name, 'Nama bahan', { max: 120 });
      if (payload.unit !== undefined) fields.unit = optionalString(payload.unit, { max: 20 }) || 'kg';
      if (payload.price !== undefined) fields.priceCents = toCents(requireNumber(payload.price, 'Harga', { min: 0, max: 100000 }));
      if (payload.note !== undefined) fields.note = optionalString(payload.note, { max: 200 });
      const item = await repos.ingredients.update(id, tenantId, fields);
      await audit.log({
        actorUser: actor, tenantId, action: 'ingredient.price_updated', entity: 'ingredient', entityId: id,
        detail: { name: item.name, fromCents: existing.priceCents, toCents: item.priceCents }
      });
      return item;
    },

    async deleteIngredient(tenantId, actor, id) {
      const existing = await repos.ingredients.findById(id, tenantId);
      if (!existing) throw notFound('Bahan tidak dijumpai.');
      await repos.ingredients.remove(id, tenantId);
      await audit.log({ actorUser: actor, tenantId, action: 'ingredient.deleted', entity: 'ingredient', entityId: id, detail: { name: existing.name } });
      return true;
    },

    /* ---------------- RESIPI ---------------- */
    async listRecipes(tenantId) {
      return repos.recipes.listByTenant(tenantId);
    },

    async createRecipe(tenantId, actor, payload) {
      const now = stamp();
      const items = normalizeItems(payload.items);
      const recipe = await repos.recipes.create({
        id: `rcp_${randomUUID()}`,
        tenantId,
        kuihId: payload.kuihId || null,
        name: requireString(payload.name, 'Nama resipi', { max: 120 }),
        yieldQty: requireInt(payload.yieldQty || 1, 'Hasil (unit)', { min: 1, max: 100000 }),
        unit: optionalString(payload.unit, { max: 20 }) || 'biji',
        sellPriceCents: toCents(Number(payload.sellPrice || 0)),
        note: optionalString(payload.note, { max: 300 }),
        createdAt: now,
        updatedAt: now
      }, items);
      await this.syncKuihCost(tenantId, recipe, actor, 'recipe.created');
      await audit.log({ actorUser: actor, tenantId, action: 'recipe.created', entity: 'recipe', entityId: recipe.id, detail: { name: recipe.name } });
      return recipe;
    },

    async updateRecipe(tenantId, actor, id, payload) {
      const existing = await repos.recipes.findById(id, tenantId);
      if (!existing) throw notFound('Resipi tidak dijumpai.');
      const fields = { updatedAt: stamp() };
      if (payload.name !== undefined) fields.name = requireString(payload.name, 'Nama resipi', { max: 120 });
      if (payload.kuihId !== undefined) fields.kuihId = payload.kuihId || null;
      if (payload.yieldQty !== undefined) fields.yieldQty = requireInt(payload.yieldQty, 'Hasil (unit)', { min: 1, max: 100000 });
      if (payload.unit !== undefined) fields.unit = optionalString(payload.unit, { max: 20 }) || 'biji';
      if (payload.sellPrice !== undefined) fields.sellPriceCents = toCents(requireNumber(payload.sellPrice, 'Harga jualan', { min: 0, max: 10000 }));
      if (payload.note !== undefined) fields.note = optionalString(payload.note, { max: 300 });
      const items = Array.isArray(payload.items) ? normalizeItems(payload.items) : null;

      const recipe = await repos.recipes.update(id, tenantId, fields, items);
      await this.syncKuihCost(tenantId, recipe, actor, 'recipe.updated');
      await audit.log({ actorUser: actor, tenantId, action: 'recipe.updated', entity: 'recipe', entityId: id, detail: { name: recipe.name } });
      return recipe;
    },

    async deleteRecipe(tenantId, actor, id) {
      const existing = await repos.recipes.findById(id, tenantId);
      if (!existing) throw notFound('Resipi tidak dijumpai.');
      await repos.recipes.remove(id, tenantId);
      await audit.log({ actorUser: actor, tenantId, action: 'recipe.deleted', entity: 'recipe', entityId: id, detail: { name: existing.name } });
      return true;
    },

    /** Kos seunit daripada resipi disegerakkan ke harga kos menu kuih. */
    async syncKuihCost(tenantId, recipe, actor, action) {
      if (!recipe?.kuihId) return;
      const kuih = await repos.kuih.findById(recipe.kuihId, tenantId);
      if (!kuih) return;
      if (kuih.costCents === recipe.costPerUnitCents) return;
      await repos.kuih.update(kuih.id, tenantId, { costCents: recipe.costPerUnitCents, updatedAt: stamp() });
      await audit.log({
        actorUser: actor, tenantId, action: `${action}.cost_synced`, entity: 'kuih', entityId: kuih.id,
        detail: { name: kuih.name, costCents: recipe.costPerUnitCents }
      });
    },

    /* ---------------- TETAPAN KEDAI ---------------- */
    async updateTenant(tenantId, actor, payload) {
      const tenant = await repos.tenants.findById(tenantId);
      if (!tenant) throw notFound('Kedai tidak dijumpai.');
      const fields = { updatedAt: stamp() };
      if (payload.name !== undefined) fields.name = requireString(payload.name, 'Nama kedai', { max: 120 });
      if (payload.ownerName !== undefined) fields.ownerName = optionalString(payload.ownerName, { max: 120 });
      if (payload.phone !== undefined) fields.phone = optionalString(payload.phone, { max: 40 });
      if (payload.location !== undefined) fields.location = optionalString(payload.location, { max: 200 });
      if (payload.tagline !== undefined) fields.tagline = optionalString(payload.tagline, { max: 200 });
      const updated = await repos.tenants.update(tenantId, fields);
      await audit.log({ actorUser: actor, tenantId, action: 'tenant.updated', entity: 'tenant', entityId: tenantId });
      return updated;
    }
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && String(item.name || '').trim())
    .slice(0, 40)
    .map((item) => ({
      id: `rit_${randomUUID()}`,
      ingredientId: item.ingredientId || null,
      name: String(item.name).trim().slice(0, 120),
      qty: Math.max(0, Number(item.qty || 0)),
      unit: optionalString(item.unit, { max: 20 }),
      lineCostCents: Math.max(0, toCents(Number(item.lineCost || 0)))
    }));
}

export function ensureExists(value, message) {
  if (!value) throw new HttpError(404, message);
  return value;
}

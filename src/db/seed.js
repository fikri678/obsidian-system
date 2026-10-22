import { randomUUID } from 'node:crypto';
import { hashPassword } from '../lib/password.js';
import { addDaysISO, daysAgoISO, stamp, todayISO } from '../lib/time.js';
import { usersRepo } from './repositories/users.repo.js';
import { tenantsRepo } from './repositories/tenants.repo.js';
import { kuihRepo } from './repositories/kuih.repo.js';
import { ingredientsRepo } from './repositories/ingredients.repo.js';
import { recipesRepo } from './repositories/recipes.repo.js';
import { ordersRepo } from './repositories/orders.repo.js';
import { auditRepo } from './repositories/audit.repo.js';
import { settingsRepo } from './repositories/settings.repo.js';
import { DEMO } from '../config.js';

/* Data demo deterministik supaya carta & laporan kelihatan realistik. */
function prng(seed = 20261022) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TENANTS = [
  {
    id: 'tnt_kakani',
    name: 'Kak Ani Kuih Tradisional',
    slug: 'kak-ani',
    ownerName: 'Ani Zaleha',
    phone: '013-9876543',
    location: 'Kampung Baru, Kuala Lumpur',
    tagline: 'Kuih tradisional segar setiap pagi sejak 2011',
    email: DEMO.merchant.email,
    userPassword: DEMO.merchant.password,
    userName: 'Ani Zaleha',
    ingredients: [
      { name: 'Tepung Gandum Cap Sauh (1kg)', price: 3.50, unit: 'kg' },
      { name: 'Santan Kelapa Segar (1kg)', price: 11.00, unit: 'kg' },
      { name: 'Gula Melaka Asli (1kg)', price: 9.50, unit: 'kg' },
      { name: 'Minyak Masak Botol (5kg)', price: 32.50, unit: 'tong' },
      { name: 'Bekas Plastik 500ml (50 pcs)', price: 13.00, unit: 'pek' },
      { name: 'Beras Pulut Wangi (1kg)', price: 6.80, unit: 'kg' }
    ],
    menu: [
      {
        name: 'Karipap Pusing Daging', price: 1.00, cost: 0.45, emoji: '🥟',
        description: 'Kulit berlapis, inti daging kisar & kentang.',
        recipe: { yieldQty: 50, items: [['Tepung gandum & marjerin', 9.00], ['Inti daging kisar & kentang', 9.50], ['Minyak menggoreng', 2.50], ['Pembungkusan seunit', 1.50]] }
      },
      {
        name: 'Seri Muka Pandan', price: 0.90, cost: 0.38, emoji: '🍮',
        description: 'Pulut lembut dengan lapisan pandan asli.',
        recipe: { yieldQty: 24, items: [['Beras pulut & santan', 4.08], ['Lapisan pandan & telur', 3.60], ['Gula & garam', 0.72], ['Alas plastik', 0.72]] }
      },
      {
        name: 'Kuih Lapis Tradisional', price: 0.80, cost: 0.35, emoji: '🌈',
        description: 'Sembilan lapis, tekstur kenyal lembut.',
        recipe: { yieldQty: 40, items: [['Tepung beras & ubi', 5.60], ['Santan kelapa segar', 5.60], ['Pewarna & perisa mawar', 1.60], ['Gas & utiliti kukus', 1.20]] }
      },
      {
        name: 'Pulut Panggang Berempah', price: 1.20, cost: 0.55, emoji: '🍃',
        description: 'Dibakar arang, inti kelapa & udang kering.',
        recipe: { yieldQty: 30, items: [['Beras pulut wangi', 6.00], ['Inti kelapa & udang kering', 7.20], ['Daun pisang & lidi', 2.10], ['Arang / tenaga bakar', 1.20]] }
      },
      {
        name: 'Kuih Keria Gula Melaka', price: 1.00, cost: 0.40, emoji: '🍩',
        description: 'Ubi keledek manis bersalut sira gula melaka.',
        recipe: { yieldQty: 40, items: [['Ubi keledek manis', 8.80], ['Tepung gandum', 2.00], ['Sira gula melaka asli', 3.60], ['Minyak menggoreng', 1.60]] }
      },
      {
        name: 'Popia Sambal Rangup', price: 0.80, cost: 0.32, emoji: '🌯',
        description: 'Popia goreng rangup dengan sambal tumis.',
        recipe: null
      }
    ]
  },
  {
    id: 'tnt_maksom',
    name: 'Mak Som Delights',
    slug: 'mak-som',
    ownerName: 'Siti Sarah',
    phone: '018-7654321',
    location: 'Seksyen 7, Shah Alam',
    tagline: 'Kuih moden & tradisional untuk kenduri dan pejabat',
    email: 'maksom@nivora.my',
    userPassword: DEMO.merchant.password,
    userName: 'Siti Sarah',
    ingredients: [
      { name: 'Tepung Gandum (1kg)', price: 3.40, unit: 'kg' },
      { name: 'Santan Kotak 1L', price: 10.50, unit: 'kotak' },
      { name: 'Gula Pasir Halus (1kg)', price: 2.85, unit: 'kg' },
      { name: 'Minyak Masak Botol (5kg)', price: 31.80, unit: 'tong' },
      { name: 'Kotak Makanan Kraft (100 pcs)', price: 26.00, unit: 'pek' }
    ],
    menu: [
      {
        name: 'Karipap Daging Panas', price: 1.10, cost: 0.48, emoji: '🥟',
        description: 'Karipap saiz besar, sesuai untuk sarapan.',
        recipe: { yieldQty: 50, items: [['Tepung & marjerin', 9.50], ['Inti daging & kentang', 10.00], ['Minyak menggoreng', 3.00], ['Pembungkusan', 1.50]] }
      },
      {
        name: 'Seri Muka Pulut Hitam', price: 1.00, cost: 0.42, emoji: '🍮',
        description: 'Variasi pulut hitam yang lebih lembut.',
        recipe: { yieldQty: 24, items: [['Pulut hitam & santan', 4.32], ['Lapisan pandan & telur', 4.08], ['Gula & garam', 0.84], ['Alas plastik', 0.84]] }
      },
      {
        name: 'Kuih Lapis Pelangi', price: 0.90, cost: 0.36, emoji: '🌈',
        description: 'Warna-warni, digemari kanak-kanak.',
        recipe: { yieldQty: 40, items: [['Tepung beras & ubi', 5.60], ['Santan kotak', 5.60], ['Pewarna & perisa', 1.60], ['Gas & utiliti', 1.60]] }
      },
      {
        name: 'Pulut Panggang Ikan', price: 1.30, cost: 0.60, emoji: '🍃',
        description: 'Inti ikan segar berempah, dibakar arang.',
        recipe: null
      }
    ]
  }
];

const CUSTOMERS = [
  ['Puan Noraini', '019-2233445'], ['Encik Razak (Kenduri)', '017-8899112'],
  ['Cik Faridah', '012-3344556'], ['Puan Salmah', '019-9887766'],
  ['Encik Faizal (Pejabat)', '013-2211445'], ['Puan Hanim', '016-7788990'],
  ['Cik Aisyah', '011-2233445'], ['Encik Danial', '018-9090808'],
  ['Puan Zubaidah', '012-6677889'], ['Cik Melati', '017-4433221'],
  ['Encik Hakim', '019-5566778'], ['Puan Rosmah', '013-8899001']
];

const NOTES = [
  '', '', '', '', 'Kurang manis, seperti biasa.', 'Bungkus berasingan untuk 2 kotak.',
  'Ambil sebelum waktu pejabat.', '', 'Untuk majlis arwah — bungkus cantik.', ''
];

export async function seedIfEmpty(db, { log = console } = {}) {
  const row = await db.get('SELECT COUNT(*) AS n FROM tenants');
  if (Number(row?.n || 0) > 0) {
    log.info?.('[seed] data sedia ada — seed dilangkau.');
    return false;
  }
  await seed(db, { log });
  return true;
}

export async function seed(db, { log = console } = {}) {
  const users = usersRepo(db);
  const tenants = tenantsRepo(db);
  const kuih = kuihRepo(db);
  const ingredients = ingredientsRepo(db);
  const recipes = recipesRepo(db);
  const orders = ordersRepo(db);
  const audit = auditRepo(db);
  const settings = settingsRepo(db);
  const now = stamp();
  const rand = prng();

  await settings.setMany({
    platformName: 'NIVORA',
    platformTagline: 'Pengurusan Pesanan & Untung Kuih Malaysia',
    pickupSlots: ['08:00', '10:30', '14:30', '16:30', '18:00'],
    lowMarginThresholdPct: 35
  });

  const adminPasswordHash = await hashPassword(DEMO.admin.password);
  await users.create({
    id: 'usr_admin',
    tenantId: null,
    name: 'Pentadbir NIVORA',
    email: DEMO.admin.email,
    passwordHash: adminPasswordHash,
    role: 'admin',
    status: 'active',
    createdAt: now,
    updatedAt: now
  });

  for (const spec of TENANTS) {
    await tenants.create({
      id: spec.id,
      name: spec.name,
      slug: spec.slug,
      ownerName: spec.ownerName,
      phone: spec.phone,
      location: spec.location,
      tagline: spec.tagline,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    await users.create({
      id: `usr_${spec.slug}`,
      tenantId: spec.id,
      name: spec.userName,
      email: spec.email,
      passwordHash: await hashPassword(spec.userPassword),
      role: 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    const ingIds = new Map();
    for (const ing of spec.ingredients) {
      const created = await ingredients.create({
        id: `ing_${randomUUID()}`,
        tenantId: spec.id,
        name: ing.name,
        unit: ing.unit,
        priceCents: Math.round(ing.price * 100),
        note: '',
        createdAt: now,
        updatedAt: now
      });
      ingIds.set(ing.name, created.id);
    }

    const menu = [];
    let sort = 0;
    for (const item of spec.menu) {
      const created = await kuih.create({
        id: `kuih_${spec.slug}_${sort}`,
        tenantId: spec.id,
        name: item.name,
        description: item.description,
        unit: 'biji',
        priceCents: Math.round(item.price * 100),
        costCents: Math.round(item.cost * 100),
        status: 'active',
        sortOrder: sort,
        createdAt: now,
        updatedAt: now
      });
      menu.push(created);

      if (item.recipe) {
        await recipes.create({
          id: `rcp_${spec.slug}_${sort}`,
          tenantId: spec.id,
          kuihId: created.id,
          name: `Resipi ${item.name}`,
          yieldQty: item.recipe.yieldQty,
          unit: 'biji',
          sellPriceCents: created.priceCents,
          note: '',
          createdAt: now,
          updatedAt: now
        }, item.recipe.items.map(([name, cost]) => ({
          id: `rit_${randomUUID()}`,
          ingredientId: ingIds.get(name) || null,
          name,
          qty: 1,
          unit: '',
          lineCostCents: Math.round(cost * 100)
        })));
      }
      sort += 1;
    }

    await seedOrders({ orders, spec, menu, rand, tenantId: spec.id });
  }

  await audit.log({
    action: 'system.seeded',
    entity: 'system',
    detail: { note: 'Data demo dimuatkan', tenants: TENANTS.length }
  });

  log.info?.(`[seed] selesai — ${TENANTS.length} kedai, ${TENANTS.reduce((s, t) => s + t.menu.length, 0)} menu.`);
  return true;
}

async function seedOrders({ orders, spec, menu, rand, tenantId }) {
  const times = ['08:00', '10:30', '14:30', '16:30', '18:00'];
  const totalDays = 26;

  for (let d = totalDays; d >= 0; d--) {
    const date = daysAgoISO(d);
    const count = d === 0 ? 4 : 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const [customerName, basePhone] = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
      const picks = 1 + Math.floor(rand() * 2.6);
      const chosen = new Set();
      while (chosen.size < Math.min(picks, menu.length)) chosen.add(Math.floor(rand() * menu.length));

      const items = [...chosen].map((idx) => {
        const k = menu[idx];
        const qty = (1 + Math.floor(rand() * 10)) * 5;
        return {
          id: `oit_${randomUUID()}`,
          kuihId: k.id,
          name: k.name,
          qty,
          unitPriceCents: k.priceCents,
          unitCostCents: k.costCents,
          lineTotalCents: qty * k.priceCents
        };
      });

      let status;
      if (d === 0) status = ['baru', 'baru', 'disediakan', 'sedia'][i % 4];
      else if (d === 1) status = ['disediakan', 'sedia', 'selesai'][i % 3];
      else status = rand() > 0.06 ? 'selesai' : 'batal';

      const pickupTime = times[Math.floor(rand() * times.length)];
      const createdHour = Math.max(6, Number(pickupTime.slice(0, 2)) - 2 - Math.floor(rand() * 3));
      const createdAt = `${date} ${String(createdHour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`;

      const totalCents = items.reduce((s, it) => s + it.lineTotalCents, 0);
      const costCents = items.reduce((s, it) => s + it.qty * it.unitCostCents, 0);

      await orders.create({
        id: `ord_${randomUUID()}`,
        tenantId,
        code: null,
        customerName,
        phone: basePhone,
        pickupDate: date,
        pickupTime,
        status,
        channel: ['walkin', 'whatsapp', 'telefon', 'web'][Math.floor(rand() * 4)],
        note: NOTES[Math.floor(rand() * NOTES.length)],
        totalCents,
        costCents,
        discountCents: 0,
        createdBy: null,
        createdAt,
        updatedAt: createdAt
      }, items);
    }
  }
}

// CLI: node src/db/seed.js [--reset]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { getDb, closeDb } = await import('./index.js');
  const { runMigrations } = await import('./migrate.js');
  const db = await getDb();
  await runMigrations(db);

  if (process.argv.includes('--reset')) {
    for (const table of ['order_items', 'orders', 'recipe_items', 'recipes', 'kuih', 'ingredients',
      'sessions', 'audit_logs', 'users', 'tenants', 'settings', 'counters']) {
      await db.run(`DELETE FROM ${table}`);
    }
    console.log('Data lama dipadam.');
  }

  const seeded = await seedIfEmpty(db);
  console.log(seeded ? 'Seed selesai.' : 'Tiada perubahan (data sedia ada).');
  await closeDb();
}

export { addDaysISO, todayISO };

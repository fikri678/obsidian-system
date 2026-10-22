/**
 * Ujian asap (smoke test) API hujung-ke-hujung.
 * Penggunaan: node scripts/smoke-test.js [http://127.0.0.1:4173]
 * Nota: ujian ini mencipta data sementara. Jalankan `npm run reset` selepasnya
 * jika anda mahu data demo bersih.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4173';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    return { status: res.status, data: payload?.data ?? null, error: payload?.error ?? null, text };
  };
}

const anon = client();
const merchant = client();
const admin = client();
const temp = client();
const temp2 = client();
const unique = Date.now().toString(36);

console.log(`\nUjian API — ${BASE}\n`);

/* ---------- 1. Keselamatan & auth ---------- */
console.log('1. Keselamatan');
{
  const res = await anon('/api/orders');
  check('pesanan tanpa sesi ditolak (401)', res.status === 401, `status ${res.status}`);

  const login = await merchant('/api/auth/login', { method: 'POST', body: { email: 'kakani@nivora.my', password: 'user123' } });
  check('log masuk peniaga berjaya', login.status === 200 && login.data?.user?.role === 'user');
  check('cookie sesi HttpOnly dihantar', login.status === 200);

  const me = await merchant('/api/auth/me');
  check('profil sesi peniaga betul', me.status === 200 && me.data?.tenant?.slug === 'kak-ani');

  const forbidden = await merchant('/api/admin/overview');
  check('peniaga tidak boleh akses admin (403)', forbidden.status === 403, `status ${forbidden.status}`);

  const crossSite = await merchant('/api/orders', {
    method: 'POST',
    headers: { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' },
    body: { customerName: 'X', phone: '0123456789', items: [] }
  });
  check('permintaan rentas laman disekat', crossSite.status === 403, `status ${crossSite.status}`);

  const badLogin = await anon('/api/auth/login', { method: 'POST', body: { email: 'kakani@nivora.my', password: 'salah' } });
  check('kata laluan salah ditolak (401)', badLogin.status === 401, `status ${badLogin.status}`);
}

/* ---------- 2. Pesanan ---------- */
console.log('\n2. Pesanan');
let createdOrder = null;
{
  const menu = await merchant('/api/kuih');
  check('menu peniaga dimuatkan', menu.status === 200 && menu.data.length >= 5, `${menu.data?.length} item`);

  const k1 = menu.data[0];
  const k2 = menu.data[1];
  const expected = k1.priceCents * 3 + k2.priceCents * 2;

  const res = await merchant('/api/orders', {
    method: 'POST',
    body: {
      customerName: 'Ujian Asap',
      phone: '012-9998877',
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupTime: '16:30',
      note: 'ujian automatik',
      items: [{ kuihId: k1.id, qty: 3 }, { kuihId: k2.id, qty: 2 }]
    }
  });
  check('cipta pesanan (201)', res.status === 201, `status ${res.status} ${JSON.stringify(res.error || '')}`);
  check('jumlah dikira betul', res.data?.totalCents === expected, `${res.data?.totalCents} vs ${expected}`);
  check('kos disimpan sebagai snapshot', res.data?.costCents === k1.costCents * 3 + k2.costCents * 2);
  check('kod pesanan berformat KUIH-####', /^KUIH-\d{4,}$/.test(res.data?.code || ''), res.data?.code);
  createdOrder = res.data;

  const dup = await merchant('/api/orders', {
    method: 'POST',
    body: { customerName: 'Ujian', phone: '0129998877', pickupDate: new Date().toISOString().slice(0, 10), pickupTime: '10:30', items: [{ kuihId: k1.id, qty: 0 }] }
  });
  check('kuantiti tidak sah ditolak (422)', dup.status === 422, `status ${dup.status}`);

  const past = await merchant('/api/orders', {
    method: 'POST',
    body: { customerName: 'Ujian', phone: '0129998877', pickupDate: '2000-01-01', pickupTime: '10:30', items: [{ kuihId: k1.id, qty: 1 }] }
  });
  check('tarikh lampau ditolak (422)', past.status === 422, `status ${past.status}`);

  const advanced = await merchant(`/api/orders/${createdOrder.id}/advance`, { method: 'POST', body: {} });
  check('status maju ke disediakan', advanced.data?.status === 'disediakan');

  const setSedia = await merchant(`/api/orders/${createdOrder.id}/status`, { method: 'PATCH', body: { status: 'sedia' } });
  check('status ditetapkan ke sedia', setSedia.data?.status === 'sedia');

  const wa = await merchant(`/api/orders/${createdOrder.id}/whatsapp`);
  check('resit WhatsApp dijana', wa.status === 200 && wa.data?.text?.includes(createdOrder.code));
  check('pautan wa.me dijana', /^https:\/\/wa\.me\/60\d+\?text=/.test(wa.data?.waUrl || ''), wa.data?.waUrl?.slice(0, 40));
  check('resit mengandungi arahan pengambilan', /Sila simpan resit ini dan tunjukkan semasa waktu pengambilan kuih\./.test(wa.data?.text || ''));
  check('resit guna format rasmi NIVORA',
    /RESIT PENGESAHAN TEMPAHAN - NIVORA/.test(wa.data?.text || '')
    && /\*No\. Tempahan:\* #/.test(wa.data?.text || ''));

  const search = await merchant(`/api/orders?q=${encodeURIComponent("' OR 1=1 --")}`);
  check('carian parameterized selamat', search.status === 200 && Array.isArray(search.data.orders));
}

/* ---------- 3. Katalog, resipi & bahan ---------- */
console.log('\n3. Katalog & resipi');
let newKuih = null;
{
  const created = await merchant('/api/kuih', {
    method: 'POST',
    body: { name: `Kuih Ujian ${unique}`, price: 1.5, cost: 0.6, unit: 'biji', description: 'sementara' }
  });
  check('cipta menu kuih', created.status === 201 && created.data?.priceCents === 150, `status ${created.status}`);
  newKuih = created.data;

  const recipe = await merchant('/api/recipes', {
    method: 'POST',
    body: {
      name: `Resipi Ujian ${unique}`,
      kuihId: newKuih.id,
      yieldQty: 10,
      unit: 'biji',
      sellPrice: 1.5,
      items: [{ name: 'Bahan A', qty: 1, lineCost: 4.0 }, { name: 'Bahan B', qty: 1, lineCost: 1.0 }]
    }
  });
  check('cipta resipi', recipe.status === 201, `status ${recipe.status} ${JSON.stringify(recipe.error || '')}`);
  check('kos seunit resipi = 0.50', recipe.data?.costPerUnitCents === 50, String(recipe.data?.costPerUnitCents));

  const updatedMenu = await merchant('/api/kuih');
  const synced = updatedMenu.data.find((k) => k.id === newKuih.id);
  check('kos menu disegerak daripada resipi', synced?.costCents === 50, String(synced?.costCents));

  const ing = await merchant('/api/ingredients', { method: 'POST', body: { name: `Bahan Ujian ${unique}`, price: 9.9, unit: 'kg' } });
  check('tambah bahan mentah', ing.status === 201);

  const ingPatch = await merchant(`/api/ingredients/${ing.data.id}`, { method: 'PATCH', body: { price: 12.5 } });
  check('kemas kini harga bahan', ingPatch.data?.priceCents === 1250);

  const archived = await merchant(`/api/kuih/${newKuih.id}`, { method: 'DELETE' });
  check('arkib menu', archived.status === 200);

  const activeMenu = await merchant('/api/kuih');
  check('menu diarkib tidak dipaparkan', !activeMenu.data.some((k) => k.id === newKuih.id));
}

/* ---------- 4. Pembantu data ---------- */
console.log('\n4. Pembantu data');
{
  const ans = await merchant('/api/assistant', { method: 'POST', body: { question: 'Kira untung 100 biji karipap, kos RM0.45, jual RM1.00' } });
  check('jawapan pembantu dijana', ans.status === 200 && /RM 55\.00/.test(ans.data?.answer || ''), ans.data?.answer?.slice(0, 60));
  const ranking = await merchant('/api/assistant', { method: 'POST', body: { question: 'Kuih mana paling untung?' } });
  check('analisis margin berfungsi', ranking.status === 200 && /Margin/.test(ranking.data?.answer || ''));
}

/* ---------- 5. Borang awam ---------- */
console.log('\n5. Borang awam');
{
  const shops = await anon('/api/public/tenants');
  check('senarai kedai awam dimuatkan', shops.status === 200 && shops.data?.shops?.length >= 2);
  check('setiap kedai ada slug, menu & harga minimum',
    shops.data.shops.every((s) => s.slug && s.menuCount > 0 && Number.isInteger(s.minPriceCents)));
  check('senarai kedai ada pratonton menu',
    shops.data.shops.every((s) => Array.isArray(s.topMenu) && s.topMenu.length > 0));

  const shop = await anon('/api/public/tenants/kak-ani');
  check('profil awam kedai dimuatkan', shop.status === 200 && shop.data?.menu?.length >= 5);

  const pub = await anon('/api/public/orders', {
    method: 'POST',
    body: {
      tenantSlug: 'kak-ani',
      customerName: 'Pelanggan Awam',
      phone: '011-22334455',
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupTime: '10:30',
      items: [{ kuihId: shop.data.menu[0].id, qty: 4 }]
    }
  });
  check('tempahan awam diterima', pub.status === 201 && /^KUIH-/.test(pub.data?.code || ''), `status ${pub.status}`);

  check('respons tempahan sertakan item untuk resit',
    Array.isArray(pub.data?.items) && pub.data.items.length === 1
    && Number.isInteger(pub.data.items[0].unitPriceCents)
    && Number.isInteger(pub.data.items[0].lineTotalCents));
  check('resit TIDAK didedahkan kepada pelanggan', pub.data.receipt === undefined);

  const noPhone = await anon('/api/public/orders', {
    method: 'POST',
    body: {
      tenantSlug: 'kak-ani',
      customerName: 'Tanpa Nombor',
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupTime: '10:30',
      items: [{ kuihId: shop.data.menu[0].id, qty: 1 }]
    }
  });
  check('nombor WhatsApp wajib (422)', noPhone.status === 422, `status ${noPhone.status}`);

  const lookup = await anon(`/api/public/tenants/kak-ani/orders/${pub.data.code}?phone=011-22334455`);
  check('semakan status tanpa log masuk', lookup.status === 200 && lookup.data?.code === pub.data.code, `status ${lookup.status}`);
  check('status & item dipulihkan', Array.isArray(lookup.data?.items) && lookup.data.items.length > 0);
  check('resit tidak dedahkan dalam semakan status', lookup.data?.receipt === undefined);

  const wrongPhone = await anon(`/api/public/tenants/kak-ani/orders/${pub.data.code}?phone=019-0000000`);
  check('telefon salah → 404', wrongPhone.status === 404, `status ${wrongPhone.status}`);

  const noLookupPhone = await anon(`/api/public/tenants/kak-ani/orders/${pub.data.code}`);
  check('semakan tanpa telefon → 422', noLookupPhone.status === 422, `status ${noLookupPhone.status}`);

  const unknownCode = await anon('/api/public/tenants/kak-ani/orders/KUIH-0000?phone=011-22334455');
  check('kod tidak wujud → 404', unknownCode.status === 404, `status ${unknownCode.status}`);

  const missing = await anon('/api/public/tenants/tiada-kedai');
  check('slug tidak sah → 404', missing.status === 404);
}

/* ---------- 6. Pentadbir ---------- */
console.log('\n6. Pentadbir');
let newTenant = null;
{
  const login = await admin('/api/auth/login', { method: 'POST', body: { email: 'admin@nivora.my', password: 'admin123' } });
  check('log masuk pentadbir', login.status === 200 && login.data?.user?.role === 'admin');

  const overview = await admin('/api/admin/overview');
  check('gambaran platform', overview.status === 200 && overview.data?.counts?.tenants >= 2);

  const adminOnMerchant = await admin('/api/dashboard');
  check('pentadbir tidak boleh guna laluan peniaga', adminOnMerchant.status === 403, `status ${adminOnMerchant.status}`);

  const tenant = await admin('/api/admin/tenants', {
    method: 'POST',
    body: { name: `Kedai Ujian ${unique}`, ownerName: 'Pemilik Ujian', phone: '019-1112222', location: 'Kajang' }
  });
  check('daftar peniaga baharu', tenant.status === 201 && tenant.data?.slug?.startsWith('kedai-ujian'), `status ${tenant.status} ${JSON.stringify(tenant.error || '')}`);
  newTenant = tenant.data;

  const user = await admin('/api/admin/users', {
    method: 'POST',
    body: { name: 'Pengguna Ujian', email: `uji-${unique}@nivora.my`, password: 'uji12345', role: 'user', tenantId: newTenant.id }
  });
  check('cipta akaun peniaga', user.status === 201 && user.data?.tenantId === newTenant.id, `status ${user.status} ${JSON.stringify(user.error || '')}`);

  const loginNew = await temp('/api/auth/login', { method: 'POST', body: { email: `uji-${unique}@nivora.my`, password: 'uji12345' } });
  check('akaun baharu boleh log masuk', loginNew.status === 200);
  const dash = await temp('/api/dashboard');
  check('papan pemuka peniaga baharu kosong', dash.status === 200 && dash.data?.metrics?.orders === 0);

  const suspended = await admin(`/api/admin/tenants/${newTenant.id}`, { method: 'PATCH', body: { status: 'suspended' } });
  check('gantung kedai', suspended.data?.status === 'suspended');
  const blocked = await temp('/api/dashboard');
  check('kedai digantung tidak boleh akses', blocked.status === 403, `status ${blocked.status}`);

  await admin(`/api/admin/tenants/${newTenant.id}`, { method: 'PATCH', body: { status: 'active' } });

  const pw = await temp('/api/auth/password', { method: 'POST', body: { currentPassword: 'uji12345', newPassword: 'uji67890' } });
  check('tukar kata laluan sendiri', pw.status === 200, `status ${pw.status}`);

  const staleLogin = await client()('/api/auth/login', { method: 'POST', body: { email: `uji-${unique}@nivora.my`, password: 'uji12345' } });
  check('kata laluan lama tidak lagi sah', staleLogin.status === 401, `status ${staleLogin.status}`);

  const freshLogin = await temp2('/api/auth/login', { method: 'POST', body: { email: `uji-${unique}@nivora.my`, password: 'uji67890' } });
  check('kata laluan baru berfungsi', freshLogin.status === 200, `status ${freshLogin.status}`);

  const audit = await admin('/api/admin/audit?limit=50');
  check('log audit merekod tindakan', audit.status === 200 && audit.data.some((a) => a.action === 'tenant.created'));

  const settings = await admin('/api/admin/settings', { method: 'PATCH', body: { lowMarginThresholdPct: 38 } });
  check('kemas kini tetapan platform', settings.data?.lowMarginThresholdPct === 38);

  const deleteUser = await admin(`/api/admin/users/${user.data.id}`, { method: 'DELETE' });
  check('padam pengguna ujian', deleteUser.status === 200);
}

/* ---------- 7. Log keluar ---------- */
console.log('\n7. Log keluar');
{
  const out = await merchant('/api/auth/logout', { method: 'POST', body: {} });
  check('log keluar berjaya', out.status === 200);
  const after = await merchant('/api/auth/me');
  check('sesi tamat selepas log keluar', after.status === 401);
}

console.log(`\nKeputusan: ${passed} lulus, ${failed} gagal`);
if (failed) {
  console.log('Kegagalan:\n' + failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}

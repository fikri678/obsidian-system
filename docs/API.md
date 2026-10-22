# API Reference

Base URL: `http://127.0.0.1:4173`

Semua respons JSON:

```json
// berjaya
{ "data": { } }
// ralat
{ "error": { "message": "…", "code": "VALIDATION_ERROR", "details": { } } }
```

Pengesahan menggunakan cookie sesi `nivora_sid` (HttpOnly, SameSite=Lax).
Semua permintaan mutasi mesti datang daripada origin yang sama.

Kod status yang digunakan: `200`, `201`, `204`, `400`, `401`, `403`, `404`,
`409`, `422`, `429`, `500`.

---

## Auth

### POST `/api/auth/login`
```json
{ "email": "kakani@nivora.my", "password": "user123" }
```
Respons: `{ user, tenant, expiresAt, config }` + `Set-Cookie`.

Ralat: `401` kredensial salah, `403` akaun/kedai tidak aktif, `429` terlalu
banyak cubaan.

### POST `/api/auth/logout`
Membuang sesi dan cookie. `200 { ok: true }`.

### GET `/api/auth/me`
`200 { user, tenant, config }` atau `401`.

### POST `/api/auth/password`
```json
{ "currentPassword": "…", "newPassword": "…" }
```
Menamatkan semua sesi. `200 { ok, message }`.

---

## Peniaga (`role = user`)

### GET `/api/dashboard`
Query: `range=today|7d|30d|90d|all|custom`, `from`, `to` (YYYY-MM-DD).

```json
{
  "tenant": { "id": "…", "name": "…", "slug": "kak-ani" },
  "range": { "key": "7d", "from": "2026-10-16", "to": "2026-10-22", "label": "7 hari terakhir" },
  "metrics": { "orders": 24, "done": 18, "grossCents": 112850, "costCents": 48150,
               "netCents": 64700, "marginPct": 57.3, "avgOrderCents": 4702 },
  "previous": { … }, "deltas": { "grossPct": 12.4, "netPct": 9.1, "ordersPct": 8 },
  "series": [ { "date": "2026-10-16", "label": "16 Okt", "orders": 3,
                "grossCents": 12500, "netCents": 7100 } ],
  "statusCounts": { "baru": 4, "disediakan": 1, "sedia": 2, "selesai": 17, "batal": 0 },
  "topKuih": [ { "name": "Karipap…", "qty": 135, "revenueCents": 13500 } ],
  "lowMargin": [ { "name": "…", "marginPct": 32 } ],
  "pickups": [ { "id": "ord_…", "code": "KUIH-1085", "customerName": "…",
                 "pickupTime": "10:30", "items": [ … ], "totalQty": 55 } ],
  "recentOrders": [ … ],
  "alerts": [ { "type": "info", "text": "4 pesanan baru menunggu pengesahan." } ],
  "insight": "Karipap Pusing Daging paling laris (135 unit) dalam tempoh ini.",
  "today": { "date": "2026-10-22", "pickups": 6, "pending": 5 }
}
```

### GET `/api/orders`
Query: `status=baru|disediakan|sedia|selesai|batal|ALL`, `q`, `from`, `to`,
`limit` (≤500), `offset`.

`200 { orders: [ { id, code, customerName, phone, pickupDate, pickupTime,
status, channel, note, totalCents, costCents, profitCents, items: [
{ name, qty, unitPriceCents, unitCostCents, lineTotalCents } ] } ], count }`

### GET `/api/orders/:id`
Pesanan tunggal + item. `404` jika tiada atau bukan milik tenant.

### POST `/api/orders`
```json
{
  "customerName": "Puan Hanim",
  "phone": "012-3456789",
  "pickupDate": "2026-10-23",
  "pickupTime": "16:30",
  "channel": "whatsapp",
  "note": "Kurang manis",
  "discount": 0,
  "items": [ { "kuihId": "kuih_…", "qty": 30 } ]
}
```
Harga & kos diambil snapshot daripada menu aktif. `201` pesanan penuh.

Ralat `422`: tiada item, kuantiti < 1, tarikh lampau, telefon tidak sah,
diskaun melebihi jumlah.

### PATCH `/api/orders/:id/status`
```json
{ "status": "sedia" }
```
 nilai sah: `baru`, `disediakan`, `sedia`, `selesai`, `batal`.
Pesanan yang dibatalkan tidak boleh diaktifkan semula.

### POST `/api/orders/:id/advance`
Majukan satu langkah: `baru → disediakan → sedia → selesai`.

### GET `/api/orders/:id/whatsapp`
`200 { text, phone, code, waUrl }` — resit digital pelanggan (kedai, no. resit,
item & kuantiti, jumlah, tarikh/waktu pengambilan, arahan pengambilan). `waUrl`
ialah pautan `https://wa.me/60…?text=…` sedia dibuka.

### Menu kuih

| Kaedah | Laluan | Badan |
| --- | --- | --- |
| GET | `/api/kuih?all=1` | — (tanpa `all`, hanya status aktif) |
| POST | `/api/kuih` | `{ name, description, price, cost, unit, sortOrder }` |
| PATCH | `/api/kuih/:id` | mana-mana medan di atas + `status` |
| DELETE | `/api/kuih/:id` | — (arkib, bukan padam keras) |

`price`/`cost` dalam Ringgit (nombor); pelayan menukar kepada sen.

### Bahan mentah

| Kaedah | Laluan | Badan |
| --- | --- | --- |
| GET | `/api/ingredients` | — |
| POST | `/api/ingredients` | `{ name, price, unit, note }` |
| PATCH | `/api/ingredients/:id` | mana-mana medan di atas |
| DELETE | `/api/ingredients/:id` | — |

### Resipi

| Kaedah | Laluan | Badan |
| --- | --- | --- |
| GET | `/api/recipes` | — (termasuk `items`, `totalCostCents`, `costPerUnitCents`) |
| POST | `/api/recipes` | lihat di bawah |
| PATCH | `/api/recipes/:id` | medan resipi + `items` (ganti penuh jika dihantar) |
| DELETE | `/api/recipes/:id` | — |

```json
{
  "name": "Resipi Karipap",
  "kuihId": "kuih_kak-ani_0",
  "yieldQty": 50,
  "unit": "biji",
  "sellPrice": 1.00,
  "items": [
    { "name": "Tepung & marjerin", "qty": 1, "unit": "", "lineCost": 9.00 },
    { "name": "Inti daging", "qty": 1, "unit": "", "lineCost": 9.50 }
  ]
}
```
`costPerUnitCents = round(sum(lineCost) * 100 / yieldQty)`. Jika `kuihId`
diberikan, kos menu kuih disegerakkan.

### Profil kedai

| Kaedah | Laluan | Badan |
| --- | --- | --- |
| GET | `/api/tenant` | — |
| PATCH | `/api/tenant` | `{ name, ownerName, phone, location, tagline }` |

### POST `/api/assistant`
```json
{ "question": "Kira untung 100 biji karipap, kos RM0.45, jual RM1.00" }
```
`200 { answer (markdown), suggestions: [ … ] }`

---

## Pentadbir (`role = admin`)

| Kaedah | Laluan | Nota |
| --- | --- | --- |
| GET | `/api/admin/overview` | `{ counts, metrics, growthPct, series, tenantBreakdown, statusCounts, recentOrders, activity }` |
| GET | `/api/admin/tenants` | Termasuk `orders`, `grossCents`, `netCents`, `marginPct`, `userCount` |
| POST | `/api/admin/tenants` | `{ name, slug?, ownerName, phone, location, tagline }` |
| PATCH | `/api/admin/tenants/:id` | Medan di atas + `status: active\|suspended` |
| GET | `/api/admin/tenants/:id/menu` | `{ tenant, kuih, recipes }` |
| GET | `/api/admin/users` | Disertakan `tenantName`, `tenantSlug` |
| POST | `/api/admin/users` | `{ name, email, password, role, tenantId }` |
| PATCH | `/api/admin/users/:id` | `{ name, email, role, tenantId, status, password? }` |
| DELETE | `/api/admin/users/:id` | Tidak boleh memadam diri sendiri |
| GET | `/api/admin/orders` | `tenantId`, `status`, `q`, `from`, `to`, `limit` |
| PATCH | `/api/admin/orders/:id/status` | `{ status }` |
| GET | `/api/admin/audit` | `tenantId`, `q`, `limit` (≤300) |
| GET | `/api/admin/settings` | `{ platformName, platformTagline, pickupSlots, lowMarginThresholdPct }` |
| PATCH | `/api/admin/settings` | Medan di atas; slot mesti `HH:MM`, disusun automatik |

---

## Awam

### GET `/api/public/tenants`
Direktori kedai aktif untuk pemilih kedai pelanggan. `200`:

```json
{
  "shops": [
    {
      "name": "Kak Ani Kuih Tradisional",
      "slug": "kak-ani",
      "tagline": "Kuih tradisional segar setiap pagi sejak 2011",
      "location": "Kampung Baru, Kuala Lumpur",
      "phone": "013-9876543",
      "menuCount": 6,
      "minPriceCents": 80,
      "topMenu": [ { "name": "Karipap Pusing Daging", "emoji": "🥟" } ]
    }
  ]
}
```

Hanya kedai berstatus `active` disenaraikan. Kedai digantung tidak dipaparkan.

### GET `/api/public/tenants/:slug`
```json
{
  "tenant": { "name": "Kak Ani Kuih Tradisional", "slug": "kak-ani",
              "location": "Kampung Baru, Kuala Lumpur", "phone": "013-9876543" },
  "menu": [ { "id": "kuih_…", "name": "Karipap Pusing Daging",
              "priceCents": 100, "unit": "biji" } ],
  "pickupSlots": ["08:00", "10:30", "14:30", "16:30", "18:00"],
  "minDate": "2026-10-22"
}
```
`404` jika slug tiada atau kedai digantung.

### POST `/api/public/orders`
```json
{
  "tenantSlug": "kak-ani",
  "customerName": "Puan Hanim",
  "phone": "012-3456789",
  "pickupDate": "2026-10-23",
  "pickupTime": "10:30",
  "note": "",
  "items": [ { "kuihId": "kuih_…", "qty": 20 } ]
}
```
`phone` **wajib** (digunakan peniaga untuk menghantar resit). `201`:

```json
{
  "code": "KUIH-1086",
  "pickupDate": "2026-10-23",
  "pickupTime": "10:30",
  "totalCents": 5800,
  "status": "baru",
  "tenantName": "Kak Ani Kuih Tradisional",
  "location": "Kampung Baru, Kuala Lumpur",
  "items": [
    { "name": "Karipap Pusing Daging", "qty": 4, "unitPriceCents": 100, "lineTotalCents": 400 }
  ]
}
```

Respons **tidak** mengandungi resit atau pautan WhatsApp. Resit dijana hanya
melalui endpoint peniaga `GET /api/orders/:id/whatsapp`; pelanggan tidak boleh
membuka/menghantar resit ke nombornya sendiri.

Had kadar: 8 permintaan / 10 minit / IP (`429`); telefon hilang → `422`.

### GET `/api/public/tenants/:slug/orders/:code?phone=…`
Semakan status tempahan pelanggan **tanpa log masuk**. Nombor resit + nombor
WhatsApp bertindak sebagai bukti pemilikan.

```json
{
  "code": "KUIH-1086",
  "status": "sedia",
  "pickupDate": "2026-10-23",
  "pickupTime": "16:30",
  "totalCents": 5800,
  "items": [ { "name": "Karipap Pusing Daging", "qty": 40, "unitPriceCents": 100, "lineTotalCents": 4000 } ],
  "tenant": { "name": "Kak Ani Kuih Tradisional", "location": "Kampung Baru, Kuala Lumpur", "phone": "013-9876543" }
}
```

Tiada resit dalam respons. `404` jika kod tiada **atau** telefon tidak sepadan
(tidak mendedahkan kewujudan kod); `422` jika telefon tiada. Had kadar 20
semakan / 10 minit / IP.

### GET `/api/health`
`200 { ok: true, platform, time }`

---

## Contoh dengan curl

```bash
# log masuk & simpan cookie
curl -c /tmp/cj -X POST http://127.0.0.1:4173/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"kakani@nivora.my","password":"user123"}'

# papan pemuka 30 hari
curl -b /tmp/cj 'http://127.0.0.1:4173/api/dashboard?range=30d'

# cipta pesanan
curl -b /tmp/cj -X POST http://127.0.0.1:4173/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Ujian","phone":"012-3456789","pickupDate":"2026-10-23",
       "pickupTime":"16:30","items":[{"kuihId":"kuih_kak-ani_0","qty":10}]}'
```

# Migrasi ke pangkalan data SQL sebenar (PostgreSQL / MySQL)

Sistem ini direka supaya **hanya lapisan repositori** tahu tentang SQL. Apabila
tiba masa untuk berpindah daripada SQLite kepada PostgreSQL (atau MySQL),
perubahan tertumpu pada satu fail pemacu dan satu folder migrasi.

## 1. Kontrak pemacu

Setiap pemacu mesti melaksanakan antara muka ini (`src/db/drivers/sqlite.js`):

```js
{
  dialect: 'sqlite' | 'postgres',
  query(sql, params) -> Promise<Array<object>>,   // SELECT banyak baris
  get(sql, params)   -> Promise<object|null>,     // SELECT satu baris
  run(sql, params)   -> Promise<{ changes }>,     // INSERT/UPDATE/DELETE
  exec(sql)          -> Promise<void>,            // DDL tanpa parameter
  tx(fn)             -> Promise<any>,             // transaksi (boleh bersarang)
  close()            -> Promise<void>
}
```

Servis tidak pernah memanggil `query` secara terus — mereka memanggil repositori
(`src/db/repositories/*.repo.js`), dan repositori hanya menggunakan kontrak di atas.

## 2. Perkara yang sudah mudah alih

- **Tiada sintaks khusus SQLite** dalam pertanyaan: tiada `AUTOINCREMENT`,
  `PRAGMA`, `json_extract`, `strftime`, atau `INSERT OR REPLACE`.
- **ID teks (UUID)**, bukan auto-increment.
- **Wang integer sen** (`INTEGER`) — tepat dalam kedua-dua enjin.
- **Cap waktu teks** `YYYY-MM-DD HH:MM:SS` (boleh diisih, tiada zon masa).
- **`ON CONFLICT (name) DO UPDATE`** digunakan untuk penjana kod pesanan —
  sah dalam SQLite ≥ 3.24, PostgreSQL ≥ 9.5, MySQL 8 memerlukan
  `ON DUPLICATE KEY UPDATE` (lihat bahagian 5).
- `LIMIT ?` / `OFFSET ?` disokong oleh SQLite, PostgreSQL dan MySQL.
- Semua penggabungan dinamik (`WHERE`, `ORDER BY`) hanya melibatkan senarai
  lajur tetap, bukan input pengguna.

## 3. Langkah migrasi ke PostgreSQL

1. Pasang pemacu:
   ```bash
   npm install pg
   ```
2. Tetapkan persekitaran:
   ```bash
   DB_DRIVER=postgres
   DATABASE_URL=postgres://user:password@host:5432/nivora
   ```
3. Jalankan migrasi:
   ```bash
   npm run migrate
   ```
   `src/db/migrate.js` membaca folder `migrations/` yang sama. DDL adalah
   standard SQL. Jika PostgreSQL mengeluh tentang `REAL` untuk `qty`, tukar
   kepada `NUMERIC(12,3)` dalam migrasi baharu (bukan mengubah migrasi lama).
4. Pindahkan data. Pilihan paling mudah: eksport setiap jadual daripada SQLite
   sebagai CSV/JSON dan import dengan `COPY`, mengikut susunan:
   `tenants → users → kuih → ingredients → recipes → recipe_items →
   orders → order_items → settings → counters → audit_logs`.
5. Jalankan `node scripts/smoke-test.js` terhadap pelayan baharu.

Pemacu PostgreSQL dalam repo ini (`src/db/drivers/postgres.js`) sudah menukar
placeholder `?` kepada `$1, $2, …` secara automatik dan menggunakan
`BEGIN`/`SAVEPOINT`. Ia belum diuji terhadap pelayan PostgreSQL hidup —
anggapnya sebagai titik permulaan, bukan penyelesaian siap.

## 4. Jika memilih MySQL

Perlu pemacu baharu (`mysql2/promise`) dengan kontrak yang sama, plus:

- `?` placeholder disokong secara asli.
- `changes` daripada `result.affectedRows`.
- Transaksi: `START TRANSACTION` / `SAVEPOINT` / `COMMIT`.
- `TEXT` untuk ID adalah sah, tetapi index `UNIQUE` pada `TEXT` memerlukan
  panjang had (contoh `VARCHAR(64)`) — buat migrasi baharu yang menukar lajur
  ID kepada `VARCHAR(64)`.

## 5. Perbezaan yang perlu diberi perhatian

| Isu | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| Upsert penjana kod | `ON CONFLICT … DO UPDATE` | sama | `ON DUPLICATE KEY UPDATE` |
| `RETURNING` | disokong (3.35+) | disokong | terhad (MariaDB ya) |
| Boolean | integer 0/1 | `BOOLEAN` | `TINYINT(1)` |
| `LIKE` case | tidak sensitif (ASCII) | sensitif | bergantung collation |
| Had rowCount | `changes` | `rowCount` | `affectedRows` |

Kod sedia ada mengelak semua perbezaan ini kecuali upsert penjana kod, yang
terkurung dalam satu repositori (`orders.repo.js → nextCode`).

## 6. Migrasi skema pada masa hadapan

Jangan ubah `001_init.sql`. Tambah fail baharu:

```
src/db/migrations/002_tambah_lajur_disahkan.sql
```

`runMigrations()` akan mengesan fail baharu dan melaksanakannya dalam satu
transaksi, merekod dalam `schema_migrations`. Skrip ini idempotent — selamat
dijalankan pada setiap permulaan pelayan.

## 7. Sandaran

SQLite dalam mod WAL. Untuk sandaran konsisten semasa berjalan:

```bash
sqlite3 data/nivora.db ".backup 'data/backup-$(date +%F).db'"
```

atau hentikan pelayan dan salin `data/nivora.db` (termasuk fail `-wal` dan
`-shm` jika ada).

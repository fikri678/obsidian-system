CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  owner_name    TEXT,
  phone         TEXT,
  location      TEXT,
  tagline       TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS kuih (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  unit        TEXT NOT NULL DEFAULT 'biji',
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kuih_tenant ON kuih (tenant_id, status);

CREATE TABLE IF NOT EXISTS ingredients (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'kg',
  price_cents INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ingredients_tenant ON ingredients (tenant_id);

CREATE TABLE IF NOT EXISTS recipes (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  kuih_id          TEXT,
  name             TEXT NOT NULL,
  yield_qty        INTEGER NOT NULL DEFAULT 1,
  unit             TEXT NOT NULL DEFAULT 'biji',
  sell_price_cents INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (kuih_id) REFERENCES kuih (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_kuih ON recipes (kuih_id);

CREATE TABLE IF NOT EXISTS recipe_items (
  id             TEXT PRIMARY KEY,
  recipe_id      TEXT NOT NULL,
  ingredient_id  TEXT,
  name           TEXT NOT NULL,
  qty            REAL NOT NULL DEFAULT 1,
  unit           TEXT,
  line_cost_cents INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items (recipe_id);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  code           TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  pickup_date    TEXT NOT NULL,
  pickup_time    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'baru',
  channel        TEXT NOT NULL DEFAULT 'walkin',
  note           TEXT,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  cost_cents     INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_code ON orders (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON orders (tenant_id, pickup_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL,
  kuih_id          TEXT,
  name             TEXT NOT NULL,
  qty              INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents  INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  FOREIGN KEY (kuih_id) REFERENCES kuih (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name    TEXT,
  tenant_id     TEXT,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  detail        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs (tenant_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

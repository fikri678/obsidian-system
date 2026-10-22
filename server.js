import { config, DEMO } from './src/config.js';
import { createApp } from './src/lib/http.js';
import { bootstrapDatabase, closeDb } from './src/db/index.js';
import { buildContainer } from './src/services/container.js';
import { attachUser } from './src/middleware/auth.js';
import { registerAuthRoutes } from './src/routes/auth.routes.js';
import { registerMerchantRoutes } from './src/routes/merchant.routes.js';
import { registerAdminRoutes } from './src/routes/admin.routes.js';
import { registerPublicRoutes } from './src/routes/public.routes.js';

const { db } = await bootstrapDatabase();
const container = buildContainer(db);
const { services, repos } = container;

const app = createApp({
  publicDir: config.publicDir,
  onRequest: ({ method, path, status, ms }) => {
    if (path.startsWith('/api/') && status >= 400) {
      console.log(`${method} ${path} → ${status} (${ms}ms)`);
    }
  }
});

// Lampirkan sesi untuk SEMUA laluan API (termasuk awam, supaya /auth/me berfungsi)
app.use(attachUser({ auth: services.auth, sessionCookieName: config.sessionCookie }));

registerAuthRoutes(app, { services, repos });
registerMerchantRoutes(app, { services });
registerAdminRoutes(app, { services, repos });
registerPublicRoutes(app, { services, repos });

const server = await app.listen(config.port, config.host);

console.log('');
console.log('  NIVORA — Sistem Pesanan & Untung Kuih');
console.log(`  ➜  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
console.log(`  Pangkalan data: ${config.dbDriver} ${config.dbDriver === 'sqlite' ? `(${config.dbFile})` : ''}`);
console.log('');
console.log('  Akaun demo:');
console.log(`   Pentadbir : ${DEMO.admin.email} / ${DEMO.admin.password}`);
console.log(`   Peniaga   : ${DEMO.merchant.email} / ${DEMO.merchant.password}`);
console.log('');

// Penyelenggaraan ringan: buang sesi tamat setiap 6 jam
const janitor = setInterval(() => {
  repos.sessions.purgeExpired().catch((err) => console.error('[janitor]', err.message));
}, 6 * 60 * 60 * 1000);
janitor.unref?.();

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[server] ${signal} diterima — menutup…`);
  clearInterval(janitor);
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

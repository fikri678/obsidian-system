/**
 * Pemeriksaan UI berautomasi melalui Chrome DevTools Protocol.
 * Penggunaan: node scripts/ui-check.mjs [baseUrl] [outDir]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const OUT = process.argv[3] || path.join(process.env.TMPDIR || 'C:/Users/User/AppData/Local/Temp', 'nivora-shots');
const PORT = 9300 + (process.pid % 60);
const READ_ONLY = process.argv.includes('--read-only');
const PROFILE = path.join(process.env.TMPDIR || 'C:/Users/User/AppData/Local/Temp', `nivora-chrome-${Date.now()}`);

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1500,1080',
  'about:blank'
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const failedRequests = [];
let loadResolvers = [];

try {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await httpJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error('Chrome tidak bermula');

  const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === 'Page.loadEventFired') {
      const list = loadResolvers;
      loadResolvers = [];
      list.forEach((fn) => fn());
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text);
    }
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
      failedRequests.push(`${msg.params.response.status} ${msg.params.response.url}`);
    }
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) {
      failedRequests.push(`FAILED ${msg.params.errorText} ${msg.params.type}`);
    }
  };

  function send(method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  }

  async function goto(url, settle = 1400) {
    await send('Page.navigate', { url });
    await Promise.race([
      new Promise((resolve) => loadResolvers.push(resolve)),
      sleep(9000)
    ]);
    await sleep(settle);
  }

  async function shot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }

  async function waitFor(expression, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(200);
    }
    return false;
  }

  async function loginAs(email, password) {
    await goto(`${BASE}/`, 900);
    const ready = await waitFor(`Boolean(document.getElementById('email'))`, 6000);
    if (!ready) {
      await goto(`${BASE}/?r=${Date.now()}`, 1200);
      await waitFor(`Boolean(document.getElementById('email'))`, 6000);
    }
    await evaluate(`
      document.getElementById('email').value=${JSON.stringify(email)};
      document.getElementById('password').value=${JSON.stringify(password)};
      document.getElementById('loginForm').requestSubmit();
      true;
    `);
    await waitFor(`location.pathname === '/app' && document.getElementById('app') && !document.getElementById('app').hidden`, 12000);
    await sleep(900);
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

  const report = { base: BASE, pages: [], interactions: [], errors: consoleErrors, failed: failedRequests };

  // 1. Login page
  await goto(`${BASE}/`, 1200);
  await shot('01-login');
  report.pages.push({ route: '/', title: await evaluate('document.title') });

  // 2. Login as merchant
  await loginAs('kakani@nivora.my', 'user123');
  report.loginPath = await evaluate('location.pathname + location.hash');

  const merchantRoutes = [
    ['02-dashboard', '#/dashboard'],
    ['03-orders', '#/orders'],
    ['04-new-order', '#/new-order'],
    ['05-calculator', '#/calculator'],
    ['06-menu', '#/menu'],
    ['07-ingredients', '#/ingredients'],
    ['08-shop-settings', '#/settings']
  ];

  for (const [name, hash] of merchantRoutes) {
    if (hash !== '#/dashboard') await goto(`${BASE}/app${hash}`, 1300);
    else await sleep(400);
    await shot(name);
    const info = await evaluate(`({
      title: document.getElementById('pageTitle')?.textContent,
      h2: document.querySelector('.page-title')?.textContent,
      cards: document.querySelectorAll('.card').length,
      bodyLen: document.getElementById('view')?.innerText.length,
      error: document.body.innerText.includes('Tidak dapat memuatkan halaman'),
      brand: document.querySelector('.brand-name')?.textContent,
      docTitle: document.title,
      roleChip: document.querySelector('#roleChip')?.innerText.trim(),
      formula: document.body.innerText.includes('Untung Bersih = Harga Jualan')
    })`);
    report.pages.push({ route: hash, ...info });
  }

  if (!READ_ONLY) {
  // Interaction: range switch on dashboard
  await goto(`${BASE}/app#/dashboard`, 1200);
  await evaluate(`document.querySelector('[data-range="7d"]')?.click(); true`);
  await sleep(1500);
  report.interactions.push({
    name: 'dashboard-range',
    hash: await evaluate('location.hash'),
    chartPoints: await evaluate(`document.querySelectorAll('#salesChart .dot').length`)
  });
  await shot('09-dashboard-7d');

  // Interaction: open order drawer
  await goto(`${BASE}/app#/orders`, 1400);
  await evaluate(`document.querySelector('[data-open]')?.click(); true`);
  await sleep(900);
  report.interactions.push({
    name: 'order-drawer',
    drawer: await evaluate(`Boolean(document.querySelector('.drawer'))`),
    waButton: (await evaluate(`document.querySelector('[data-wa-drawer]')?.innerText.trim()`)) || '',
    waNote: (await evaluate(`document.querySelector('.drawer .callout')?.innerText.slice(0,120)`)) || '',
    drawerText: (await evaluate(`document.querySelector('.drawer')?.innerText.slice(0,120)`)) || ''
  });
  await shot('10-order-drawer');

  // Interaction: rekod manual (borang ringkas, tiada input suara)
  await goto(`${BASE}/app#/new-order`, 1400);
  await shot('11-manual-order');

  await evaluate(`
    document.getElementById('custName').value = 'Pelanggan Manual';
    document.getElementById('custPhone').value = '019-9112233';
    document.querySelectorAll('[data-step="1"]')[0]?.click();
    document.querySelectorAll('[data-step="1"]')[1]?.click();
    document.getElementById('submitBtn')?.click();
    true;
  `);
  await sleep(1800);
  report.interactions.push({
    name: 'submit-order',
    heading: (await evaluate(`document.querySelector('.page-title')?.textContent`)) || '',
    hasVoiceBlock: await evaluate(`Boolean(document.getElementById('micBtn'))`),
    modal: await evaluate(`Boolean(document.querySelector('.scrim .modal'))`),
    waButton: (await evaluate(`document.querySelector('[data-send-wa]')?.innerText.trim()`)) || '',
    modalText: (await evaluate(`document.querySelector('.scrim .modal')?.innerText.slice(0,160)`)) || ''
  });
  await shot('12-order-success');
  await evaluate(`document.querySelector('[data-close-modal]')?.click(); true`);

  // Assistant
  await evaluate(`document.getElementById('assistantFab')?.click(); true`);
  await sleep(500);
  await evaluate(`document.querySelector('#assistantChips .chip-btn')?.click(); true`);
  await sleep(1800);
  report.interactions.push({
    name: 'assistant',
    messages: await evaluate(`document.querySelectorAll('#assistantBody .msg').length`),
    lastMessage: (await evaluate(`document.querySelector('#assistantBody .msg:last-child')?.innerText.slice(0,200)`)) || ''
  });
  await shot('13-assistant');
  }

  // Direktori kedai (pelanggan pilih peniaga)
  await goto(`${BASE}/order.html`, 1600);
  report.pages.push({
    route: '/order.html',
    title: await evaluate('document.title'),
    shopCards: await evaluate(`document.querySelectorAll('.shop-card').length`),
    heading: await evaluate(`document.querySelector('.public-title')?.textContent`),
    firstShop: await evaluate(`document.querySelector('.shop-card .shop-name')?.textContent`)
  });
  await shot('14-shop-directory');

  if (!READ_ONLY) {
  await evaluate(`document.querySelector('.shop-card')?.click(); true`);
  await sleep(1800);
  report.interactions.push({
    name: 'public-shop-select',
    url: await evaluate('location.search'),
    heading: await evaluate(`document.querySelector('.public-title')?.textContent`),
    menuCards: await evaluate(`document.querySelectorAll('.menu-card').length`)
  });
  await shot('14a-shop-selected');
  }

  // Public order page
  await goto(`${BASE}/order.html?t=kak-ani`, 1600);
  await shot('14-public-order');
  report.pages.push({
    route: '/order.html?t=kak-ani',
    title: await evaluate('document.title'),
    menuCards: await evaluate(`document.querySelectorAll('.menu-card').length`),
    heading: await evaluate(`document.querySelector('.public-title')?.textContent`)
  });

  if (!READ_ONLY) {
  // Modal tukar kedai
  await evaluate(`document.getElementById('switchShopBtn')?.click(); true`);
  await sleep(1400);
  report.interactions.push({
    name: 'public-shop-switcher',
    rows: await evaluate(`document.querySelectorAll('#shopList .shop-row').length`),
    current: await evaluate(`document.querySelectorAll('#shopList .shop-row.is-current').length`),
    modal: await evaluate(`Boolean(document.querySelector('.scrim .modal'))`)
  });
  await shot('14d-shop-switcher');
  await evaluate(`document.querySelector('.scrim [data-close]')?.click(); true`);
  await sleep(400);

  // Public order submission — resit TIDAK boleh dibuka automatik kepada pelanggan
  await evaluate(`
    window.__opened = [];
    window.open = (...args) => { window.__opened.push(args[0]); return { location: {}, close() {} }; };
    document.getElementById('pName').value = 'Pelanggan Web';
    document.getElementById('custPhone').value = '013-4567890';
    document.querySelector('[data-step="1"]')?.click();
    document.querySelectorAll('[data-step="1"]')[1]?.click();
    document.getElementById('submitBtn')?.click();
    true;
  `);
  await sleep(2200);
  report.interactions.push({
    name: 'public-submit',
    successHeading: await evaluate(`document.querySelector('.public-title')?.textContent`),
    code: (await evaluate(`document.querySelector('.mono')?.textContent`)) || '',
    openedWindows: await evaluate('window.__opened.length'),
    receiptNotice: (await evaluate(`document.querySelector('.callout')?.textContent.trim().slice(0, 140)`)) || '',
    hasWaButton: await evaluate(`Boolean(document.querySelector('#waReceiptBtn'))`)
  });
  await shot('14b-public-success');

  await evaluate(`document.getElementById('successCheckStatus')?.click(); true`);
  await sleep(1800);
  report.interactions.push({
    name: 'public-status-lookup',
    timelineSteps: await evaluate(`document.querySelectorAll('#lkResult .tl-step').length`),
    statusBadge: (await evaluate(`document.querySelector('#lkResult .badge')?.textContent`)) || '',
    modal: await evaluate(`Boolean(document.querySelector('.scrim .modal'))`),
    hasReceiptAction: await evaluate(`Boolean(document.querySelector('#lkResult a[href*="wa.me"], #lkResult #lkWa'))`)
  });
  await shot('14c-public-status');
  }

  // Logout & admin
  await goto(`${BASE}/app#/dashboard`, 900);
  await evaluate(`document.getElementById('logoutBtn')?.click(); true`);
  await sleep(1600);
  await loginAs('admin@nivora.my', 'admin123');
  report.adminPath = await evaluate('location.pathname + location.hash');

  const adminRoutes = [
    ['15-admin-overview', '#/admin'],
    ['16-admin-tenants', '#/admin/tenants'],
    ['17-admin-users', '#/admin/users'],
    ['18-admin-orders', '#/admin/orders'],
    ['19-admin-audit', '#/admin/audit'],
    ['20-admin-settings', '#/admin/settings']
  ];

  for (const [name, hash] of adminRoutes) {
    await goto(`${BASE}/app${hash}`, 1400);
    await shot(name);
    const info = await evaluate(`({
      title: document.getElementById('pageTitle')?.textContent,
      h2: document.querySelector('.page-title')?.textContent,
      bodyLen: document.getElementById('view')?.innerText.length,
      error: document.body.innerText.includes('Tidak dapat memuatkan halaman')
    })`);
    report.pages.push({ route: hash, ...info });
  }

  // Mobile screenshot
  await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 900, deviceScaleFactor: 1, mobile: true });
  await goto(`${BASE}/app#/admin`, 1400);
  await shot('21-admin-mobile');

  report.errors = [...new Set(consoleErrors)];
  report.failed = [...new Set(failedRequests)];
  console.log(JSON.stringify(report, null, 2));
} finally {
  try { ws?.close(); } catch { /* abaikan */ }
  chrome.kill();
}

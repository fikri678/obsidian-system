import { state, isAdmin, publicOrderUrl } from './core/state.js';
import { icon } from './core/icons.js';
import { dateLabel, todayISO, initials } from './core/format.js';
import { toast, closeOverlays } from './core/ui.js';

import * as dashboard from './views/merchant/dashboard.js';
import * as orders from './views/merchant/orders.js';
import * as newOrder from './views/merchant/newOrder.js';
import * as calculator from './views/merchant/calculator.js';
import * as menu from './views/merchant/menu.js';
import * as ingredients from './views/merchant/ingredients.js';
import * as shopSettings from './views/merchant/settings.js';

import * as adminOverview from './views/admin/overview.js';
import * as adminTenants from './views/admin/tenants.js';
import * as adminUsers from './views/admin/users.js';
import * as adminOrders from './views/admin/orders.js';
import * as adminAudit from './views/admin/audit.js';
import * as adminSettings from './views/admin/settings.js';

import { get, post } from './core/api.js';
import { initAssistant } from './assistant.js';

const MERCHANT_NAV = [
  { section: 'Operasi', items: [
    { path: '/dashboard', label: 'Papan Pemuka', icon: 'dashboard', title: 'Papan Pemuka', crumb: 'Ringkasan operasi harian' },
    { path: '/orders', label: 'Pesanan', icon: 'receipt', title: 'Pesanan Pelanggan', crumb: 'Status & pengambilan', badge: true }
  ]},
  { section: 'Kos & Menu', items: [
    { path: '/calculator', label: 'Kalkulator & Resipi', icon: 'calculator', title: 'Kalkulator Modal & Resipi', crumb: 'Kos bahan & margin' },
    { path: '/menu', label: 'Menu Kuih', icon: 'store', title: 'Menu Kuih', crumb: 'Harga jualan & kos' },
    { path: '/ingredients', label: 'Bahan Mentah', icon: 'box', title: 'Bahan Mentah', crumb: 'Harga pasaran semasa' }
  ]},
  { section: 'Akaun', items: [
    { path: '/settings', label: 'Tetapan Kedai', icon: 'settings', title: 'Tetapan Kedai', crumb: 'Profil & keselamatan' }
  ]}
];

const ADMIN_NAV = [
  { section: 'Platform', items: [
    { path: '/admin', label: 'Gambaran Platform', icon: 'chart', title: 'Gambaran Platform', crumb: 'Semua peniaga' },
    { path: '/admin/tenants', label: 'Peniaga', icon: 'store', title: 'Pengurusan Peniaga', crumb: 'Kedai & statistik' },
    { path: '/admin/users', label: 'Pengguna', icon: 'users', title: 'Pengguna', crumb: 'Akses & peranan' },
    { path: '/admin/orders', label: 'Semua Pesanan', icon: 'receipt', title: 'Semua Pesanan', crumb: 'Rentas semua kedai' }
  ]},
  { section: 'Sistem', items: [
    { path: '/admin/audit', label: 'Log Audit', icon: 'activity', title: 'Log Audit', crumb: 'Jejak aktiviti' },
    { path: '/admin/settings', label: 'Tetapan Platform', icon: 'sliders', title: 'Tetapan Platform', crumb: 'Konfigurasi umum' }
  ]}
];

const ROUTES = {
  '/dashboard': dashboard,
  '/orders': orders,
  '/new-order': newOrder,
  '/calculator': calculator,
  '/menu': menu,
  '/ingredients': ingredients,
  '/settings': shopSettings,
  '/admin': adminOverview,
  '/admin/tenants': adminTenants,
  '/admin/users': adminUsers,
  '/admin/orders': adminOrders,
  '/admin/audit': adminAudit,
  '/admin/settings': adminSettings
};

const els = {
  boot: document.getElementById('boot'),
  app: document.getElementById('app'),
  sidebar: document.getElementById('sidebar'),
  nav: document.getElementById('sidebarNav'),
  scrim: document.getElementById('sidebarScrim'),
  view: document.getElementById('view'),
  title: document.getElementById('pageTitle'),
  crumb: document.getElementById('pageCrumb'),
  dateChip: document.getElementById('dateChip'),
  roleChip: document.getElementById('roleChip'),
  menuToggle: document.getElementById('menuToggle'),
  publicLink: document.getElementById('publicLink'),
  topAvatar: document.getElementById('topAvatar'),
  shopAvatar: document.getElementById('shopAvatar'),
  shopName: document.getElementById('shopName'),
  shopRole: document.getElementById('shopRole'),
  logout: document.getElementById('logoutBtn'),
  assistantFab: document.getElementById('assistantFab')
};

let currentPath = '/dashboard';
let renderToken = 0;

function navFor() {
  return isAdmin() ? ADMIN_NAV : MERCHANT_NAV;
}

function renderNav() {
  els.nav.innerHTML = navFor().map((group) => `
    <div class="nav-label">${group.section}</div>
    <div class="nav">
      ${group.items.map((item) => `
        <button class="nav-item" data-path="${item.path}" type="button">
          ${icon(item.icon)}
          <span>${item.label}</span>
          ${item.badge ? '<span class="nav-badge" id="navBadge" hidden>0</span>' : ''}
        </button>`).join('')}
    </div>`).join('');

  els.nav.querySelectorAll('[data-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.path);
      closeSidebar();
    });
  });
}

function setActiveNav(path) {
  els.nav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.path === path);
  });
}

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) {
    renderRoute();
    return;
  }
  location.hash = target;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || (isAdmin() ? '/admin' : '/dashboard');
  const [path, qs = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs).entries());
  return { path: path || '/dashboard', params };
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.scrim.classList.add('show');
}
function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.scrim.classList.remove('show');
}

async function renderRoute() {
  const token = ++renderToken;
  const { path, params } = parseHash();
  const route = ROUTES[path] || (isAdmin() ? ROUTES['/admin'] : ROUTES['/dashboard']);
  currentPath = ROUTES[path] ? path : (isAdmin() ? '/admin' : '/dashboard');

  setActiveNav(currentPath);
  els.title.textContent = route.title || 'NIVORA';
  els.crumb.textContent = route.crumb || '';
  document.title = `${route.title || 'Papan Pemuka'} · NIVORA`;
  closeOverlays();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  els.view.innerHTML = `<div class="loading-block"><span class="spinner dark"></span><span>Memuatkan…</span></div>`;

  try {
    await route.render(els.view, {
      user: state.user,
      tenant: state.tenant,
      config: state.config,
      params,
      navigate,
      refresh: renderRoute,
      setBadge,
      routePath: currentPath
    });
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    els.view.innerHTML = `
      <div class="card card-pad" style="max-width:560px;margin:40px auto;text-align:center">
        <div class="empty-ico" style="margin:0 auto 12px">${icon('alert')}</div>
        <div class="empty-title">Tidak dapat memuatkan halaman</div>
        <p class="empty-text" style="margin:6px auto 16px">${err?.message || 'Ralat tidak diketahui.'}</p>
        <button class="btn btn-primary" onclick="location.reload()">Cuba lagi</button>
      </div>`;
    toast(err?.message || 'Ralat memuatkan data.', 'error');
  }
}

function setBadge(count) {
  const badge = document.getElementById('navBadge');
  state.newOrderCount = Number(count || 0);
  if (!badge) return;
  badge.textContent = state.newOrderCount;
  badge.hidden = state.newOrderCount <= 0;
}

async function boot() {
  try {
    const me = await get('/api/auth/me');
    state.user = me.user;
    state.tenant = me.tenant;
    state.config = me.config || {};
  } catch {
    location.replace('/');
    return;
  }

  renderNav();
  els.boot.hidden = true;
  els.app.hidden = false;

  const admin = isAdmin();
  document.body.dataset.role = admin ? 'admin' : 'merchant';
  els.dateChip.innerHTML = `${icon('calendar')}<span>${dateLabel(todayISO(), { withDay: true })}</span>`;
  els.roleChip.className = `role-chip${admin ? ' admin' : ''}`;
  els.roleChip.innerHTML = `${icon(admin ? 'shield' : 'store')}<span>${admin ? 'Mod Pentadbir' : 'Mod Peniaga'}</span>`;
  document.getElementById('brandSub').textContent = admin ? 'Platform Admin' : 'Pesanan & Untung Kuih';
  els.menuToggle.innerHTML = icon('menu');
  els.logout.innerHTML = icon('logout');
  els.shopAvatar.textContent = initials(admin ? state.config.platformName : state.tenant?.name);
  els.shopName.textContent = admin ? (state.config.platformName || 'NIVORA') : (state.tenant?.name || 'Kedai');
  els.shopRole.textContent = admin ? 'Pentadbir platform' : 'Akaun peniaga';
  els.topAvatar.textContent = initials(state.user.name);
  els.shopAvatar.className = `avatar ${admin ? 'avatar-dark' : 'avatar-amber'}`;

  if (!admin) {
    els.publicLink.hidden = false;
    els.publicLink.href = publicOrderUrl();
    els.publicLink.target = '_blank';
    els.publicLink.innerHTML = icon('external');
  }

  els.menuToggle.addEventListener('click', openSidebar);
  els.scrim.addEventListener('click', closeSidebar);

  els.logout.addEventListener('click', async () => {
    try { await post('/api/auth/logout'); } catch { /* abaikan */ }
    location.replace('/');
  });

  els.view.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go) {
      event.preventDefault();
      navigate(go.dataset.go);
    }
  });

  window.addEventListener('hashchange', renderRoute);

  if (!admin) {
    initAssistant();
    refreshBadge();
  }

  if (!location.hash) {
    location.hash = admin ? '#/admin' : '#/dashboard';
  }
  await renderRoute();
}

async function refreshBadge() {
  try {
    const data = await get('/api/dashboard?range=today');
    setBadge((data.statusCounts?.baru || 0) + (data.statusCounts?.disediakan || 0));
  } catch { /* senyap */ }
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) closeSidebar();
});

boot();

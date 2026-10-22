export const state = {
  user: null,
  tenant: null,
  config: {},
  route: { path: '/dashboard', params: {} },
  newOrderCount: 0
};

export function setSession({ user, tenant, config }) {
  if (user) state.user = user;
  if (tenant !== undefined) state.tenant = tenant;
  if (config) state.config = { ...state.config, ...config };
}

export function isAdmin() {
  return state.user?.role === 'admin';
}

export function displayName() {
  return state.user?.name || '';
}

export function shopName() {
  return state.tenant?.name || state.config?.platformName || 'NIVORA';
}

export function publicOrderUrl() {
  if (!state.tenant?.slug) return '';
  return `${location.origin}/order.html?t=${encodeURIComponent(state.tenant.slug)}`;
}

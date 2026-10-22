import { icon } from './icons.js';
import { statusLabel } from './format.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

export function toast(message, type = 'success') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const icons = { success: 'check', error: 'alert', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(icons[type] || 'check', 'toast-ico')}<div>${esc(message)}</div>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, type === 'error' ? 5000 : 3200);
}

export function statusBadge(status) {
  return `<span class="badge badge-${esc(status)}"><span class="dot"></span>${esc(statusLabel(status))}</span>`;
}

export function badge(text, tone = 'slate') {
  return `<span class="badge badge-${tone}">${esc(text)}</span>`;
}

let openStack = [];

function lockScroll(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}

function closeTop() {
  const top = openStack.pop();
  if (top) top();
  if (!openStack.length) lockScroll(false);
}

export function openModal({ title, subtitle = '', body = '', footer = '', size = '', onClose = null, closeOnScrim = true }) {
  const root = document.createElement('div');
  root.className = 'scrim';
  root.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <div class="modal-title">${esc(title)}</div>
          ${subtitle ? `<div class="modal-sub">${esc(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  document.body.appendChild(root);
  lockScroll(true);
  openStack.push(() => {
    root.remove();
    onClose?.();
  });

  const close = () => {
    const idx = openStack.length - 1;
    if (idx >= 0) openStack.pop()?.();
    if (!openStack.length) lockScroll(false);
  };

  root.querySelector('[data-close]').addEventListener('click', close);
  if (closeOnScrim) {
    root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
  };
  document.addEventListener('keydown', onKey);

  setTimeout(() => {
    const focusable = root.querySelector('input, select, textarea, button:not([data-close])');
    focusable?.focus();
  }, 60);

  return { root, body: root.querySelector('.modal-body'), foot: root.querySelector('.modal-foot'), close };
}

export function confirmDialog({
  title = 'Sahkan tindakan',
  message = '',
  confirmLabel = 'Teruskan',
  cancelLabel = 'Batal',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      body: `<p class="small" style="color:var(--ink-2);line-height:1.6">${esc(message)}</p>`,
      footer: `<button type="button" class="btn btn-ghost" data-cancel>${esc(cancelLabel)}</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => { if (!settled) { settled = true; resolve(false); } }
    });
    modal.root.querySelector('[data-cancel]').addEventListener('click', () => { settled = true; resolve(false); modal.close(); });
    modal.root.querySelector('[data-ok]').addEventListener('click', () => { settled = true; resolve(true); modal.close(); });
  });
}

export function openDrawer({ title = '', subtitle = '', body = '', footer = '', onClose = null }) {
  const scrim = document.createElement('div');
  scrim.className = 'drawer-scrim';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="modal-title">${title}</div>
        ${subtitle ? `<div class="modal-sub">${subtitle}</div>` : ''}
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="drawer-body">${body}</div>
    ${footer ? `<div class="drawer-foot">${footer}</div>` : ''}`;

  document.body.append(scrim, drawer);
  lockScroll(true);

  const close = () => {
    scrim.remove();
    drawer.remove();
    lockScroll(false);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  scrim.addEventListener('click', close);
  drawer.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  return { root: drawer, body: drawer.querySelector('.drawer-body'), foot: drawer.querySelector('.drawer-foot'), close };
}

export function closeOverlays() {
  while (openStack.length) {
    const close = openStack.pop();
    try { close?.(); } catch { /* abaikan */ }
  }
  lockScroll(false);
  document.querySelectorAll('.scrim, .drawer, .drawer-scrim').forEach((el) => el.remove());
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function setBusy(button, busy, label = 'Memproses…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`;
  } else if (button.dataset.label) {
    button.disabled = false;
    button.innerHTML = button.dataset.label;
    delete button.dataset.label;
  }
}

export function emptyState({ iconName = 'box', title = 'Tiada data', text = '', action = '' }) {
  return `<div class="empty">
    <div class="empty-ico">${icon(iconName)}</div>
    <div class="empty-title">${esc(title)}</div>
    ${text ? `<div class="empty-text">${esc(text)}</div>` : ''}
    ${action}
  </div>`;
}

export function loadingBlock(text = 'Memuatkan data…') {
  return `<div class="loading-block"><span class="spinner dark"></span><span>${esc(text)}</span></div>`;
}

export function debounce(fn, wait = 320) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formValues(form) {
  const out = {};
  new FormData(form).forEach((value, key) => {
    if (out[key] !== undefined) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  });
  return out;
}

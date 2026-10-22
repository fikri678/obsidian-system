import { post } from './core/api.js';
import { markdown } from './core/markdown.js';
import { esc, toast } from './core/ui.js';

const WELCOME = `Salam! Saya pembantu data NIVORA. Tanya saya tentang **kos modal**, **untung bersih**, **harga jualan** atau **pesanan hari ini** — jawapan dikira terus daripada rekod kedai anda.`;

const DEFAULT_CHIPS = [
  'Ringkasan pesanan hari ini',
  'Kuih mana paling untung?',
  'Harga jual sesuai untuk kos modal RM0.55?'
];

export function initAssistant() {
  const fab = document.getElementById('assistantFab');
  const panel = document.getElementById('assistantPanel');
  const body = document.getElementById('assistantBody');
  const chips = document.getElementById('assistantChips');
  const input = document.getElementById('assistantInput');
  const sendBtn = document.getElementById('assistantSend');
  const closeBtn = document.getElementById('assistantClose');
  const status = document.getElementById('assistantStatus');
  if (!fab || !panel) return;

  let busy = false;
  let greeted = false;

  fab.hidden = false;

  function addMessage(role, text, { error = false, typing = false } = {}) {
    const row = document.createElement('div');
    row.className = `msg ${role}`;
    if (role === 'user') {
      row.innerHTML = `<div class="msg-bubble">${esc(text)}</div>`;
    } else if (typing) {
      row.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
    } else {
      row.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-bubble ${error ? 'err' : ''}">${markdown(text)}</div>`;
      if (error) row.classList.add('err');
    }
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
    return row;
  }

  function renderChips(items) {
    chips.innerHTML = (items?.length ? items : DEFAULT_CHIPS)
      .map((s) => `<button type="button" class="chip-btn">${esc(s)}</button>`).join('');
    chips.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => send(btn.textContent));
    });
  }

  function open() {
    panel.hidden = false;
    fab.hidden = true;
    if (!greeted) {
      addMessage('bot', WELCOME);
      greeted = true;
      renderChips(DEFAULT_CHIPS);
    }
    setTimeout(() => input.focus(), 80);
  }

  function close() {
    panel.hidden = true;
    fab.hidden = false;
  }

  async function send(preset) {
    const question = String(preset ?? input.value).trim();
    if (!question || busy) return;

    if (preset === undefined) {
      input.value = '';
      input.style.height = 'auto';
    }

    addMessage('user', question);
    chips.innerHTML = '';
    busy = true;
    sendBtn.disabled = true;
    status.textContent = 'Mengira…';
    const typingRow = addMessage('bot', '', { typing: true });

    try {
      const data = await post('/api/assistant', { question });
      typingRow.remove();
      addMessage('bot', data.answer);
      const followUps = (data.suggestions || []).filter((s) => s && s.toLowerCase() !== question.toLowerCase());
      renderChips(followUps.length ? followUps : DEFAULT_CHIPS);
    } catch (err) {
      typingRow.remove();
      addMessage('bot', err?.message || 'Pembantu tidak dapat dihubungi.', { error: true });
      renderChips(DEFAULT_CHIPS);
      toast(err?.message || 'Pembantu tidak dapat dihubungi.', 'error');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      status.textContent = 'Berasaskan data kedai anda';
      body.scrollTop = body.scrollHeight;
    }
  }

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  sendBtn.addEventListener('click', () => send());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 88)}px`;
  });
}

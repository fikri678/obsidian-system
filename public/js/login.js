import { get, post, ApiError } from './core/api.js';
import { toast } from './core/ui.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('loginError');
const button = document.getElementById('loginBtn');
const togglePw = document.getElementById('togglePw');

// Jika sudah log masuk, terus ke aplikasi
get('/api/auth/me')
  .then(() => { location.replace('/app'); })
  .catch(() => { /* belum log masuk */ });

togglePw?.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePw.style.color = showing ? '' : 'var(--brand)';
  togglePw.setAttribute('aria-label', showing ? 'Tunjuk kata laluan' : 'Sembunyi kata laluan');
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showError('Sila isi e-mel dan kata laluan.');
    return;
  }

  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = '<span class="spinner"></span><span>Mengesahkan…</span>';

  try {
    await post('/api/auth/login', { email, password });
    location.replace('/app');
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Ralat sambungan. Sila cuba lagi.';
    showError(message);
    toast(message, 'error');
    button.disabled = false;
    button.innerHTML = original;
    passwordInput.select();
  }
});

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => showError(''));
});

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const PROFILE = path.join(process.env.TMPDIR, 'chrome-console-profile');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const URL_TO_OPEN = process.argv[3] || `${BASE}/app#/dashboard`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--disable-gpu', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });

const getJson = (url, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(url, { method }, (res) => {
    let b = '';
    res.on('data', (d) => { b += d; });
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } });
  });
  req.on('error', reject);
  req.end();
});

let ws; let id = 0; const pending = new Map(); const logs = [];
try {
  let v;
  for (let i = 0; i < 40; i++) { try { v = await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
  const target = await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } return; }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded') logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push(`[http ${m.params.response.status}] ${m.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description };
    return r.result?.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Page.navigate', { url: `${BASE}/` });
  await sleep(2000);
  console.log('login page email field:', await evaluate(`Boolean(document.getElementById('email'))`));
  await evaluate(`document.getElementById('email').value='kakani@nivora.my';document.getElementById('password').value='user123';document.getElementById('loginForm').requestSubmit();true`);
  await sleep(3500);
  console.log('url now:', await evaluate('location.pathname + location.hash'));
  console.log('boot hidden:', await evaluate(`document.getElementById('boot')?.hidden`));
  console.log('app hidden:', await evaluate(`document.getElementById('app')?.hidden`));
  console.log('view text:', await evaluate(`document.getElementById('view')?.innerText.slice(0,200)`));
  await send('Page.navigate', { url: URL_TO_OPEN });
  await sleep(3000);
  console.log('after direct nav:', await evaluate('location.hash'));
  console.log('--- LOGS ---');
  console.log([...new Set(logs)].join('\n'));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}

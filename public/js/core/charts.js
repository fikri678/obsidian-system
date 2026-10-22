import { esc } from './ui.js';
import { money, moneyShort, dateLabel } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

function niceMax(value) {
  if (value <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

export function areaChart(container, series, { value = 'grossCents', height = 240, showOrders = true } = {}) {
  if (!container) return;
  const data = Array.isArray(series) ? series : [];
  if (!data.length) {
    container.innerHTML = `<div class="loading-block" style="padding:40px 0">Tiada data untuk carta.</div>`;
    return;
  }

  const W = 820;
  const H = height;
  const padL = 48;
  const padR = 14;
  const padT = 18;
  const padB = 30;

  const values = data.map((d) => Number(d[value] || 0));
  const max = niceMax(Math.max(1, ...values));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = (i) => padL + (data.length > 1 ? i * stepX : innerW / 2);
  const yAt = (v) => padT + (1 - v / max) * innerH;

  const points = values.map((v, i) => [xAt(i), yAt(v)]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${xAt(data.length - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;

  const gridCount = 4;
  let grid = '';
  for (let i = 0; i <= gridCount; i++) {
    const y = padT + (innerH / gridCount) * i;
    const val = max - (max / gridCount) * i;
    grid += `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="axis-label" x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${moneyShort(val)}</text>`;
  }

  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  let xLabels = '';
  data.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== data.length - 1) return;
    const label = d.label || dateLabel(d.date, { short: true });
    xLabels += `<text class="axis-label" x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>`;
  });

  let dots = '';
  data.forEach((d, i) => {
    dots += `<circle class="dot" data-dot="${i}" cx="${xAt(i).toFixed(1)}" cy="${yAt(values[i]).toFixed(1)}" r="3.4"/>`;
  });

  let hits = '';
  const hitW = innerW / Math.max(1, data.length);
  data.forEach((d, i) => {
    hits += `<rect class="hit" data-hit="${i}" x="${(xAt(i) - hitW / 2).toFixed(1)}" y="${padT}" width="${hitW.toFixed(1)}" height="${innerH}"/>`;
  });

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carta jualan">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#52B788" stop-opacity=".34"/>
            <stop offset="100%" stop-color="#52B788" stop-opacity=".02"/>
          </linearGradient>
        </defs>
        ${grid}
        <path class="area" d="${areaPath}"/>
        <path class="line" d="${linePath}"/>
        ${dots}
        ${hits}
        ${xLabels}
      </svg>
      <div class="chart-tip" id="chart-tip"></div>
    </div>`;

  const svg = container.querySelector('svg');
  const tip = container.querySelector('.chart-tip');

  function showTip(index, clientX, clientY) {
    const d = data[index];
    if (!d) return;
    tip.innerHTML = `<div style="font-weight:800">${esc(dateLabel(d.date, { short: true }))}</div>
      <div style="color:#B7E4C7;margin-top:2px">${esc(money(d[value]))}</div>
      ${showOrders ? `<div style="color:#94a3b8;font-size:9.5px">${d.orders} pesanan</div>` : ''}`;
    const rect = svg.getBoundingClientRect();
    tip.style.left = `${clientX - rect.left}px`;
    tip.style.top = `${clientY - rect.top - 6}px`;
    tip.classList.add('show');
    svg.querySelectorAll('.dot').forEach((dot, i) => { dot.style.opacity = i === index ? '1' : '0'; });
  }

  function hideTip() {
    tip.classList.remove('show');
    svg.querySelectorAll('.dot').forEach((dot) => { dot.style.opacity = '0'; });
  }

  container.querySelectorAll('[data-hit]').forEach((rect) => {
    rect.addEventListener('mousemove', (e) => showTip(Number(rect.dataset.hit), e.clientX, e.clientY));
    rect.addEventListener('mouseleave', hideTip);
  });
}

export function donut(container, parts, { centerLabel = '', centerSub = '', size = 168, thickness = 16 } = {}) {
  if (!container) return;
  const total = parts.reduce((sum, p) => sum + Math.max(0, Number(p.value || 0)), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  let circles = '';
  if (total <= 0) {
    circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f6" stroke-width="${thickness}"/>`;
  } else {
    parts.forEach((part) => {
      const value = Math.max(0, Number(part.value || 0));
      const fraction = value / total;
      const dash = fraction * c;
      circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${part.color}"
        stroke-width="${thickness}" stroke-linecap="butt"
        stroke-dasharray="${Math.max(0, dash - 2).toFixed(2)} ${(c - dash + 2).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"
        style="transition:stroke-dasharray .4s"/>`;
      offset += dash;
    });
  }

  container.innerHTML = `
    <div class="donut-wrap">
      <div style="position:relative;width:${size}px;height:${size}px;flex:0 0 auto">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${circles}</svg>
        <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
          <div>
            <div class="donut-center">${esc(centerLabel)}</div>
            <div class="tiny muted" style="margin-top:2px">${esc(centerSub)}</div>
          </div>
        </div>
      </div>
      <div class="stack" style="gap:8px;flex:1;min-width:0">
        ${parts.map((p) => `
          <div class="between" style="font-size:11.5px">
            <span class="row" style="gap:6px;min-width:0">
              <i style="width:8px;height:8px;border-radius:3px;background:${p.color};flex:0 0 auto;display:inline-block"></i>
              <span class="ellipsis" style="font-weight:600;color:var(--ink-2)">${esc(p.label)}</span>
            </span>
            <span style="font-weight:800;font-variant-numeric:tabular-nums">${esc(p.display || '')}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

export function sparkline(values, { color = '#2D6A4F', width = 76, height = 26 } = {}) {
  const data = (values || []).map(Number);
  if (!data.length) return '';
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
    <path d="${d}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
    <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="2.2" fill="${color}"/>
  </svg>`;
}

export function progressBar(value, max, { tone = 'amber' } = {}) {
  const pctWidth = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return `<div class="bar-line"><span style="width:${pctWidth.toFixed(1)}%;${tone === 'green' ? 'background:linear-gradient(90deg,#52B788,#2D6A4F)' : ''}"></span></div>`;
}

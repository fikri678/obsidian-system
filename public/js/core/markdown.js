import { esc } from './ui.js';

function inline(text) {
  return esc(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:!?)\]])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

/** Pemapar markdown ringan (selamat — semua teks di-escape dahulu). */
export function markdown(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const segments = src.split(/```/);
  let html = '';

  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const code = segment.replace(/^[a-zA-Z0-9+#_-]*\n/, '').replace(/\s+$/, '');
      html += `<pre style="background:#071A12;color:#D8F3DC;padding:8px 10px;border-radius:8px;overflow-x:auto;font-size:10.5px">${esc(code)}</pre>`;
      return;
    }

    const lines = segment.split('\n');
    let para = [];
    let listType = null;
    let listItems = [];

    const flushPara = () => {
      if (!para.length) return;
      html += `<p>${para.map((l) => inline(l.trim())).join('<br>')}</p>`;
      para = [];
    };
    const flushList = () => {
      if (!listType) return;
      html += `<${listType}>${listItems.map((li) => `<li>${inline(li)}</li>`).join('')}</${listType}>`;
      listType = null;
      listItems = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) { flushPara(); flushList(); continue; }

      if (/^\|.*\|$/.test(line)) {
        flushPara(); flushList();
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
          rows.push(lines[i].trim());
          i++;
        }
        i--;
        const cells = rows.map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        const isSep = (arr) => arr.length > 0 && arr.every((c) => /^:?-{2,}:?$/.test(c));
        const body = cells.filter((arr) => !isSep(arr));
        if (body.length) {
          const [head, ...rest] = body;
          html += `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`
            + rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
            + '</tbody></table>';
        }
        continue;
      }

      const ul = line.match(/^[-*•]\s+(.*)$/);
      if (ul) {
        flushPara();
        if (listType !== 'ul') { flushList(); listType = 'ul'; }
        listItems.push(ul[1]);
        continue;
      }
      const ol = line.match(/^\d+[.)]\s+(.*)$/);
      if (ol) {
        flushPara();
        if (listType !== 'ol') { flushList(); listType = 'ol'; }
        listItems.push(ol[1]);
        continue;
      }
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) {
        flushPara(); flushList();
        html += `<p style="font-weight:800;color:var(--ink)">${inline(heading[1])}</p>`;
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); flushList(); continue; }

      flushList();
      para.push(raw);
    }
    flushPara();
    flushList();
  });

  return html.trim() || '<p></p>';
}

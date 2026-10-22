import { addDaysISO, labelTime, todayISO } from '../lib/time.js';
import { formatRM, percent } from '../lib/money.js';

/**
 * Pembantu data tempatan — menjawab soalan kos/untung/pesanan terus daripada
 * pangkalan data. Tiada panggilan AI luaran, jadi jawapan sentiasa boleh disemak.
 */
export function assistantService({ repos, settings }) {
  return {
    async ask(tenantId, question) {
      const text = String(question || '').trim();
      if (!text) return fallback('Sila taip soalan anda.', []);
      if (text.length > 500) return fallback('Soalan terlalu panjang. Sila pendekkan kepada satu soalan.', []);

      const [menu, recipes, metrics, statusCounts, pickups, config] = await Promise.all([
        repos.kuih.listByTenant(tenantId),
        repos.recipes.listByTenant(tenantId),
        repos.orders.metrics({ tenantId, from: todayISO(), to: todayISO() }),
        repos.orders.statusCounts({ tenantId, from: todayISO(), to: todayISO() }),
        repos.orders.pickupsForDate(tenantId, todayISO()),
        settings.all()
      ]);

      const lower = text.toLowerCase();
      const kuihMatches = matchKuih(lower, menu);

      if (/paling untung|margin tertinggi|paling laris|ranking|senarai untung/.test(lower)) {
        return rankingAnswer(menu, recipes);
      }

      if (/(untung|profit|margin)/.test(lower) && (kuihMatches.length || hasMoney(text) || /kira/.test(lower))) {
        return profitAnswer(text, kuihMatches, menu);
      }

      if (/harga jual|harga sesuai|harga patut|berapa harga|tanda harga/.test(lower)) {
        return pricingAnswer(text, kuihMatches, menu);
      }

      if (/(kos|modal|resipi)/.test(lower) && (kuihMatches.length || /paling mahal|tertinggi/.test(lower))) {
        return costAnswer(kuihMatches, menu, recipes);
      }

      if (/(pesanan|tempahan|order|jualan|hari ini|laporan|ringkasan)/.test(lower)) {
        return todayAnswer(metrics, statusCounts, pickups);
      }

      if (/(menu|kuih apa|senarai kuih|katalog)/.test(lower)) {
        return menuAnswer(menu, config);
      }

      if (/(kurang|jimat|turunkan|tip|nasihat)/.test(lower)) {
        return costTips(menu, recipes, config);
      }

      return fallback(
        'Saya boleh bantu kira untung, semak kos bahan, cadang harga jualan dan ringkaskan pesanan hari ini. Cuba tanya seperti contoh di bawah.',
        suggestionsFor(menu)
      );
    }
  };
}

function matchKuih(lower, menu) {
  return menu.filter((k) => {
    const name = k.name.toLowerCase();
    if (lower.includes(name)) return true;
    const first = name.split(/\s+/)[0];
    return first.length > 3 && lower.includes(first);
  });
}

function hasMoney(text) {
  return /rm\s*\d/i.test(text);
}

function moneyValues(text) {
  return [...text.matchAll(/rm\s*(\d+(?:\.\d{1,2})?)/gi)].map((m) => Number(m[1]));
}

function qtyValue(text) {
  const m = text.match(/(\d+)\s*(biji|pcs|unit|ketul|potong|batang|kotak)/i);
  if (m) return Number(m[1]);
  const plain = text.match(/(?:untuk|bagi|tempah|order)\s+(\d+)/i);
  return plain ? Number(plain[1]) : null;
}

function profitAnswer(text, matches, menu) {
  const kuih = matches[0] || null;
  const monies = moneyValues(text);
  const qty = qtyValue(text) || 1;

  let costPerUnit;
  let pricePerUnit;
  if (kuih) {
    costPerUnit = monies.length >= 1 ? monies[0] : kuih.costCents / 100;
    pricePerUnit = monies.length >= 2 ? monies[1] : kuih.priceCents / 100;
  } else if (monies.length >= 2) {
    costPerUnit = monies[0];
    pricePerUnit = monies[1];
  } else {
    return fallback(
      'Beritahu saya nama kuih atau dua nilai: kos seunit dan harga jualan. Contoh: "untung 100 biji karipap, kos RM0.45, jual RM1.00".',
      ['Kira untung 100 biji karipap (kos RM0.45, jual RM1.00)', 'Kuih mana paling untung?']
    );
  }

  const gross = qty * pricePerUnit;
  const cost = qty * costPerUnit;
  const net = gross - cost;
  const unitProfit = pricePerUnit - costPerUnit;
  const margin = percent(unitProfit, pricePerUnit);

  const label = kuih ? kuih.name : 'kuih anda';
  const lines = [
    `**Kiraan untung — ${label}**`,
    '',
    `| Perkara | Nilai |`,
    `| --- | --- |`,
    `| Kuantiti | ${qty} unit |`,
    `| Harga jual seunit | ${formatMoney(pricePerUnit)} |`,
    `| Kos seunit | ${formatMoney(costPerUnit)} |`,
    `| Untung seunit | ${formatMoney(unitProfit)} (${margin}%) |`,
    `| Jumlah jualan | ${formatMoney(gross)} |`,
    `| Jumlah kos | ${formatMoney(cost)} |`,
    `| **Untung bersih** | **${formatMoney(net)}** |`,
    '',
    margin < 30
      ? `⚠️ Margin ${margin}% agak nipis. Pertimbangkan naikkan harga ${formatMoney(Math.ceil((costPerUnit / 0.65) * 20) / 20 - pricePerUnit)} atau kurangkan kos bahan.`
      : `✅ Margin ${margin}% berada pada tahap sihat untuk kuih tradisional.`
  ];
  return { answer: lines.join('\n'), suggestions: suggestionsFor(menu) };
}

function pricingAnswer(text, matches, menu) {
  const monies = moneyValues(text);
  const kuih = matches[0] || null;
  const cost = monies.length ? monies[0] : kuih ? kuih.costCents / 100 : null;

  if (!cost) {
    return fallback('Berapa kos modal seunit? Contoh: "harga jual sesuai untuk kos RM0.55?"', ['Harga jual sesuai untuk kos modal RM0.55?']);
  }

  const tiers = [
    { label: 'Margin 35%', price: cost / 0.65 },
    { label: 'Margin 45%', price: cost / 0.55 },
    { label: 'Margin 55%', price: cost / 0.45 }
  ].map((t) => ({ ...t, rounded: roundTo5Sen(t.price) }));

  const lines = [
    `**Cadangan harga jual** (kos seunit ${formatMoney(cost)})`,
    '',
    '| Sasaran margin | Harga cadangan | Untung seunit |',
    '| --- | --- | --- |',
    ...tiers.map((t) => `| ${t.label} | ${formatMoney(t.rounded)} | ${formatMoney(t.rounded - cost)} |`),
    '',
    `Untuk kuih muih, julat selesa biasanya **margin 40–55%**. Harga ${formatMoney(tiers[1].rounded)} memberi keseimbangan antara daya saing dan untung.`
  ];
  return { answer: lines.join('\n'), suggestions: ['Kira untung 100 biji pada harga itu', 'Kuih mana paling untung?'] };
}

function costAnswer(matches, menu, recipes) {
  if (!matches.length) {
    return fallback('Sebut nama kuih untuk saya pecahkan kos bahannya.', menu.slice(0, 3).map((k) => `Kos ${k.name}?`));
  }
  const kuih = matches[0];
  const recipe = recipes.find((r) => r.kuihId === kuih.id) || null;

  if (!recipe) {
    return {
      answer: [
        `**${kuih.name}** — kos direkod ${formatMoney(kuih.costCents / 100)} seunit (${kuih.unit}).`,
        '',
        'Belum ada resipi terperinci untuk kuih ini. Buka **Kalkulator Modal & Resipi** untuk tambah bahan dan dapatkan pecahan kos automatik.'
      ].join('\n'),
      suggestions: [`Harga jual sesuai untuk kos ${formatMoney(kuih.costCents / 100)}?`]
    };
  }

  const rows = recipe.items
    .slice()
    .sort((a, b) => b.lineCostCents - a.lineCostCents)
    .map((i) => `| ${i.name} | ${i.lineCostCents ? formatMoney(i.lineCostCents / 100) : '—'} |`);

  return {
    answer: [
      `**Pecahan kos — ${recipe.name}**`,
      `Hasil: ${recipe.yieldQty} ${recipe.unit} · Kos seunit **${formatMoney(recipe.costPerUnitCents / 100)}**`,
      '',
      '| Bahan | Kos |',
      '| --- | --- |',
      ...rows,
      '',
      `Harga jual ${formatMoney(kuih.priceCents / 100)} → margin ${percent(kuih.priceCents - recipe.costPerUnitCents, kuih.priceCents)}%.`
    ].join('\n'),
    suggestions: [`Kira untung 100 ${kuih.unit} ${kuih.name}`, 'Macam mana nak kurangkan kos santan?']
  };
}

function rankingAnswer(menu, recipes) {
  const ranked = menu
    .filter((k) => k.priceCents > 0)
    .map((k) => ({
      ...k,
      profitCents: k.priceCents - k.costCents,
      marginPct: percent(k.priceCents - k.costCents, k.priceCents)
    }))
    .sort((a, b) => b.marginPct - a.marginPct);

  if (!ranked.length) return fallback('Belum ada menu untuk dianalisis.', []);

  return {
    answer: [
      '**Kedudukan margin menu anda**',
      '',
      '| Kuih | Harga | Kos | Untung | Margin |',
      '| --- | --- | --- | --- | --- |',
      ...ranked.map((k, i) => `| ${i + 1}. ${k.name} | ${formatMoney(k.priceCents / 100)} | ${formatMoney(k.costCents / 100)} | ${formatMoney(k.profitCents / 100)} | ${k.marginPct}% |`),
      '',
      `💡 Fokus jualan pada **${ranked[0].name}** (margin ${ranked[0].marginPct}%). Kuih dengan margin terendah: **${ranked[ranked.length - 1].name}** (${ranked[ranked.length - 1].marginPct}%).`,
      recipes.length ? `Anda ada ${recipes.length} resipi berdaftar untuk rujukan kos.` : 'Tambah resipi untuk kiraan kos yang lebih tepat.'
    ].join('\n'),
    suggestions: [`Kos ${ranked[0].name}?`, 'Ringkasan pesanan hari ini']
  };
}

function todayAnswer(metrics, statusCounts, pickups) {
  const next = pickups[0];
  const lines = [
    '**Ringkasan hari ini**',
    '',
    `- Pesanan: **${metrics.orders}** (${metrics.done} selesai)`,
    `- Jualan kasar: **${formatMoney(metrics.grossCents / 100)}**`,
    `- Anggaran untung: **${formatMoney(metrics.netCents / 100)}** (margin ${metrics.marginPct}%)`,
    `- Status: ${statusCounts.baru} baru · ${statusCounts.disediakan} disediakan · ${statusCounts.sedia} sedia · ${statusCounts.selesai} selesai`,
    '',
    next
      ? `⏰ Pengambilan terdekat: **${next.customerName}** pada ${labelTime(next.pickupTime)} (${next.totalQty} unit).`
      : 'Tiada pengambilan menunggu untuk hari ini.'
  ];
  return {
    answer: lines.join('\n'),
    suggestions: ['Kuih mana paling untung?', 'Tunjuk menu']
  };
}

function menuAnswer(menu, config) {
  if (!menu.length) return fallback('Menu anda masih kosong. Tambah kuih di halaman Menu Kuih.', []);
  return {
    answer: [
      `**Menu aktif (${menu.length} jenis)**`,
      '',
      '| Kuih | Harga | Kos | Margin |',
      '| --- | --- | --- | --- |',
      ...menu.map((k) => `| ${k.name} | ${formatMoney(k.priceCents / 100)} | ${formatMoney(k.costCents / 100)} | ${percent(k.priceCents - k.costCents, k.priceCents)}% |`),
      '',
      `Slot pengambilan: ${(config.pickupSlots || []).map(labelTime).join(' · ')}`
    ].join('\n'),
    suggestions: ['Kira untung 100 biji ' + menu[0].name, 'Ringkasan pesanan hari ini']
  };
}

function costTips(menu, recipes, config) {
  const highest = menu
    .filter((k) => k.costCents > 0)
    .sort((a, b) => b.costCents - a.costCents)
    .slice(0, 3);

  return {
    answer: [
      '**Cara menurunkan kos bahan**',
      '',
      highest.length
        ? `Kos tertinggi anda: ${highest.map((k) => `${k.name} (${formatMoney(k.costCents / 100)})`).join(', ')}.`
        : 'Belum ada data kos yang cukup.',
      '',
      '1. **Beli pukal** gula melaka, santan dan tepung — kos seunit biasanya turun 8–15%.',
      '2. **Standardkan sukatan** dalam resipi supaya tiada lebihan bahan setiap batch.',
      '3. **Semak harga bahan setiap minggu** di halaman Bahan Mentah, kemudian kemas kini kos resipi supaya margin kekal tepat.',
      '4. **Naikkan hasil resipi** (yield) tanpa tambah bahan — contohnya saiz potongan yang konsisten.',
      `5. Fokus jualan pada kuih bermargin tinggi; ambang amaran sistem kini ${config.lowMarginThresholdPct}%.`
    ].join('\n'),
    suggestions: ['Kuih mana paling untung?', 'Ringkasan pesanan hari ini']
  };
}

function suggestionsFor(menu) {
  const out = [];
  if (menu[0]) out.push(`Kos ${menu[0].name}?`);
  out.push('Harga jual sesuai untuk kos modal RM0.55?');
  out.push('Ringkasan pesanan hari ini');
  return out.slice(0, 3);
}

function fallback(answer, suggestions) {
  return { answer, suggestions };
}

function formatMoney(value) {
  return formatRM(Math.round(Number(value || 0) * 100));
}

function roundTo5Sen(value) {
  return Math.round(Number(value) * 20) / 20;
}

export { addDaysISO };

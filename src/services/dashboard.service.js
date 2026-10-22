import { addDaysISO, dateRange, daysBetween, daysAgoISO, labelDate, labelTime, todayISO } from '../lib/time.js';
import { percent } from '../lib/money.js';

export function dashboardService({ repos, settings }) {
  return {
    async overview(tenantId, { range = 'today', from = null, to = null } = {}) {
      const today = todayISO();
      let start = today;
      let end = today;

      switch (range) {
        case '7d': start = daysAgoISO(6); end = today; break;
        case '30d': start = daysAgoISO(29); end = today; break;
        case '90d': start = daysAgoISO(89); end = today; break;
        case 'all': start = '2000-01-01'; end = today; break;
        case 'custom':
          start = from || today;
          end = to || today;
          if (start > end) [start, end] = [end, start];
          break;
        default: start = today; end = today;
      }

      const [tenant, config, metrics, statusCounts, topKuih, pickups, recentOrders, kuihList, recipes] = await Promise.all([
        repos.tenants.findById(tenantId),
        settings.all(),
        repos.orders.metrics({ tenantId, from: start, to: end }),
        repos.orders.statusCounts({ tenantId, from: start, to: end }),
        repos.orders.topKuih({ tenantId, from: start, to: end, limit: 5 }),
        repos.orders.pickupsForDate(tenantId, today),
        repos.orders.list({ tenantId, limit: 6 }),
        repos.kuih.listByTenant(tenantId),
        repos.recipes.listByTenant(tenantId)
      ]);

      // Siri masa untuk carta (maksimum 30 titik)
      const seriesEnd = end === '2999-12-31' ? today : end;
      const seriesStart = addDaysISO(seriesEnd, -29);
      const seriesFrom = range === 'today' ? addDaysISO(today, -6) : seriesStart > start ? seriesStart : start;
      const rawSeries = await repos.orders.series({ tenantId, from: seriesFrom, to: seriesEnd });
      const byDate = new Map(rawSeries.map((p) => [p.date, p]));
      const series = dateRange(seriesFrom, seriesEnd).map((date) => {
        const point = byDate.get(date);
        return {
          date,
          label: labelDate(date).replace(/ \d{4}$/, ''),
          orders: point?.orders || 0,
          grossCents: point?.grossCents || 0,
          netCents: point?.netCents || 0
        };
      });

      // Perbandingan dengan tempoh sebelumnya
      let previous = null;
      let deltas = null;
      if (range !== 'all') {
        const span = daysBetween(start, end) + 1;
        const prevEnd = addDaysISO(start, -1);
        const prevStart = addDaysISO(prevEnd, -(span - 1));
        previous = await repos.orders.metrics({ tenantId, from: prevStart, to: prevEnd });
        const delta = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
        deltas = {
          grossPct: delta(metrics.grossCents, previous.grossCents),
          netPct: delta(metrics.netCents, previous.netCents),
          ordersPct: delta(metrics.orders, previous.orders)
        };
      }

      const lowMargin = kuihList
        .filter((k) => k.priceCents > 0)
        .map((k) => ({ ...k, marginPct: percent(k.priceCents - k.costCents, k.priceCents) }))
        .sort((a, b) => a.marginPct - b.marginPct)
        .slice(0, 3);

      const alerts = [];
      if (statusCounts.baru > 0) {
        alerts.push({ type: 'info', text: `${statusCounts.baru} pesanan baru menunggu pengesahan.` });
      }
      if (statusCounts.sedia > 0) {
        alerts.push({ type: 'ready', text: `${statusCounts.sedia} pesanan sedia untuk diambil hari ini.` });
      }
      const thin = lowMargin.find((k) => k.marginPct < Number(config.lowMarginThresholdPct || 35));
      if (thin) {
        alerts.push({ type: 'warn', text: `Margin ${thin.name} hanya ${thin.marginPct}% — semak kos bahan dalam kalkulator.` });
      }

      const topSelling = topKuih[0] || null;

      return {
        tenant,
        config: {
          pickupSlots: config.pickupSlots,
          lowMarginThresholdPct: config.lowMarginThresholdPct,
          platformName: config.platformName
        },
        range: { key: range, from: start, to: end, label: rangeLabel(range, start, end) },
        metrics,
        previous,
        deltas,
        series,
        statusCounts,
        topKuih,
        lowMargin,
        pickups,
        recentOrders,
        alerts,
        recipeCount: recipes.length,
        insight: topSelling
          ? `${topSelling.name} paling laris (${topSelling.qty} unit) dalam tempoh ini.`
          : 'Belum ada pesanan dalam tempoh ini. Buka borang pelanggan untuk mula merekod.',
        today: {
          date: today,
          pickups: pickups.length,
          pending: pickups.filter((p) => p.status !== 'sedia').length
        }
      };
    }
  };
}

function rangeLabel(range, start, end) {
  switch (range) {
    case 'today': return 'Hari ini';
    case '7d': return '7 hari terakhir';
    case '30d': return '30 hari terakhir';
    case '90d': return '90 hari terakhir';
    case 'all': return 'Semua masa';
    default: return `${labelDate(start)} – ${labelDate(end)}`;
  }
}

export { labelTime };

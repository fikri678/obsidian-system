import { randomUUID } from 'node:crypto';
import { forbidden, notFound, validation } from '../lib/errors.js';
import { optionalString, requireEnum, requireInt, requireString } from '../lib/validate.js';
import { isDateISO, isTimeHHMM, labelDate, labelTime, stamp, todayISO } from '../lib/time.js';
import { formatRM, toCents } from '../lib/money.js';
import { waMeUrl } from '../lib/phone.js';

export const ORDER_FLOW = ['baru', 'disediakan', 'sedia', 'selesai'];
export const ORDER_STATUS_LABELS = {
  baru: 'Baru Diterima',
  disediakan: 'Sedang Disediakan',
  sedia: 'Sedia Diambil',
  selesai: 'Selesai',
  batal: 'Dibatalkan'
};
export const CHANNELS = ['walkin', 'whatsapp', 'telefon', 'web', 'suara'];

export function ordersService({ repos, audit }) {
  const service = {
    async list(tenantId, filters) {
      return repos.orders.list({ tenantId, ...filters });
    },

    async get(orderId, tenantId = null) {
      const order = await repos.orders.findById(orderId, tenantId);
      if (!order) throw notFound('Pesanan tidak dijumpai.');
      return order;
    },

    /**
     * Cipta pesanan. Harga & kos disimpan sebagai snapshot supaya
     * laporan lampau tidak berubah apabila menu dikemas kini.
     */
    async create(tenantId, actor, payload, { channel = null, allowPastDate = false } = {}) {
      const tenant = await repos.tenants.findById(tenantId);
      if (!tenant) throw notFound('Kedai tidak dijumpai.');
      if (tenant.status !== 'active') throw forbidden('Kedai ini tidak aktif.');

      const customerName = requireString(payload.customerName, 'Nama pelanggan', { max: 120 });
      const phone = requireString(payload.phone, 'Nombor telefon', { max: 40 });
      if ((phone.match(/\d/g) || []).length < 7) throw validation('Nombor telefon tidak sah.', { field: 'phone' });

      const pickupDate = payload.pickupDate || todayISO();
      if (!isDateISO(pickupDate)) throw validation('Tarikh pengambilan tidak sah.', { field: 'pickupDate' });
      if (!allowPastDate && pickupDate < todayISO()) {
        throw validation('Tarikh pengambilan tidak boleh di masa lampau.', { field: 'pickupDate' });
      }
      const pickupTime = payload.pickupTime || '10:30';
      if (!isTimeHHMM(pickupTime)) throw validation('Masa pengambilan tidak sah (HH:MM).', { field: 'pickupTime' });

      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      if (!rawItems.length) throw validation('Sekurang-kurangnya satu jenis kuih diperlukan.', { field: 'items' });
      if (rawItems.length > 40) throw validation('Terlalu banyak item dalam satu pesanan.');

      const menu = new Map((await repos.kuih.listByTenant(tenantId)).map((k) => [k.id, k]));
      const merged = new Map();
      for (const item of rawItems) {
        const kuihId = String(item.kuihId || '');
        const kuih = menu.get(kuihId);
        if (!kuih) throw validation('Kuih tidak sah atau telah dimansuhkan.', { field: 'items' });
        const qty = requireInt(item.qty, 'Kuantiti', { min: 1, max: 5000 });
        const prev = merged.get(kuihId);
        merged.set(kuihId, { kuih, qty: (prev?.qty || 0) + qty });
      }

      const items = [];
      let totalCents = 0;
      let costCents = 0;
      for (const { kuih, qty } of merged.values()) {
        const lineTotal = qty * kuih.priceCents;
        totalCents += lineTotal;
        costCents += qty * kuih.costCents;
        items.push({
          id: `oit_${randomUUID()}`,
          kuihId: kuih.id,
          name: kuih.name,
          qty,
          unitPriceCents: kuih.priceCents,
          unitCostCents: kuih.costCents,
          lineTotalCents: lineTotal
        });
      }

      let discountCents = 0;
      if (payload.discount !== undefined) {
        discountCents = toCents(Number(payload.discount || 0));
        if (discountCents < 0 || discountCents > totalCents) {
          throw validation('Diskaun mesti antara RM0 dan jumlah pesanan.', { field: 'discount' });
        }
      }

      const now = stamp();
      const order = await repos.orders.create({
        id: `ord_${randomUUID()}`,
        tenantId,
        code: null,
        customerName,
        phone,
        pickupDate,
        pickupTime,
        status: 'baru',
        channel: channel || (CHANNELS.includes(payload.channel) ? payload.channel : 'walkin'),
        note: optionalString(payload.note, { max: 500 }),
        totalCents: totalCents - discountCents,
        costCents,
        discountCents,
        createdBy: actor?.id || null,
        createdAt: now,
        updatedAt: now
      }, items);

      await audit.log({
        actorUser: actor, tenantId, action: 'order.created', entity: 'order', entityId: order.id,
        detail: { code: order.code, customer: order.customerName, totalCents: order.totalCents, channel: order.channel }
      });
      return order;
    },

    async setStatus(orderId, tenantId, status, actor) {
      const order = await repos.orders.findById(orderId, tenantId);
      if (!order) throw notFound('Pesanan tidak dijumpai.');
      requireEnum(status, ['baru', 'disediakan', 'sedia', 'selesai', 'batal'], 'Status');
      if (order.status === status) return order;
      if (order.status === 'batal' && status !== 'batal') {
        throw validation('Pesanan yang dibatalkan tidak boleh diaktifkan semula.');
      }
      const updated = await repos.orders.updateStatus(orderId, status, tenantId);
      await audit.log({
        actorUser: actor, tenantId, action: 'order.status_changed', entity: 'order', entityId: orderId,
        detail: { code: order.code, from: order.status, to: status }
      });
      return updated;
    },

    async advance(orderId, tenantId, actor) {
      const order = await repos.orders.findById(orderId, tenantId);
      if (!order) throw notFound('Pesanan tidak dijumpai.');
      if (order.status === 'batal') throw validation('Pesanan ini telah dibatalkan.');
      const idx = ORDER_FLOW.indexOf(order.status);
      if (idx < 0 || idx === ORDER_FLOW.length - 1) return order;
      return service.setStatus(orderId, tenantId, ORDER_FLOW[idx + 1], actor);
    },

    /**
     * Resit digital untuk pelanggan (dihantar melalui WhatsApp).
     * Format rasmi NIVORA: kedai, no. tempahan, pelanggan, tarikh/masa ambil,
     * senarai item, jumlah bayaran, status dan arahan pengambilan.
     */
    receipt(order, tenant) {
      const separator = '----------------------------------------';
      const lines = [
        '🧾 *RESIT PENGESAHAN TEMPAHAN - NIVORA*',
        separator,
        `*Kedai:* ${tenant?.name || 'Kedai Kuih'}`,
        `*No. Tempahan:* #${order.code}`,
        `*Nama Pelanggan:* ${order.customerName}`,
        `*Tarikh & Masa Ambil:* ${labelDate(order.pickupDate, { withDay: true })}, ${labelTime(order.pickupTime)}`,
        '',
        '📋 *SENARAI PESANAN:*',
        ...order.items.map((item) => `• ${item.qty} × ${item.name} @ ${formatRM(item.unitPriceCents)} = ${formatRM(item.lineTotalCents)}`),
        separator,
        `💰 *JUMLAH BAYARAN:* *${formatRM(order.totalCents)}*`,
        '📌 *STATUS:* Tempahan Diterima',
        separator,
        '_Sila simpan resit ini dan tunjukkan semasa waktu pengambilan kuih._',
        'Terima kasih kerana menempah melalui NIVORA!'
      ];

      const text = lines.join('\n');
      return { text, phone: order.phone, code: order.code, waUrl: waMeUrl(order.phone, text) };
    },

    /** Nama lama dikekalkan untuk keserasian. */
    whatsappMessage(order, tenant) {
      return service.receipt(order, tenant).text;
    }
  };

  return service;
}

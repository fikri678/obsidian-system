/**
 * Utiliti resit WhatsApp NIVORA.
 * Digunakan untuk tindakan peniaga (menghantar resit kepada pelanggan) —
 * borang pelanggan sendiri TIDAK memanggil fungsi ini secara automatik.
 */
import { money, dateLabel, timeLabel } from './format.js';

/**
 * Tukar nombor telefon Malaysia ke format antarabangsa tanpa '+'.
 * 0123456789 -> 60123456789 · 60123456789 -> 60123456789
 */
export function normalizeMalaysiaPhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('0060')) digits = digits.slice(2);
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  if (digits.startsWith('1')) return `60${digits}`;
  return digits;
}

/** Bina teks resit rasmi NIVORA daripada data tempahan. */
export function buildWhatsAppReceiptMessage(orderData) {
  const separator = '----------------------------------------';
  const items = Array.isArray(orderData.items) ? orderData.items : [];

  return [
    '🧾 *RESIT PENGESAHAN TEMPAHAN - NIVORA*',
    separator,
    `*Kedai:* ${orderData.tenantName || orderData.tenant?.name || 'Kedai Kuih'}`,
    `*No. Tempahan:* #${orderData.code}`,
    `*Nama Pelanggan:* ${orderData.customerName}`,
    `*Tarikh & Masa Ambil:* ${dateLabel(orderData.pickupDate, { withDay: true })}, ${timeLabel(orderData.pickupTime)}`,
    '',
    '📋 *SENARAI PESANAN:*',
    ...items.map((item) => (
      `• ${item.qty} × ${item.name} @ ${money(item.unitPriceCents)} = ${money(item.lineTotalCents)}`
    )),
    separator,
    `💰 *JUMLAH BAYARAN:* *${money(orderData.totalCents)}*`,
    '📌 *STATUS:* Tempahan Diterima',
    separator,
    '_Sila simpan resit ini dan tunjukkan semasa waktu pengambilan kuih._',
    'Terima kasih kerana menempah melalui NIVORA!'
  ].join('\n');
}

/**
 * Jana pautan wa.me dan buka WhatsApp untuk pelanggan.
 * @param {object} orderData  Data tempahan yang telah disimpan di backend.
 * @param {{ targetWindow?: Window|null }} [options]
 * @returns {{ phone: string, message: string, url: string }}
 */
export function generateAndSendWhatsAppReceipt(orderData, options = {}) {
  const phone = normalizeMalaysiaPhone(orderData.phone);
  const message = buildWhatsAppReceiptMessage(orderData);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  const target = options.targetWindow || null;
  if (target && !target.closed) {
    try {
      target.location.href = url;
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  } else {
    window.open(url, '_blank', 'noopener');
  }

  return { phone, message, url };
}

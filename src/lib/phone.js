/** Normalisasi nombor Malaysia ke format antarabangsa untuk wa.me (60…). */
export function normalisePhoneMY(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('0060')) digits = digits.slice(2);
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  if (digits.startsWith('1')) return `60${digits}`;
  return digits;
}

export function waMeUrl(phone, text) {
  return `https://wa.me/${normalisePhoneMY(phone)}?text=${encodeURIComponent(String(text || ''))}`;
}

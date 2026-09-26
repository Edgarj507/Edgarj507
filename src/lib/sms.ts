/**
 * Build an `sms:` link that opens a pre-filled group text. iOS uses `sms:/open?addresses=a,b&body=`
 * (group thread); Android uses `sms:a,b?body=`. No SMS gateway or cost — the golfer's own phone
 * sends it.
 */
export function normalizePhone(raw: string, defaultCountry = '1'): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `+${defaultCountry}${d}`;
  if (d.length === 11 && d.startsWith(defaultCountry)) return `+${d}`;
  return null;
}

export function smsGroupLink(phones: string[], body: string, ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const list = phones.map((p) => normalizePhone(p)).filter((p): p is string => !!p);
  const text = encodeURIComponent(body);
  const ios = /iPhone|iPad|iPod|Macintosh/.test(ua);
  return ios ? `sms:/open?addresses=${list.join(',')}&body=${text}` : `sms:${list.join(',')}?body=${text}`;
}

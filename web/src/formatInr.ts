const inrFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/**
 * Formats a numeric value using the Indian numbering system with ₹ symbol.
 * Example: 2850000 -> "₹28,50,000", -645600 -> "-₹6,45,600"
 */
export function formatRupees(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${inrFormatter.format(Math.round(Math.abs(amount)))}`;
}

/**
 * Replaces INR amounts (e.g. "INR 28,50,000", "INR 2850000", "-INR 6,45,600", "+INR 1,00,000")
 * with Indian-grouped ₹ formatting ("₹28,50,000", "-₹6,45,600", "+₹1,00,000").
 */
export function formatInrInText(text: string): string {
  if (!text) return text;
  return text.replace(/([+-]?)INR\s*([0-9][0-9,]*(?:\.\d+)?)/gi, (_m, sign: string, rawNum: string) => {
    const cleaned = Number(rawNum.replace(/,/g, ''));
    if (!Number.isFinite(cleaned)) return `${sign}₹${rawNum}`;
    return `${sign}₹${inrFormatter.format(Math.round(cleaned))}`;
  });
}

/**
 * Formats an ISO date string like "2026-11-30" as "30 Nov 2026".
 */
export function formatShortDate(isoDate?: string): string {
  if (!isoDate) return '30 Nov 2026';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = match[1];
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11) return isoDate;
  return `${day} ${months[monthIdx]} ${year}`;
}

/**
 * Returns the last 6 characters prefixed with bullets for display.
 */
export function shortTail(value: string, tailLen = 6): string {
  if (!value) return '';
  if (value.length <= tailLen) return value;
  return `••••${value.slice(-tailLen)}`;
}

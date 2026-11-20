import type { FactField, VerifiedFact } from '../schemas/case.js';

const SENSITIVE_FIELDS = new Set<FactField>(['passport_number', 'account_number']);

export function maskIdentifier(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '');
  if (cleaned.length <= 4) {
    return '****';
  }
  const last4 = cleaned.slice(-4);
  return `${'*'.repeat(Math.max(4, cleaned.length - 4))}${last4}`;
}

export function maskFactIfSensitive(fact: VerifiedFact): VerifiedFact {
  if (!SENSITIVE_FIELDS.has(fact.field)) {
    return fact;
  }

  const rawValue = fact.value.trim();
  const maskedValue = maskIdentifier(rawValue);

  let maskedQuote = fact.quote;
  if (rawValue.length > 4) {
    const escaped = rawValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    maskedQuote = maskedQuote.replace(new RegExp(escaped, 'gi'), maskedValue);
    // Also handle spaces/dashes stripped version if present
    const compact = rawValue.replace(/[\s-]+/g, '');
    if (compact.length > 4 && compact !== rawValue) {
      const escapedCompact = compact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      maskedQuote = maskedQuote.replace(new RegExp(escapedCompact, 'gi'), maskedValue);
    }
  }

  return {
    ...fact,
    value: maskedValue,
    quote: maskedQuote,
  };
}

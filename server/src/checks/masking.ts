import type { FactField, VerifiedFact } from '../schemas/case.js';

const SENSITIVE_FIELDS = new Set<FactField>([
  'passport_number',
  'account_number',
  'aadhaar_number',
  'pan_number',
]);

// Indian PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

// Indian Aadhaar format: 12 digits grouped as 4-4-4 with spaces/hyphens (e.g. 2345 6789 0123)
// OR 12 contiguous digits starting with 2-9 (Aadhaar never starts with 0 or 1)
const AADHAAR_GROUPED_REGEX = /\b[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}\b/g;
const AADHAAR_COMPACT_REGEX = /\b[2-9]\d{11}\b/g;

export function maskIdentifier(raw: string): string {
  const cleaned = raw.replace(/[\s-]+/g, '');
  if (cleaned.length <= 4) {
    return '****';
  }
  const last4 = cleaned.slice(-4);
  return `${'*'.repeat(Math.max(4, cleaned.length - 4))}${last4}`;
}

export function maskAadhaarAndPanInText(text: string): string {
  return text
    .replace(PAN_REGEX, (match) => maskIdentifier(match))
    .replace(AADHAAR_GROUPED_REGEX, (match) => maskIdentifier(match))
    .replace(AADHAAR_COMPACT_REGEX, (match) => maskIdentifier(match));
}

export function maskFactIfSensitive(fact: VerifiedFact): VerifiedFact {
  let maskedValue = fact.value;
  let maskedQuote = fact.quote;

  if (SENSITIVE_FIELDS.has(fact.field)) {
    const rawValue = fact.value.trim();
    maskedValue = maskIdentifier(rawValue);

    if (rawValue.length > 4) {
      const escaped = rawValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      maskedQuote = maskedQuote.replace(new RegExp(escaped, 'gi'), maskedValue);
      const compact = rawValue.replace(/[\s-]+/g, '');
      if (compact.length > 4 && compact !== rawValue) {
        const escapedCompact = compact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        maskedQuote = maskedQuote.replace(new RegExp(escapedCompact, 'gi'), maskedValue);
      }
    }
  }

  // Always scan ALL values and quotes for Aadhaar and PAN patterns
  maskedValue = maskAadhaarAndPanInText(maskedValue);
  maskedQuote = maskAadhaarAndPanInText(maskedQuote);

  return {
    ...fact,
    value: maskedValue,
    quote: maskedQuote,
  };
}

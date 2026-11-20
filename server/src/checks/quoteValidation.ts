import type { DocumentType, RawExtractedFact, VerifiedFact } from '../schemas/case.js';

export function normalizeTextForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isQuoteFoundInFullText(quote: string, fullText: string): boolean {
  const normalizedQuote = normalizeTextForMatch(quote);
  if (!normalizedQuote) {
    return false;
  }
  const normalizedFull = normalizeTextForMatch(fullText);
  return normalizedFull.includes(normalizedQuote);
}

export function validateFactQuote(
  fact: RawExtractedFact,
  fullText: string,
  sourceDocName: string,
  sourceDocType: DocumentType
): VerifiedFact {
  const quoteVerified = isQuoteFoundInFullText(fact.quote, fullText);
  const lowConfidence = fact.confidence < 0.75;
  return {
    ...fact,
    sourceDocName,
    sourceDocType,
    quoteVerified,
    needsReview: !quoteVerified || lowConfidence,
  };
}

import type { CheckFlag, VerifiedFact } from '../schemas/case.js';

export function tokenizeName(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0);
}

/**
 * Compares two names ignoring case, word order, extra spaces, and single-letter initials.
 * Examples that match:
 * - "Arun Reddy" vs "REDDY, ARUN" -> true
 * - "Arun Kumar Reddy" vs "A. K. Reddy" -> true
 * - "Arun Reddy" vs "A Reddy" -> true
 * Examples that do NOT match:
 * - "Arun Reddy" vs "Rohan Reddy" -> false
 * - "Arun Kumar" vs "Arun Reddy" -> false
 */
export function doNamesMatch(nameA: string, nameB: string): boolean {
  const tokensA = tokenizeName(nameA);
  const tokensB = tokenizeName(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return false;
  }

  // Exact multiset match (ignoring order)
  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');
  if (sortedA === sortedB) {
    return true;
  }

  const fullA = tokensA.filter((t) => t.length > 1);
  const fullB = tokensB.filter((t) => t.length > 1);
  const initialsA = tokensA.filter((t) => t.length === 1);
  const initialsB = tokensB.filter((t) => t.length === 1);

  // Every full token in the shorter full-name set must appear in the other's full tokens
  // OR match an initial in the other set, AND there must be at least one full token shared.
  const sharedFull = fullA.filter((t) => fullB.includes(t));
  if (sharedFull.length === 0) {
    return false;
  }

  const unmatchedA = fullA.filter((t) => !fullB.includes(t));
  const unmatchedB = fullB.filter((t) => !fullA.includes(t));

  // If both sides have different full words that don't correspond to initials on the other side, it's a mismatch.
  const aCoveredByInitials = unmatchedA.every((word) => initialsB.includes(word[0]));
  const bCoveredByInitials = unmatchedB.every((word) => initialsA.includes(word[0]));

  if (!aCoveredByInitials || !bCoveredByInitials) {
    return false;
  }

  // Also ensure every initial on A matches the first letter of some token on B, and vice versa
  const allInitialsAMatch = initialsA.every((init) => tokensB.some((t) => t.startsWith(init)));
  const allInitialsBMatch = initialsB.every((init) => tokensA.some((t) => t.startsWith(init)));

  return allInitialsAMatch && allInitialsBMatch;
}

export function checkNameConsistency(facts: VerifiedFact[]): CheckFlag {
  const nameFacts = facts.filter((f) => f.field === 'name' && f.value.trim().length > 0);

  if (nameFacts.length === 0) {
    return {
      id: 'name-missing',
      checkType: 'name_match',
      severity: 'amber',
      title: 'Student name not found',
      summary: 'No student name was extracted from the uploaded documents.',
      quote: '',
    };
  }

  if (nameFacts.length === 1) {
    return {
      id: 'name-single-doc',
      checkType: 'name_match',
      severity: 'green',
      title: 'Name found on uploaded document',
      summary: `Found "${nameFacts[0].value}" on ${nameFacts[0].sourceDocName}. Upload another document to cross-check spelling across files.`,
      quote: nameFacts[0].quote,
      sourceDocName: nameFacts[0].sourceDocName,
    };
  }

  const baseline = nameFacts[0];
  const mismatches: VerifiedFact[] = [];

  for (let i = 1; i < nameFacts.length; i++) {
    if (!doNamesMatch(baseline.value, nameFacts[i].value)) {
      mismatches.push(nameFacts[i]);
    }
  }

  if (mismatches.length > 0) {
    const firstMismatch = mismatches[0];
    return {
      id: 'name-mismatch',
      checkType: 'name_match',
      severity: 'red',
      title: 'Name mismatch across documents',
      summary: `"${baseline.value}" (${baseline.sourceDocName}) does not match "${firstMismatch.value}" (${firstMismatch.sourceDocName}).`,
      quote: `${baseline.sourceDocName}: "${baseline.quote}" | ${firstMismatch.sourceDocName}: "${firstMismatch.quote}"`,
      sourceDocName: firstMismatch.sourceDocName,
    };
  }

  return {
    id: 'name-match-ok',
    checkType: 'name_match',
    severity: 'green',
    title: 'Names match across all documents',
    summary: `Checked ${nameFacts.length} document name entries; all match "${baseline.value}" (ignoring case, word order, and initials).`,
    quote: baseline.quote,
    sourceDocName: baseline.sourceDocName,
  };
}

import type { CheckFlag, VerifiedFact } from '../schemas/case.js';

export interface ExceptionRoutingInput {
  flags: CheckFlag[];
  facts: VerifiedFact[];
  unsupportedFreeTextFields?: string[];
  hasDeclarationOrLegalStatement?: boolean;
  hasFeePayment?: boolean;
  hasSafetyConfirmation?: boolean;
}

export interface ExceptionRoutingResult {
  queueBucket: 'exceptions' | 'green_batch';
  exceptionReasons: string[];
  preApprovedByRules: boolean;
}

/**
 * Plain-code exception routing (never decided by the model).
 * Routes a case to the human counselor if ANY of the 7 high-stakes triggers apply:
 * 1. Any red flag
 * 2. Any quote not found in the document
 * 3. Any low-confidence fact (< 0.75)
 * 4. Free-text answers unsupported by documents
 * 5. A declaration or legal statement
 * 6. A fee payment
 * 7. A computer-use safety confirmation
 *
 * Otherwise the case is pre-approved by rules in code and eligible for green batch approval.
 */
export function evaluateExceptionRouting(
  input: ExceptionRoutingInput
): ExceptionRoutingResult {
  const reasons: string[] = [];

  const redFlags = input.flags.filter((f) => f.severity === 'red');
  for (const rf of redFlags) {
    reasons.push(`Red flag: ${rf.title}`);
  }

  const missingQuoteFacts = input.facts.filter((f) => !f.quoteVerified);
  if (missingQuoteFacts.length > 0) {
    reasons.push(
      `Quote not verified in document for: ${missingQuoteFacts.map((f) => f.field).join(', ')}`
    );
  }

  const lowConfidenceFacts = input.facts.filter((f) => f.confidence < 0.75);
  if (lowConfidenceFacts.length > 0) {
    reasons.push(
      `Low extraction confidence (<0.75) for: ${lowConfidenceFacts.map((f) => f.field).join(', ')}`
    );
  }

  if (input.unsupportedFreeTextFields && input.unsupportedFreeTextFields.length > 0) {
    reasons.push(
      `Free-text answers unsupported by documents: ${input.unsupportedFreeTextFields.join(', ')}`
    );
  }

  if (input.hasDeclarationOrLegalStatement) {
    reasons.push('Declaration or legal statement requires counselor review.');
  }

  if (input.hasFeePayment) {
    reasons.push('Fee payment requires counselor review.');
  }

  if (input.hasSafetyConfirmation) {
    reasons.push('Agent safety confirmation requires counselor approval.');
  }

  const hasExceptions = reasons.length > 0;
  return {
    queueBucket: hasExceptions ? 'exceptions' : 'green_batch',
    exceptionReasons: reasons,
    preApprovedByRules: !hasExceptions,
  };
}

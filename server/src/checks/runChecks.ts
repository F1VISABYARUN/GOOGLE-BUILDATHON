import type {
  CheckFlag,
  ExchangeRateConfig,
  VerifiedFact,
} from '../schemas/case.js';
import { checkNameConsistency } from './nameMatch.js';
import {
  checkDocumentDates,
  checkFundsVsRequiredCost,
  checkGpaAndBacklogs,
} from './moneyAndDates.js';
import type { UkRules } from './rulesLoader.js';

export interface RunChecksInput {
  facts: VerifiedFact[];
  destinationCountry: string;
  ukRegion?: 'london' | 'outside_london';
  requiredCostOverride?: { amount: number; currency: string } | null;
  exchangeRates: ExchangeRateConfig;
  referenceDate?: Date;
  ukRules?: UkRules;
}

export function runAllChecks(input: RunChecksInput): CheckFlag[] {
  const flags: CheckFlag[] = [];

  // 1. Quote verification review flags
  const unverifiedFacts = input.facts.filter((f) => !f.quoteVerified);
  if (unverifiedFacts.length > 0) {
    flags.push({
      id: 'quotes-unverified',
      checkType: 'quote_review',
      severity: 'amber',
      title: `${unverifiedFacts.length} extracted fact(s) need manual quote review`,
      summary: `Exact quotes for ${unverifiedFacts.map((f) => f.field).join(', ')} were not found verbatim in the document text and are marked "needs review".`,
      quote: unverifiedFacts[0].quote || '(quote missing)',
      sourceDocName: unverifiedFacts[0].sourceDocName,
    });
  }

  // 2. Name matching across documents
  flags.push(checkNameConsistency(input.facts));

  // 3. Funds vs required cost
  flags.push(
    checkFundsVsRequiredCost({
      facts: input.facts,
      destinationCountry: input.destinationCountry,
      ukRegion: input.ukRegion,
      requiredCostOverride: input.requiredCostOverride,
      exchangeRates: input.exchangeRates,
      ukRules: input.ukRules,
    })
  );

  // 4. Document dates & UK 28-day rule
  flags.push(
    ...checkDocumentDates(
      input.facts,
      input.destinationCountry,
      input.referenceDate,
      input.ukRules
    )
  );

  // 5. GPA scale conversion & backlogs
  flags.push(...checkGpaAndBacklogs(input.facts));

  return flags;
}

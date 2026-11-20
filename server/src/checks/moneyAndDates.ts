import type {
  CheckFlag,
  ExchangeRateConfig,
  VerifiedFact,
} from '../schemas/case.js';
import { loadUkRules, type UkRules } from './rulesLoader.js';

export function parseNumericAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function normalizeCurrencyCode(raw?: string): string {
  if (!raw) return 'INR';
  const upper = raw.trim().toUpperCase();
  if (upper === 'RS' || upper === 'RS.' || upper === '₹' || upper === 'RUPEES' || upper === 'INR') {
    return 'INR';
  }
  if (upper === '$' || upper === 'US$' || upper === 'USD') return 'USD';
  if (upper === '£' || upper === 'GBP') return 'GBP';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  if (upper === 'CAD' || upper === 'C$') return 'CAD';
  if (upper === 'AUD' || upper === 'A$') return 'AUD';
  return upper;
}

export function convertToInr(
  amount: number,
  currency: string,
  exchangeRates: ExchangeRateConfig
): number | null {
  const code = normalizeCurrencyCode(currency);
  if (code === 'INR') return amount;
  const rate = exchangeRates.ratesToInr[code];
  if (!rate || rate <= 0) return null;
  return amount * rate;
}

export function formatInr(amount: number): string {
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

export interface FundsCheckInput {
  facts: VerifiedFact[];
  destinationCountry: string;
  ukRegion?: 'london' | 'outside_london';
  requiredCostOverride?: { amount: number; currency: string } | null;
  exchangeRates: ExchangeRateConfig;
  ukRules?: UkRules;
}

function findCurrencyForDocument(facts: VerifiedFact[], docName: string): string {
  const currencyFact = facts.find(
    (f) => f.field === 'currency' && f.sourceDocName === docName && f.value.trim().length > 0
  );
  return normalizeCurrencyCode(currencyFact?.value || 'INR');
}

export function checkFundsVsRequiredCost(input: FundsCheckInput): CheckFlag {
  const { facts, destinationCountry, ukRegion = 'outside_london', requiredCostOverride, exchangeRates } = input;
  const ukRules = input.ukRules ?? loadUkRules();

  // 1. Sum available funds (bank_balance + loan_amount) in INR using visible dated exchange rates
  const fundFacts = facts.filter(
    (f) => (f.field === 'bank_balance' || f.field === 'loan_amount') && f.value.trim().length > 0
  );

  let totalAvailableInr = 0;
  const fundQuotes: string[] = [];

  for (const fact of fundFacts) {
    const amount = parseNumericAmount(fact.value);
    if (amount === null) continue;
    const currency = findCurrencyForDocument(facts, fact.sourceDocName);
    const inr = convertToInr(amount, currency, exchangeRates);
    if (inr === null) {
      return {
        id: 'funds-missing-rate',
        checkType: 'funds',
        severity: 'amber',
        title: `Exchange rate missing for ${currency}`,
        summary: `Cannot convert ${fact.value} (${currency}) to INR because no exchange rate is set for ${currency}. Counselor can add a dated rate.`,
        quote: fact.quote,
        sourceDocName: fact.sourceDocName,
      };
    }
    totalAvailableInr += inr;
    fundQuotes.push(`${fact.sourceDocName}: "${fact.quote}"`);
  }

  // 2. Determine required cost ONLY from:
  //    (a) counselor/user override, OR
  //    (b) I-20 / CAS / offer letter facts: unpaid tuition (tuition - deposit_paid) + living_cost, OR
  //    (c) For UK: unpaid tuition from CAS/offer (tuition - deposit_paid) + UK maintenance (£1,570 x 9 London / £1,203 x 9 elsewhere)
  //    NEVER invented by the model.
  let requiredInr: number | null = null;
  let requiredSourceSummary = '';
  let sourceUrl: string | undefined;
  let ruleAsOf: string | undefined;
  let missingUkTuitionNote = false;
  const requiredQuotes: string[] = [];
  const mathLines: string[] = [];

  for (const fact of fundFacts) {
    const amount = parseNumericAmount(fact.value);
    if (amount === null) continue;
    const currency = findCurrencyForDocument(facts, fact.sourceDocName);
    const inr = convertToInr(amount, currency, exchangeRates);
    if (inr !== null) {
      const label = fact.field === 'loan_amount' ? 'Education loan' : 'Bank balance';
      mathLines.push(
        `${label} (${fact.sourceDocName}): ${currency} ${amount.toLocaleString('en-US')} = ${formatInr(inr)}`
      );
    }
  }
  if (fundFacts.length > 0) {
    mathLines.push(`Total available funds: ${formatInr(totalAvailableInr)}`);
  }

  if (requiredCostOverride && requiredCostOverride.amount > 0) {
    const converted = convertToInr(
      requiredCostOverride.amount,
      requiredCostOverride.currency,
      exchangeRates
    );
    if (converted !== null) {
      requiredInr = converted;
      requiredSourceSummary = `entered/counselor required cost (${requiredCostOverride.currency} ${requiredCostOverride.amount.toLocaleString('en-US')})`;
      mathLines.push(
        `Required cost (entered): ${requiredCostOverride.currency} ${requiredCostOverride.amount.toLocaleString('en-US')} = ${formatInr(converted)}`
      );
    }
  } else {
    const offerTuition =
      facts.find((f) => f.field === 'tuition' && f.sourceDocType === 'i20_cas_offer') ||
      facts.find((f) => f.field === 'tuition');
    const offerDeposit =
      facts.find((f) => f.field === 'deposit_paid' && f.sourceDocType === 'i20_cas_offer') ||
      facts.find((f) => f.field === 'deposit_paid');
    const offerLiving =
      facts.find((f) => f.field === 'living_cost' && f.sourceDocType === 'i20_cas_offer') ||
      facts.find((f) => f.field === 'living_cost');

    let unpaidTuitionInr = 0;
    let livingInr = 0;
    let hasTuition = false;
    let hasLiving = false;

    if (offerTuition) {
      const tuitionAmt = parseNumericAmount(offerTuition.value);
      if (tuitionAmt !== null) {
        const cur = findCurrencyForDocument(facts, offerTuition.sourceDocName);
        const tuitionInr = convertToInr(tuitionAmt, cur, exchangeRates);
        if (tuitionInr !== null) {
          hasTuition = true;
          requiredQuotes.push(`${offerTuition.sourceDocName}: "${offerTuition.quote}"`);

          let depositAmt = 0;
          let depositInr = 0;
          if (offerDeposit) {
            const parsedDep = parseNumericAmount(offerDeposit.value);
            if (parsedDep !== null) {
              const depCur = findCurrencyForDocument(facts, offerDeposit.sourceDocName);
              const depConv = convertToInr(parsedDep, depCur, exchangeRates);
              if (depConv !== null) {
                depositAmt = parsedDep;
                depositInr = depConv;
                requiredQuotes.push(`${offerDeposit.sourceDocName}: "${offerDeposit.quote}"`);
              }
            }
          }

          unpaidTuitionInr = Math.max(0, tuitionInr - depositInr);
          const unpaidOrig = Math.max(0, tuitionAmt - depositAmt);
          mathLines.push(
            `CAS/Offer tuition: ${cur} ${tuitionAmt.toLocaleString('en-US')} minus deposit paid (${cur} ${depositAmt.toLocaleString('en-US')}) = Unpaid tuition ${cur} ${unpaidOrig.toLocaleString('en-US')} (${formatInr(unpaidTuitionInr)})`
          );
        }
      }
    }

    if (destinationCountry === 'UK') {
      const perMonth =
        ukRegion === 'london'
          ? ukRules.maintenance.londonPerMonth
          : ukRules.maintenance.outsideLondonPerMonth;
      const totalGbp = perMonth * ukRules.maintenance.maxMonths;
      const conv = convertToInr(totalGbp, 'GBP', exchangeRates);
      if (conv !== null) {
        livingInr = conv;
        hasLiving = true;
        sourceUrl = ukRules.sourceUrl;
        ruleAsOf = ukRules.asOf;
        mathLines.push(
          `UK living costs (${ukRegion === 'london' ? 'London' : 'Outside London'}): GBP ${perMonth.toLocaleString('en-US')}/mo × ${ukRules.maintenance.maxMonths} months = GBP ${totalGbp.toLocaleString('en-US')} (${formatInr(livingInr)} at INR ${exchangeRates.ratesToInr.GBP}/GBP as of ${exchangeRates.asOfDate})`
        );
      }
      if (!hasTuition) {
        missingUkTuitionNote = true;
        mathLines.push(
          'Unpaid tuition from CAS/offer: Not uploaded yet (upload CAS/offer letter to include tuition minus deposit paid).'
        );
      }
    } else if (offerLiving) {
      const amt = parseNumericAmount(offerLiving.value);
      if (amt !== null) {
        const cur = findCurrencyForDocument(facts, offerLiving.sourceDocName);
        const conv = convertToInr(amt, cur, exchangeRates);
        if (conv !== null) {
          livingInr = conv;
          hasLiving = true;
          requiredQuotes.push(`${offerLiving.sourceDocName}: "${offerLiving.quote}"`);
          mathLines.push(
            `Living costs (${offerLiving.sourceDocName}): ${cur} ${amt.toLocaleString('en-US')} = ${formatInr(livingInr)}`
          );
        }
      }
    }

    if (hasTuition || hasLiving) {
      requiredInr = unpaidTuitionInr + livingInr;
      if (destinationCountry === 'UK') {
        requiredSourceSummary = hasTuition
          ? `UK unpaid tuition + ${ukRegion === 'london' ? 'London' : 'Outside London'} living costs`
          : `UK ${ukRegion === 'london' ? 'London' : 'Outside London'} living costs (CAS tuition not yet uploaded)`;
      } else {
        requiredSourceSummary = 'uploaded I-20 / CAS / offer letter';
      }
      mathLines.push(`Total required funds: ${formatInr(requiredInr)}`);
    }
  }

  if (fundFacts.length === 0) {
    return {
      id: 'funds-missing-proof',
      checkType: 'funds',
      severity: 'amber',
      title: 'No financial proof uploaded',
      summary: 'No bank balance or education loan amount was found in the uploaded documents.',
      quote: '',
      mathLines,
    };
  }

  if (requiredInr === null) {
    return {
      id: 'funds-missing-cost',
      checkType: 'funds',
      severity: 'amber',
      title: 'Required university cost not provided',
      summary: `Found ${formatInr(totalAvailableInr)} in student funds (rate as of ${exchangeRates.asOfDate}), but no I-20/CAS/offer cost or counselor cost override was provided to compare against.`,
      quote: fundQuotes.join(' | '),
      mathLines,
    };
  }

  const combinedQuote = [...fundQuotes, ...requiredQuotes].join(' | ');

  if (totalAvailableInr < requiredInr) {
    const shortfall = requiredInr - totalAvailableInr;
    mathLines.push(`Shortfall: -${formatInr(shortfall)}`);
    return {
      id: 'funds-shortfall',
      checkType: 'funds',
      severity: 'red',
      title: 'Funds are short of required cost',
      summary: `Available funds (${formatInr(totalAvailableInr)}) are short by ${formatInr(shortfall)} compared to ${requiredSourceSummary} (${formatInr(requiredInr)}) using rates as of ${exchangeRates.asOfDate}.`,
      quote: combinedQuote,
      sourceUrl,
      ruleAsOf,
      mathLines,
    };
  }

  const surplus = totalAvailableInr - requiredInr;
  mathLines.push(`Buffer above required funds: +${formatInr(surplus)}`);

  if (missingUkTuitionNote) {
    return {
      id: 'funds-missing-cas-tuition',
      checkType: 'funds',
      severity: 'amber',
      title: 'Living costs covered, but CAS unpaid tuition is missing',
      summary: `Available funds (${formatInr(totalAvailableInr)}) cover UK living costs (${formatInr(requiredInr)}), but no CAS/offer letter was uploaded to add unpaid tuition (tuition minus deposit paid).`,
      quote: combinedQuote,
      sourceUrl,
      ruleAsOf,
      mathLines,
    };
  }

  return {
    id: 'funds-sufficient',
    checkType: 'funds',
    severity: 'green',
    title: 'Available funds meet required cost',
    summary: `Available funds (${formatInr(totalAvailableInr)}) cover ${requiredSourceSummary} (${formatInr(requiredInr)}) with a buffer of ${formatInr(surplus)} (rates as of ${exchangeRates.asOfDate}).`,
    quote: combinedQuote,
    sourceUrl,
    ruleAsOf,
    mathLines,
  };
}

export function parseDateSafe(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Handle DD/MM/YYYY or DD-MM-YYYY common on Indian bank statements
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

export function daysBetween(earlier: Date, later: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((later.getTime() - earlier.getTime()) / msPerDay);
}

export function checkDocumentDates(
  facts: VerifiedFact[],
  destinationCountry: string,
  referenceDate: Date = new Date(),
  ukRules: UkRules = loadUkRules()
): CheckFlag[] {
  const flags: CheckFlag[] = [];
  const maxAgeDays = destinationCountry === 'UK' ? ukRules.bankStatement.maxAgeDays : 90;

  const statementDateFact =
    facts.find((f) => f.field === 'statement_end_date') ||
    facts.find((f) => f.field === 'statement_date');

  const statementStartFact = facts.find((f) => f.field === 'statement_start_date');

  if (!statementDateFact) {
    const hasBankDoc = facts.some((f) => f.sourceDocType === 'bank_statement');
    if (hasBankDoc) {
      flags.push({
        id: 'date-missing',
        checkType: 'document_date',
        severity: 'amber',
        title: 'Bank statement date not found',
        summary: 'Could not find a closing or issue date on the bank statement to check freshness.',
        quote: '',
      });
    }
    return flags;
  }

  const stmtDate = parseDateSafe(statementDateFact.value);
  if (!stmtDate) {
    flags.push({
      id: 'date-unparseable',
      checkType: 'document_date',
      severity: 'amber',
      title: 'Bank statement date needs review',
      summary: `Could not read "${statementDateFact.value}" as a valid calendar date.`,
      quote: statementDateFact.quote,
      sourceDocName: statementDateFact.sourceDocName,
    });
    return flags;
  }

  const ageDays = daysBetween(stmtDate, referenceDate);
  if (ageDays > maxAgeDays) {
    flags.push({
      id: 'date-expired',
      checkType: 'document_date',
      severity: 'red',
      title: 'Bank statement is too old',
      summary: `Bank statement dated ${statementDateFact.value} is ${ageDays} days old (allowed window for ${destinationCountry}: ${maxAgeDays} days).`,
      quote: statementDateFact.quote,
      sourceDocName: statementDateFact.sourceDocName,
      sourceUrl: destinationCountry === 'UK' ? ukRules.bankStatement.sourceUrl : undefined,
      ruleAsOf: destinationCountry === 'UK' ? ukRules.asOf : undefined,
    });
  } else {
    flags.push({
      id: 'date-valid',
      checkType: 'document_date',
      severity: 'green',
      title: 'Bank statement date is within window',
      summary: `Statement dated ${statementDateFact.value} is ${Math.max(0, ageDays)} days old (limit: ${maxAgeDays} days).`,
      quote: statementDateFact.quote,
      sourceDocName: statementDateFact.sourceDocName,
      sourceUrl: destinationCountry === 'UK' ? ukRules.bankStatement.sourceUrl : undefined,
      ruleAsOf: destinationCountry === 'UK' ? ukRules.asOf : undefined,
    });
  }

  // UK 28-day consecutive holding rule
  if (destinationCountry === 'UK') {
    if (!statementStartFact) {
      flags.push({
        id: 'uk-28-day-missing-start',
        checkType: 'uk_28_day',
        severity: 'amber',
        title: 'UK 28-day rule could not be fully verified',
        summary: 'Statement start date was not found. UK Student visas require funds to be held for at least 28 consecutive days.',
        quote: statementDateFact.quote,
        sourceDocName: statementDateFact.sourceDocName,
        sourceUrl: ukRules.bankStatement.sourceUrl,
        ruleAsOf: ukRules.asOf,
      });
    } else {
      const startDate = parseDateSafe(statementStartFact.value);
      if (startDate) {
        const heldDays = daysBetween(startDate, stmtDate);
        if (heldDays < ukRules.bankStatement.minConsecutiveDaysHeld) {
          flags.push({
            id: 'uk-28-day-short',
            checkType: 'uk_28_day',
            severity: 'red',
            title: 'UK 28-day holding rule not met',
            summary: `Statement covers ${heldDays} days (${statementStartFact.value} to ${statementDateFact.value}), which is under the required ${ukRules.bankStatement.minConsecutiveDaysHeld} consecutive days.`,
            quote: `${statementStartFact.quote} | ${statementDateFact.quote}`,
            sourceDocName: statementDateFact.sourceDocName,
            sourceUrl: ukRules.bankStatement.sourceUrl,
            ruleAsOf: ukRules.asOf,
          });
        } else {
          flags.push({
            id: 'uk-28-day-ok',
            checkType: 'uk_28_day',
            severity: 'green',
            title: 'UK 28-day holding window met',
            summary: `Statement covers ${heldDays} days (${statementStartFact.value} to ${statementDateFact.value}), meeting the ${ukRules.bankStatement.minConsecutiveDaysHeld}-day UK requirement.`,
            quote: `${statementStartFact.quote} | ${statementDateFact.quote}`,
            sourceDocName: statementDateFact.sourceDocName,
            sourceUrl: ukRules.bankStatement.sourceUrl,
            ruleAsOf: ukRules.asOf,
          });
        }
      }
    }
  }

  return flags;
}

export function convertGpaTo4Scale(cgpa: number, scale: number): number | null {
  if (!Number.isFinite(cgpa) || !Number.isFinite(scale) || scale <= 0 || cgpa < 0) {
    return null;
  }
  if (scale === 4) {
    return Math.min(4, Math.round(cgpa * 100) / 100);
  }
  // Linear scale estimate (clearly labeled as estimate in UI)
  const converted = (cgpa / scale) * 4;
  return Math.min(4, Math.round(converted * 100) / 100);
}

export function checkGpaAndBacklogs(facts: VerifiedFact[]): CheckFlag[] {
  const flags: CheckFlag[] = [];
  const cgpaFact = facts.find((f) => f.field === 'cgpa');
  const scaleFact = facts.find((f) => f.field === 'cgpa_scale');
  const backlogsFact = facts.find((f) => f.field === 'backlogs');

  if (cgpaFact) {
    const cgpaNum = parseNumericAmount(cgpaFact.value);
    const scaleNum = scaleFact ? parseNumericAmount(scaleFact.value) : cgpaNum && cgpaNum > 10 ? 100 : cgpaNum && cgpaNum > 4 ? 10 : 4;
    if (cgpaNum !== null && scaleNum !== null) {
      const gpa4 = convertGpaTo4Scale(cgpaNum, scaleNum);
      const severity = gpa4 !== null && gpa4 < 2.5 ? 'amber' : 'green';
      flags.push({
        id: 'gpa-check',
        checkType: 'gpa_backlogs',
        severity,
        title: severity === 'green' ? 'Academic score extracted and converted' : 'Academic score may fall below typical cutoffs',
        summary: `Extracted ${cgpaNum} on a ${scaleNum} scale (estimated ${gpa4?.toFixed(2)} / 4.0 scale; official WES/university conversion may vary).`,
        quote: cgpaFact.quote,
        sourceDocName: cgpaFact.sourceDocName,
      });
    }
  }

  if (backlogsFact) {
    const count = parseNumericAmount(backlogsFact.value);
    if (count !== null) {
      if (count > 3) {
        flags.push({
          id: 'backlogs-high',
          checkType: 'gpa_backlogs',
          severity: 'red',
          title: 'High backlog count detected',
          summary: `${count} backlogs found on ${backlogsFact.sourceDocName}. Many universities cap backlogs at 3 or fewer.`,
          quote: backlogsFact.quote,
          sourceDocName: backlogsFact.sourceDocName,
        });
      } else if (count > 0) {
        flags.push({
          id: 'backlogs-moderate',
          checkType: 'gpa_backlogs',
          severity: 'amber',
          title: `${count} backlog(s) found`,
          summary: `${count} backlog(s) recorded on ${backlogsFact.sourceDocName}. Verify university backlog limits before applying.`,
          quote: backlogsFact.quote,
          sourceDocName: backlogsFact.sourceDocName,
        });
      } else {
        flags.push({
          id: 'backlogs-zero',
          checkType: 'gpa_backlogs',
          severity: 'green',
          title: 'Zero backlogs',
          summary: `0 backlogs recorded on ${backlogsFact.sourceDocName}.`,
          quote: backlogsFact.quote,
          sourceDocName: backlogsFact.sourceDocName,
        });
      }
    }
  }

  return flags;
}

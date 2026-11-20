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

export interface DailyClosingBalanceEntry {
  date: string;
  amount: number;
  currency: string;
  amountInr: number;
  quote: string;
  sourceDocName: string;
}

function extractDateStringFromText(text: string): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseDailyClosingBalanceFact(
  fact: VerifiedFact,
  facts: VerifiedFact[],
  exchangeRates: ExchangeRateConfig
): DailyClosingBalanceEntry | null {
  const rawVal = fact.value.trim();
  const currency = findCurrencyForDocument(facts, fact.sourceDocName);

  // Supports formats like "2026-11-04: 2600000", "2026-11-04 | INR 26,00,000", or plain number paired with date in quote
  let dateStr = extractDateStringFromText(rawVal) || extractDateStringFromText(fact.quote);
  let amountPart = rawVal;
  if (dateStr && rawVal.includes(':')) {
    const colonIdx = rawVal.indexOf(':');
    amountPart = rawVal.slice(colonIdx + 1).trim();
  } else if (dateStr && rawVal.includes('|')) {
    const pipeIdx = rawVal.indexOf('|');
    amountPart = rawVal.slice(pipeIdx + 1).trim();
  } else if (dateStr) {
    amountPart = rawVal.replace(dateStr, '').trim();
  }

  const amount = parseNumericAmount(amountPart);
  if (amount === null) return null;
  const amountInr = convertToInr(amount, currency, exchangeRates);
  if (amountInr === null) return null;

  if (!dateStr) {
    const fallbackDateFact = facts.find(
      (f) => f.field === 'lowest_balance_28_day_date' && f.sourceDocName === fact.sourceDocName
    );
    dateStr = fallbackDateFact?.value.trim() || 'unspecified date';
  }

  return {
    date: dateStr,
    amount,
    currency,
    amountInr,
    quote: fact.quote,
    sourceDocName: fact.sourceDocName,
  };
}

function findLowest28DayBalanceForDoc(
  docName: string,
  facts: VerifiedFact[],
  exchangeRates: ExchangeRateConfig
): DailyClosingBalanceEntry | null {
  const candidates: DailyClosingBalanceEntry[] = [];

  for (const f of facts) {
    if (f.sourceDocName !== docName) continue;
    if (f.field === 'daily_closing_balance') {
      const parsed = parseDailyClosingBalanceFact(f, facts, exchangeRates);
      if (parsed) candidates.push(parsed);
    } else if (f.field === 'lowest_balance_28_day') {
      const amount = parseNumericAmount(f.value);
      if (amount === null) continue;
      const currency = findCurrencyForDocument(facts, docName);
      const amountInr = convertToInr(amount, currency, exchangeRates);
      if (amountInr === null) continue;
      const dateFact = facts.find(
        (d) => d.field === 'lowest_balance_28_day_date' && d.sourceDocName === docName
      );
      const dateStr =
        dateFact?.value.trim() ||
        extractDateStringFromText(f.quote) ||
        'unspecified date';
      candidates.push({
        date: dateStr,
        amount,
        currency,
        amountInr,
        quote: f.quote,
        sourceDocName: docName,
      });
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((min, cur) => (cur.amountInr < min.amountInr ? cur : min));
}

export function checkFundsVsRequiredCost(input: FundsCheckInput): CheckFlag {
  const { facts, destinationCountry, ukRegion = 'outside_london', requiredCostOverride, exchangeRates } = input;
  const ukRules = input.ukRules ?? loadUkRules();

  // 1. Sum available funds (bank_balance + loan_amount) in INR using visible dated exchange rates.
  //    For UK: UKVI requires funds to stay at or above the required amount on EVERY day of the 28-day
  //    window, so we check the LOWEST closing balance across the 28 days (not just the final balance).
  const bankDocNames = Array.from(
    new Set(
      facts
        .filter(
          (f) =>
            (f.field === 'bank_balance' ||
              f.field === 'lowest_balance_28_day' ||
              f.field === 'daily_closing_balance') &&
            f.value.trim().length > 0
        )
        .map((f) => f.sourceDocName)
    )
  );
  const loanFacts = facts.filter((f) => f.field === 'loan_amount' && f.value.trim().length > 0);

  let totalAvailableInr = 0;
  let finalBalanceTotalInr = 0;
  let lowestUkDipEntry: DailyClosingBalanceEntry | null = null;
  const fundQuotes: string[] = [];
  const mathLines: string[] = [];
  let hasAnyFundProof = false;

  for (const docName of bankDocNames) {
    const finalBankFact = facts.find(
      (f) => f.field === 'bank_balance' && f.sourceDocName === docName && f.value.trim().length > 0
    );
    const lowest28Day =
      destinationCountry === 'UK' ? findLowest28DayBalanceForDoc(docName, facts, exchangeRates) : null;

    const currency = findCurrencyForDocument(facts, docName);
    let finalAmtInr: number | null = null;
    if (finalBankFact) {
      const finalAmt = parseNumericAmount(finalBankFact.value);
      if (finalAmt !== null) {
        finalAmtInr = convertToInr(finalAmt, currency, exchangeRates);
        if (finalAmtInr === null) {
          return {
            id: 'funds-missing-rate',
            checkType: 'funds',
            severity: 'amber',
            title: `Exchange rate missing for ${currency}`,
            summary: `Cannot convert ${finalBankFact.value} (${currency}) to INR because no exchange rate is set for ${currency}. Counselor can add a dated rate.`,
            quote: finalBankFact.quote,
            sourceDocName: finalBankFact.sourceDocName,
          };
        }
      }
    }

    if (destinationCountry === 'UK' && lowest28Day) {
      hasAnyFundProof = true;
      // Pick the lower of the 28-day lowest entry and the final closing balance (if both exist)
      const useLowestEntry = finalAmtInr === null || lowest28Day.amountInr <= finalAmtInr;
      const effectiveInr = useLowestEntry ? lowest28Day.amountInr : (finalAmtInr as number);
      totalAvailableInr += effectiveInr;
      finalBalanceTotalInr += finalAmtInr ?? lowest28Day.amountInr;

      if (!lowestUkDipEntry || lowest28Day.amountInr < lowestUkDipEntry.amountInr) {
        lowestUkDipEntry = lowest28Day;
      }

      mathLines.push(
        `Bank lowest 28-day closing balance (${docName}, on ${lowest28Day.date}): ${lowest28Day.currency} ${lowest28Day.amount.toLocaleString('en-US')} = ${formatInr(lowest28Day.amountInr)}`
      );
      if (finalBankFact && finalAmtInr !== null && finalAmtInr !== lowest28Day.amountInr) {
        const finalAmt = parseNumericAmount(finalBankFact.value) ?? 0;
        mathLines.push(
          `Bank final closing balance (${docName}, informational only — UK checks 28-day lowest): ${currency} ${finalAmt.toLocaleString('en-US')} = ${formatInr(finalAmtInr)}`
        );
      }
      fundQuotes.push(`${lowest28Day.sourceDocName}: "${lowest28Day.quote}"`);
    } else if (finalBankFact && finalAmtInr !== null) {
      hasAnyFundProof = true;
      const finalAmt = parseNumericAmount(finalBankFact.value) ?? 0;
      totalAvailableInr += finalAmtInr;
      finalBalanceTotalInr += finalAmtInr;
      mathLines.push(
        `Bank balance (${docName}): ${currency} ${finalAmt.toLocaleString('en-US')} = ${formatInr(finalAmtInr)}`
      );
      fundQuotes.push(`${finalBankFact.sourceDocName}: "${finalBankFact.quote}"`);
    }
  }

  for (const fact of loanFacts) {
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
    hasAnyFundProof = true;
    totalAvailableInr += inr;
    finalBalanceTotalInr += inr;
    mathLines.push(
      `Education loan (${fact.sourceDocName}): ${currency} ${amount.toLocaleString('en-US')} = ${formatInr(inr)}`
    );
    fundQuotes.push(`${fact.sourceDocName}: "${fact.quote}"`);
  }

  if (hasAnyFundProof) {
    mathLines.push(
      lowestUkDipEntry
        ? `Total available funds (using 28-day lowest closing balance): ${formatInr(totalAvailableInr)}`
        : `Total available funds: ${formatInr(totalAvailableInr)}`
    );
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

  if (!hasAnyFundProof) {
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

    if (destinationCountry === 'UK' && lowestUkDipEntry) {
      const dippedDespiteFinalOk = finalBalanceTotalInr >= requiredInr;
      return {
        id: dippedDespiteFinalOk ? 'funds-uk-28-day-dip' : 'funds-shortfall',
        checkType: 'funds',
        severity: 'red',
        title: dippedDespiteFinalOk
          ? `UK 28-day balance dipped below required funds on ${lowestUkDipEntry.date}`
          : `Funds are short of required cost (lowest 28-day balance on ${lowestUkDipEntry.date})`,
        summary: dippedDespiteFinalOk
          ? `On ${lowestUkDipEntry.date}, your closing balance dipped to ${formatInr(lowestUkDipEntry.amountInr)} (lowest across the 28-day window), putting available funds (${formatInr(totalAvailableInr)}) short by ${formatInr(shortfall)} of ${requiredSourceSummary} (${formatInr(requiredInr)}) even though the final balance recovered to ${formatInr(finalBalanceTotalInr)}.`
          : `Lowest 28-day closing balance on ${lowestUkDipEntry.date} (${formatInr(lowestUkDipEntry.amountInr)}) leaves available funds (${formatInr(totalAvailableInr)}) short by ${formatInr(shortfall)} compared to ${requiredSourceSummary} (${formatInr(requiredInr)}) using rates as of ${exchangeRates.asOfDate}.`,
        quote: `${lowestUkDipEntry.sourceDocName}: "${lowestUkDipEntry.quote}"${requiredQuotes.length > 0 ? ` | ${requiredQuotes.join(' | ')}` : ''}`,
        sourceDocName: lowestUkDipEntry.sourceDocName,
        sourceUrl: ukRules.bankStatement.sourceUrl,
        ruleAsOf: ukRules.asOf,
        mathLines,
      };
    }

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

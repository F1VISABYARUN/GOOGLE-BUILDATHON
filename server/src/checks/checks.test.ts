import { describe, expect, it } from 'vitest';
import { isQuoteFoundInFullText, validateFactQuote } from './quoteValidation.js';
import { maskAadhaarAndPanInText, maskFactIfSensitive, maskIdentifier } from './masking.js';
import { createIpRateLimiter } from '../middleware/rateLimit.js';
import { checkNameConsistency, doNamesMatch } from './nameMatch.js';
import {
  checkDocumentDates,
  checkFundsVsRequiredCost,
  checkGpaAndBacklogs,
  convertGpaTo4Scale,
} from './moneyAndDates.js';
import { loadUkRules } from './rulesLoader.js';
import type { ExchangeRateConfig, VerifiedFact } from '../schemas/case.js';

const SAMPLE_RATES: ExchangeRateConfig = {
  asOfDate: '2026-11-20',
  sourceNote: 'Test exchange rates',
  ratesToInr: {
    INR: 1,
    USD: 96,
    GBP: 120,
    EUR: 102,
    CAD: 68,
    AUD: 62,
  },
};

function makeFact(overrides: Partial<VerifiedFact>): VerifiedFact {
  return {
    field: 'name',
    value: 'Arun Reddy',
    quote: 'Student Name: Arun Reddy',
    page: 1,
    confidence: 0.95,
    sourceDocName: 'marksheet.pdf',
    sourceDocType: 'marksheet_transcript',
    quoteVerified: true,
    needsReview: false,
    ...overrides,
  };
}

describe('quoteValidation', () => {
  it('matches quotes ignoring whitespace and case', () => {
    const fullText = 'UNIVERSITY TRANSCRIPT\n  Student Name:   ARUN   REDDY \n CGPA: 8.6 / 10';
    expect(isQuoteFoundInFullText('student name: arun reddy', fullText)).toBe(true);
  });

  it('marks fact as needsReview when quote is not found in fullText', () => {
    const verified = validateFactQuote(
      {
        field: 'cgpa',
        value: '9.5',
        quote: 'CGPA: 9.5 / 10',
        page: 1,
        confidence: 0.92,
      },
      'UNIVERSITY TRANSCRIPT\nCGPA: 8.1 / 10',
      'marksheet.pdf',
      'marksheet_transcript'
    );
    expect(verified.quoteVerified).toBe(false);
    expect(verified.needsReview).toBe(true);
  });
});

describe('masking', () => {
  it('masks passport and account numbers to last 4 digits only', () => {
    expect(maskIdentifier('Z4829103')).toBe('****9103');
    const masked = maskFactIfSensitive(
      makeFact({
        field: 'passport_number',
        value: 'Z4829103',
        quote: 'Passport No: Z4829103',
      })
    );
    expect(masked.value).toBe('****9103');
    expect(masked.quote).toBe('Passport No: ****9103');
  });

  it('masks Aadhaar and PAN numbers in both dedicated facts and any embedded quote', () => {
    const aadhaarFact = maskFactIfSensitive(
      makeFact({
        field: 'aadhaar_number',
        value: '2345 6789 0123',
        quote: 'UIDAI Aadhaar: 2345 6789 0123',
      })
    );
    expect(aadhaarFact.value).toBe('********0123');
    expect(aadhaarFact.quote).toBe('UIDAI Aadhaar: ********0123');

    const panFact = maskFactIfSensitive(
      makeFact({
        field: 'pan_number',
        value: 'ABCDE1234F',
        quote: 'PAN Card: ABCDE1234F',
      })
    );
    expect(panFact.value).toBe('******234F');
    expect(panFact.quote).toBe('PAN Card: ******234F');

    // Also catches Aadhaar/PAN embedded inside a non-sensitive fact's quote
    const embedded = maskFactIfSensitive(
      makeFact({
        field: 'sponsor',
        value: 'Ramesh Reddy (PAN ABCDE1234F)',
        quote: 'Sponsor: Ramesh Reddy, PAN ABCDE1234F, Aadhaar 987654321098',
      })
    );
    expect(embedded.value).toBe('Ramesh Reddy (PAN ******234F)');
    expect(embedded.quote).toBe('Sponsor: Ramesh Reddy, PAN ******234F, Aadhaar ********1098');
    expect(maskAadhaarAndPanInText('Aadhaar 2345-6789-0123')).toBe('Aadhaar ********0123');
  });
});

describe('nameMatch', () => {
  it('matches names ignoring case, word order, spaces, and initials', () => {
    expect(doNamesMatch('Arun Reddy', 'REDDY,   ARUN')).toBe(true);
    expect(doNamesMatch('Arun Kumar Reddy', 'A. K. Reddy')).toBe(true);
    expect(doNamesMatch('Arun Reddy', 'A Reddy')).toBe(true);
  });

  it('flags genuinely different names as red', () => {
    expect(doNamesMatch('Arun Reddy', 'Rohan Sharma')).toBe(false);
    expect(doNamesMatch('Arun Kumar', 'Arun Reddy')).toBe(false);

    const flag = checkNameConsistency([
      makeFact({ field: 'name', value: 'Arun Reddy', sourceDocName: 'passport.pdf' }),
      makeFact({ field: 'name', value: 'Arun Sharma', sourceDocName: 'bank.pdf' }),
    ]);
    expect(flag.severity).toBe('red');
  });
});

describe('money maths & UK rules', () => {
  it('loads UK maintenance rules (£1,570 London / £1,203 outside London)', () => {
    const uk = loadUkRules();
    expect(uk.maintenance.londonPerMonth).toBe(1570);
    expect(uk.maintenance.outsideLondonPerMonth).toBe(1203);
    expect(uk.maintenance.maxMonths).toBe(9);
    expect(uk.bankStatement.minConsecutiveDaysHeld).toBe(28);
  });

  it('flags red when student funds fall short of UK London maintenance requirement', () => {
    // London 9 months = 1570 * 9 = GBP 14,130 -> at 120 INR/GBP = INR 16,95,600
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'bank_balance',
          value: '1200000',
          quote: 'Closing Balance: INR 12,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'currency',
          value: 'INR',
          quote: 'Currency: INR',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'london',
      exchangeRates: SAMPLE_RATES,
    });
    expect(flag.severity).toBe('red');
    expect(flag.summary).toContain('short');
  });

  it('flags green when bank + loan covers UK unpaid tuition (tuition minus deposit) plus outside-London living costs', () => {
    // CAS tuition GBP 18,000 - deposit GBP 4,000 = unpaid GBP 14,000
    // Outside London living = GBP 1,203 * 9 = GBP 10,827
    // Total required = GBP 24,827 * 120 = INR 29,79,240
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'tuition',
          value: '18000',
          quote: 'Total Tuition Fee: GBP 18,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'deposit_paid',
          value: '4000',
          quote: 'Tuition Deposit Paid: GBP 4,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'currency',
          value: 'GBP',
          quote: 'Currency: GBP',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'bank_balance',
          value: '1000000',
          quote: 'Balance: INR 10,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'loan_amount',
          value: '2200000',
          quote: 'Sanctioned Loan: INR 22,00,000',
          sourceDocName: 'loan.pdf',
          sourceDocType: 'loan_letter',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'outside_london',
      exchangeRates: SAMPLE_RATES,
    });
    expect(flag.severity).toBe('green');
    expect(flag.mathLines?.some((l) => l.includes('Unpaid tuition GBP 14,000'))).toBe(true);
    expect(flag.mathLines?.some((l) => l.includes('GBP 10,827'))).toBe(true);
  });

  it('flags red when bank + loan covers London living costs but falls short once unpaid CAS tuition is added', () => {
    // CAS tuition GBP 20,000 - deposit GBP 5,000 = unpaid GBP 15,000
    // London living = GBP 1,570 * 9 = GBP 14,130
    // Total required = GBP 29,130 * 120 = INR 34,95,600
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'tuition',
          value: '20000',
          quote: 'Course Fee: GBP 20,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'deposit_paid',
          value: '5000',
          quote: 'Fee Paid: GBP 5,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'currency',
          value: 'GBP',
          quote: 'GBP',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'bank_balance',
          value: '2000000',
          quote: 'Balance: INR 20,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'london',
      exchangeRates: SAMPLE_RATES,
    });
    expect(flag.severity).toBe('red');
    expect(flag.mathLines?.some((l) => l.includes('Unpaid tuition GBP 15,000'))).toBe(true);
    expect(flag.mathLines?.some((l) => l.includes('GBP 14,130'))).toBe(true);
  });

  it('flags amber when UK living costs are met but CAS tuition was not uploaded', () => {
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'bank_balance',
          value: '2000000',
          quote: 'Balance: INR 20,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'outside_london',
      exchangeRates: SAMPLE_RATES,
    });
    expect(flag.severity).toBe('amber');
    expect(flag.id).toBe('funds-missing-cas-tuition');
  });

  it('flags red with date and verbatim quote when UK 28-day lowest closing balance dips below required funds even if final balance recovers', () => {
    // CAS tuition GBP 18,000 - deposit GBP 4,000 = unpaid GBP 14,000
    // Outside London living = GBP 1,203 * 9 = GBP 10,827
    // Total required = GBP 24,827 * 120 = INR 29,79,240
    // Final balance is INR 32,00,000 (ABOVE required), but on 2026-11-04 it dipped to INR 26,00,000!
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'tuition',
          value: '18000',
          quote: 'Total Tuition Fee: GBP 18,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'deposit_paid',
          value: '4000',
          quote: 'Tuition Deposit Paid: GBP 4,000',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'currency',
          value: 'GBP',
          quote: 'Currency: GBP',
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
        }),
        makeFact({
          field: 'bank_balance',
          value: '3200000',
          quote: '18/11/2026 Final Closing Balance: INR 32,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'daily_closing_balance',
          value: '2026-10-22: 3150000',
          quote: '22/10/2026 Closing Balance: INR 31,50,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'daily_closing_balance',
          value: '2026-11-04: 2600000',
          quote: '04/11/2026 Closing Balance: INR 26,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'daily_closing_balance',
          value: '2026-11-18: 3200000',
          quote: '18/11/2026 Final Closing Balance: INR 32,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'currency',
          value: 'INR',
          quote: 'Currency: INR',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'outside_london',
      exchangeRates: SAMPLE_RATES,
    });

    expect(flag.severity).toBe('red');
    expect(flag.id).toBe('funds-uk-28-day-dip');
    expect(flag.title).toContain('2026-11-04');
    expect(flag.summary).toContain('2026-11-04');
    expect(flag.summary).toContain('26,00,000');
    expect(flag.quote).toContain('04/11/2026 Closing Balance: INR 26,00,000');
    expect(flag.mathLines?.some((l) => l.includes('lowest 28-day closing balance') && l.includes('2026-11-04'))).toBe(true);
  });
});

describe('document dates & UK 28-day rule', () => {
  it('flags red when statement is older than 31 days or held under 28 days for UK', () => {
    const flags = checkDocumentDates(
      [
        makeFact({
          field: 'statement_start_date',
          value: '2026-09-10',
          quote: 'From: 10/09/2026',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'statement_end_date',
          value: '2026-09-25',
          quote: 'To: 25/09/2026',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
      ],
      'UK',
      new Date('2026-11-20T00:00:00Z')
    );

    const dateFlag = flags.find((f) => f.checkType === 'document_date');
    const rule28Flag = flags.find((f) => f.checkType === 'uk_28_day');
    expect(dateFlag?.severity).toBe('red');
    expect(rule28Flag?.severity).toBe('red');
  });
});

describe('GPA & backlogs', () => {
  it('converts 10-point CGPA to 4.0 scale and flags high backlogs', () => {
    expect(convertGpaTo4Scale(8.5, 10)).toBe(3.4);
    const flags = checkGpaAndBacklogs([
      makeFact({ field: 'cgpa', value: '8.5', quote: 'CGPA: 8.5' }),
      makeFact({ field: 'cgpa_scale', value: '10', quote: 'Scale: 10' }),
      makeFact({ field: 'backlogs', value: '5', quote: 'Total Backlogs: 5' }),
    ]);
    expect(flags.find((f) => f.id === 'gpa-check')?.severity).toBe('green');
    expect(flags.find((f) => f.id === 'backlogs-high')?.severity).toBe('red');
  });
});

describe('per-IP rate limiter', () => {
  it('allows up to 10 requests per hour per IP and blocks the 11th', () => {
    const limiter = createIpRateLimiter({ maxRequests: 10, windowMs: 3600_000 });
    const start = 1_700_000_000_000;
    for (let i = 0; i < 10; i++) {
      expect(limiter.checkAndRecord('203.0.113.5', start + i * 1000).allowed).toBe(true);
    }
    const eleventh = limiter.checkAndRecord('203.0.113.5', start + 20_000);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.retryAfterSeconds).toBeGreaterThan(0);

    // Different IP is still allowed
    expect(limiter.checkAndRecord('203.0.113.6', start + 20_000).allowed).toBe(true);

    // Original IP is allowed again after 1 hour
    expect(limiter.checkAndRecord('203.0.113.5', start + 3600_001).allowed).toBe(true);
  });
});

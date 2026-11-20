import { describe, expect, it } from 'vitest';
import { isQuoteFoundInFullText, validateFactQuote } from './quoteValidation.js';
import { maskFactIfSensitive, maskIdentifier } from './masking.js';
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

  it('flags green when bank + loan covers UK outside-London maintenance', () => {
    // Outside London 9 months = 1203 * 9 = GBP 10,827 -> at 120 = INR 12,99,240
    const flag = checkFundsVsRequiredCost({
      facts: [
        makeFact({
          field: 'bank_balance',
          value: '500000',
          quote: 'Balance: INR 5,00,000',
          sourceDocName: 'bank.pdf',
          sourceDocType: 'bank_statement',
        }),
        makeFact({
          field: 'loan_amount',
          value: '1000000',
          quote: 'Sanctioned Loan: INR 10,00,000',
          sourceDocName: 'loan.pdf',
          sourceDocType: 'loan_letter',
        }),
      ],
      destinationCountry: 'UK',
      ukRegion: 'outside_london',
      exchangeRates: SAMPLE_RATES,
    });
    expect(flag.severity).toBe('green');
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

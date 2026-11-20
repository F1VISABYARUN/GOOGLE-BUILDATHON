import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { createApp } from './app.js';
import { evaluateExceptionRouting } from './checks/exceptionRouting.js';
import { clampRiskAssessment } from './services/documentPipeline.js';
import { createMultiWindowRateLimiter } from './middleware/rateLimit.js';
import {
  createApprovalToken,
  deleteCaseAndData,
  getCaseRecord,
  saveCaseRecord,
  verifyAndConsumeApprovalToken,
} from './services/firestoreStore.js';
import type { CaseRecord, CheckFlag, VerifiedFact } from './schemas/case.js';

function makeFact(overrides: Partial<VerifiedFact> = {}): VerifiedFact {
  return {
    field: 'name',
    value: 'Arun Reddy',
    quote: 'Student Name: Arun Reddy',
    page: 1,
    confidence: 0.96,
    sourceDocName: 'marksheet.pdf',
    sourceDocType: 'marksheet_transcript',
    quoteVerified: true,
    needsReview: false,
    ...overrides,
  };
}

function makeFlag(overrides: Partial<CheckFlag> = {}): CheckFlag {
  return {
    id: 'name-match-ok',
    checkType: 'name_match',
    severity: 'green',
    title: 'Names match',
    summary: 'All names match.',
    quote: 'Student Name: Arun Reddy',
    ...overrides,
  };
}

describe('exceptionRouting (Phase 3)', () => {
  it('pre-approves clean green cases for batch approval', () => {
    const result = evaluateExceptionRouting({
      flags: [makeFlag({ severity: 'green' })],
      facts: [makeFact({ quoteVerified: true, confidence: 0.95 })],
    });
    expect(result.queueBucket).toBe('green_batch');
    expect(result.preApprovedByRules).toBe(true);
    expect(result.exceptionReasons).toHaveLength(0);
  });

  it('routes cases to counselor exceptions for any red flag, unverified quote, low confidence, declaration, fee, or safety confirmation', () => {
    const result = evaluateExceptionRouting({
      flags: [makeFlag({ severity: 'red', title: 'Funds are short' })],
      facts: [
        makeFact({ field: 'cgpa', quoteVerified: false, confidence: 0.9 }),
        makeFact({ field: 'bank_balance', quoteVerified: true, confidence: 0.55 }),
      ],
      unsupportedFreeTextFields: ['statement_of_purpose_summary'],
      hasDeclarationOrLegalStatement: true,
      hasFeePayment: true,
      hasSafetyConfirmation: true,
    });

    expect(result.queueBucket).toBe('exceptions');
    expect(result.preApprovedByRules).toBe(false);
    expect(result.exceptionReasons.length).toBe(7);
  });
});

describe('clampRiskAssessment', () => {
  it('keeps red-flag cases high risk and clean green cases low risk', () => {
    const high = clampRiskAssessment(
      { score: 20, level: 'low', brief: 'Short brief.' },
      [makeFlag({ severity: 'red' })],
      ['Red flag: Funds short'],
      'gemini-4-carbon'
    );
    expect(high.score).toBeGreaterThanOrEqual(75);
    expect(high.level).toBe('high');

    const low = clampRiskAssessment(
      { score: 80, level: 'high', brief: 'Clean case.' },
      [makeFlag({ severity: 'green' })],
      [],
      'gemini-4-carbon'
    );
    expect(low.score).toBeLessThanOrEqual(25);
    expect(low.level).toBe('low');
  });
});

describe('multi-window rate limiter (30/hr, 200/day, 10/hr per IP)', () => {
  it('enforces 10/hr per IP, 30/hr global, and 200/day global caps', () => {
    const limiter = createMultiWindowRateLimiter({
      maxPerIpPerHour: 10,
      maxPerHour: 30,
      maxPerDay: 200,
    });
    const t0 = 1_700_000_000_000;

    // 3 different IPs each sending 10 requests = 30 global requests in 1 hour
    for (let ipIdx = 1; ipIdx <= 3; ipIdx++) {
      for (let i = 0; i < 10; i++) {
        const res = limiter.checkAndRecord(`10.0.0.${ipIdx}`, t0 + ipIdx * 1000 + i);
        expect(res.allowed).toBe(true);
      }
    }

    // 31st request from a 4th IP in the same hour hits global 30/hr cap
    const blockedHour = limiter.checkAndRecord('10.0.0.4', t0 + 50_000);
    expect(blockedHour.allowed).toBe(false);
    expect(blockedHour.limitType).toBe('global_hour');

    // Simulate 7 distinct hours totaling 200 runs (30*6 + 20 = 200)
    const dailyLimiter = createMultiWindowRateLimiter({
      maxPerIpPerHour: 100,
      maxPerHour: 100,
      maxPerDay: 200,
    });
    for (let i = 0; i < 200; i++) {
      const hourOffset = Math.floor(i / 50) * 3_700_000;
      const res = dailyLimiter.checkAndRecord(`192.0.2.${i % 10}`, t0 + hourOffset + i);
      expect(res.allowed).toBe(true);
    }
    const blockedDay = dailyLimiter.checkAndRecord('192.0.2.99', t0 + 5 * 3_700_000);
    expect(blockedDay.allowed).toBe(false);
    expect(blockedDay.limitType).toBe('global_day');
  });
});

describe('counselor queue direct access (no passcode, approver name required)', () => {
  it('opens /api/counselor/queue directly without a passcode and requires approver name on approve', async () => {
    const app = createApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const queueRes = await fetch(`${baseUrl}/api/counselor/queue`);
      expect(queueRes.status).toBe(200);

      const badApprove = await fetch(`${baseUrl}/api/counselor/cases/case_missing/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselorName: '' }),
      });
      expect(badApprove.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('single-use approval token lifecycle', () => {
  it('allows one consumption for matching caseId and portalUrl, then rejects replay', async () => {
    const tokenRecord = await createApprovalToken({
      caseId: 'case_test_123',
      portalUrl: 'https://apply.example.edu/portal',
      approvedBy: 'Counselor Priya',
    });

    // Wrong portal URL fails
    const wrongPortal = await verifyAndConsumeApprovalToken({
      token: tokenRecord.token,
      caseId: 'case_test_123',
      portalUrl: 'https://other.example.edu/portal',
    });
    expect(wrongPortal.valid).toBe(false);

    // Correct caseId + portalUrl succeeds once
    const firstUse = await verifyAndConsumeApprovalToken({
      token: tokenRecord.token,
      caseId: 'case_test_123',
      portalUrl: 'https://apply.example.edu/portal',
    });
    expect(firstUse.valid).toBe(true);
    expect(firstUse.record?.approvedBy).toBe('Counselor Priya');
    expect(firstUse.record?.used).toBe(true);

    // Replay attempt is rejected (single-use)
    const replay = await verifyAndConsumeApprovalToken({
      token: tokenRecord.token,
      caseId: 'case_test_123',
      portalUrl: 'https://apply.example.edu/portal',
    });
    expect(replay.valid).toBe(false);
  });

  it('deletes case, facts, and tokens on Delete My Data', async () => {
    const sampleCase: CaseRecord = {
      id: 'case_delete_me',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ready_for_batch_approval',
      queueBucket: 'green_batch',
      exceptionReasons: [],
      riskScore: { score: 10, level: 'low', brief: 'Clean case.', modelUsed: 'gemini-4-carbon' },
      destinationCountry: 'UK',
      exchangeRates: { asOfDate: '2026-11-20', sourceNote: 'test', ratesToInr: { INR: 1, GBP: 120 } },
      consent: {
        acceptedStorageNotice: true,
        acceptedImmediateDeletion: true,
        acceptedDeleteRight: true,
        isUnder18: false,
        parentalConsentConfirmed: false,
        authorisationAccepted: true,
        typedSignature: 'Test Student',
        signedAt: new Date().toISOString(),
      },
      documents: [],
      facts: [makeFact()],
      flags: [makeFlag()],
      statusTimeline: [],
      auditLog: [],
      storageBackend: 'memory_fallback',
    };

    await saveCaseRecord(sampleCase);
    const tok = await createApprovalToken({
      caseId: sampleCase.id,
      portalUrl: '/portal',
      approvedBy: 'Counselor A',
    });
    expect(await getCaseRecord(sampleCase.id)).not.toBeNull();

    const del = await deleteCaseAndData(sampleCase.id);
    expect(del.deleted).toBe(true);
    expect(await getCaseRecord(sampleCase.id)).toBeNull();

    // Token tied to deleted case must also be gone
    const tokenCheck = await verifyAndConsumeApprovalToken({
      token: tok.token,
      caseId: sampleCase.id,
      portalUrl: '/portal',
    });
    expect(tokenCheck.valid).toBe(false);
  });
});

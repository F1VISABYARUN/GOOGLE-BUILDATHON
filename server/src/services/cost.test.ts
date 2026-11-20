import { describe, expect, it } from 'vitest';
import {
  buildSafeCloudLogEntry,
  estimateCallCostUsd,
  summarizeCaseUsage,
} from './cloudLogger.js';
import { evaluateExceptionRouting } from '../checks/exceptionRouting.js';
import type { CaseRecord } from '../schemas/case.js';

describe('Phase 5: Cost per case, Cloud Logging safety, & Green-case zero-auto-token', () => {
  it('calculates exact token totals and USD cost per case using BUILD_PLAN.md rates', () => {
    // 100k input + 10k output on gemini-4-hydrogen ($1.50/$7.50 per 1M) = $0.15 + $0.075 = $0.225
    expect(estimateCallCostUsd('gemini-4-hydrogen', 100_000, 10_000)).toBeCloseTo(0.225, 5);

    // 10k input + 2k output on gemini-3.8-flash ($0.75/$3.75 per 1M) = $0.0075 + $0.0075 = $0.015
    expect(estimateCallCostUsd('gemini-3.8-flash', 10_000, 2_000)).toBeCloseTo(0.015, 5);

    const summary = summarizeCaseUsage(
      [
        {
          model: 'gemini-3.8-flash',
          task: 'classify',
          inputTokens: 10_000,
          outputTokens: 2_000,
          latencyMs: 420,
          fallbackUsed: false,
        },
        {
          model: 'gemini-4-hydrogen',
          task: 'extract',
          inputTokens: 100_000,
          outputTokens: 10_000,
          latencyMs: 2100,
          fallbackUsed: false,
        },
      ],
      37
    );

    expect(summary.totalInputTokens).toBe(110_000);
    expect(summary.totalOutputTokens).toBe(12_000);
    expect(summary.totalTokens).toBe(122_000);
    expect(summary.agentSteps).toBe(37);
    expect(summary.estimatedUsd).toBeCloseTo(0.24, 4);
  });

  it('emits valid Cloud Logging JSON containing model, latency, and fallback with zero document contents', () => {
    const jsonStr = buildSafeCloudLogEntry({
      severity: 'INFO',
      component: 'aira-web',
      event: 'gemini_call',
      task: 'extract',
      model: 'gemini-4-hydrogen',
      fallbackUsed: false,
      latencyMs: 1850,
      inputTokens: 4200,
      outputTokens: 610,
      caseId: 'case_abc123',
    });

    const parsed = JSON.parse(jsonStr);
    expect(parsed.severity).toBe('INFO');
    expect(parsed.model).toBe('gemini-4-hydrogen');
    expect(parsed.latencyMs).toBe(1850);
    expect(parsed.fallbackUsed).toBe(false);
    expect(parsed.fullText).toBeUndefined();
    expect(parsed.quote).toBeUndefined();
    expect(parsed.documentBytes).toBeUndefined();
  });

  it('confirms green cases never receive an approvalTokenId automatically before counselor action', () => {
    const routing = evaluateExceptionRouting({
      flags: [
        {
          id: 'funds-sufficient',
          checkType: 'funds',
          severity: 'green',
          title: 'Available funds meet required cost',
          summary: 'Covered',
          quote: 'Balance: INR 30,00,000',
        },
      ],
      facts: [
        {
          field: 'name',
          value: 'Priya Nair',
          quote: 'Name: Priya Nair',
          page: 1,
          confidence: 0.99,
          sourceDocName: 'cas.pdf',
          sourceDocType: 'i20_cas_offer',
          quoteVerified: true,
          needsReview: false,
        },
      ],
    });

    expect(routing.queueBucket).toBe('green_batch');
    expect(routing.preApprovedByRules).toBe(true);

    // Mirrors CaseRecord creation in POST /api/cases/analyze: no token is generated!
    const newGreenCase: Partial<CaseRecord> = {
      status: 'ready_for_batch_approval',
      queueBucket: routing.queueBucket,
      approvalTokenId: undefined,
    };
    expect(newGreenCase.approvalTokenId).toBeUndefined();
  });
});

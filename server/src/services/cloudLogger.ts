export interface ModelUsageEntry {
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  fallbackUsed: boolean;
}

export interface CaseUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  agentSteps: number;
  estimatedUsd: number;
  calls: ModelUsageEntry[];
}

/**
 * Per-1M token pricing (USD) from BUILD_PLAN.md Section 4.2.
 */
const MODEL_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gemini-4-hydrogen': { input: 1.5, output: 7.5 },
  'gemini-4-carbon': { input: 2.0, output: 10.0 },
  'gemini-4-argon': { input: 2.0, output: 10.0 },
  'gemini-4-neon': { input: 3.0, output: 15.0 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

export function estimateCallCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = MODEL_PRICING_PER_MILLION[model] ?? { input: 2.0, output: 10.0 };
  const cost = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function summarizeCaseUsage(
  calls: ModelUsageEntry[],
  agentSteps = 0
): CaseUsageSummary {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedUsd = 0;

  for (const c of calls) {
    totalInputTokens += Math.max(0, c.inputTokens || 0);
    totalOutputTokens += Math.max(0, c.outputTokens || 0);
    estimatedUsd += estimateCallCostUsd(c.model, c.inputTokens || 0, c.outputTokens || 0);
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    agentSteps,
    estimatedUsd: Math.round(estimatedUsd * 100_000) / 100_000,
    calls,
  };
}

export interface StructuredGeminiLog {
  severity: 'INFO' | 'WARNING' | 'ERROR';
  component: 'aira-web' | 'aira-agent';
  event: 'gemini_call';
  task: string;
  model: string;
  fallbackUsed: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  caseId?: string;
  errorCode?: string;
}

/**
 * Formats a Cloud Logging JSON line strictly WITHOUT any document text, quotes, or secrets.
 */
export function buildSafeCloudLogEntry(entry: StructuredGeminiLog): string {
  const safePayload = {
    severity: entry.severity,
    message: `[gemini] task=${entry.task} model=${entry.model} fallback=${entry.fallbackUsed} latencyMs=${entry.latencyMs}`,
    component: entry.component,
    event: entry.event,
    task: entry.task,
    model: entry.model,
    fallbackUsed: entry.fallbackUsed,
    latencyMs: entry.latencyMs,
    inputTokens: entry.inputTokens ?? 0,
    outputTokens: entry.outputTokens ?? 0,
    caseId: entry.caseId,
    errorCode: entry.errorCode,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(safePayload);
}

export function logGeminiCall(entry: StructuredGeminiLog): void {
  const line = buildSafeCloudLogEntry(entry);
  if (entry.severity === 'ERROR') {
    console.error(line);
  } else if (entry.severity === 'WARNING') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'marksheet_transcript',
  'degree_certificate',
  'passport',
  'bank_statement',
  'loan_letter',
  'i20_cas_offer',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const FACT_FIELDS = [
  'name',
  'date_of_birth',
  'passport_number',
  'account_number',
  'aadhaar_number',
  'pan_number',
  'degree',
  'university',
  'cgpa',
  'cgpa_scale',
  'backlogs',
  'graduation_date',
  'bank_balance',
  'lowest_balance_28_day',
  'lowest_balance_28_day_date',
  'daily_closing_balance',
  'currency',
  'statement_date',
  'statement_start_date',
  'statement_end_date',
  'loan_amount',
  'sponsor',
  'course',
  'institution',
  'tuition',
  'deposit_paid',
  'living_cost',
  'start_date',
] as const;

export type FactField = (typeof FACT_FIELDS)[number];

export const RawExtractedFactSchema = z.object({
  field: z.enum(FACT_FIELDS),
  value: z.string(),
  quote: z.string(),
  page: z.number().int().min(1).default(1),
  confidence: z.number().min(0).max(1),
});

export const DocumentExtractionSchema = z.object({
  fullText: z.string(),
  facts: z.array(RawExtractedFactSchema),
});

export type RawExtractedFact = z.infer<typeof RawExtractedFactSchema>;
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

export interface VerifiedFact extends RawExtractedFact {
  sourceDocName: string;
  sourceDocType: DocumentType;
  quoteVerified: boolean;
  needsReview: boolean;
}

export const ConsentSchema = z.object({
  acceptedStorageNotice: z.literal(true),
  acceptedImmediateDeletion: z.literal(true),
  acceptedDeleteRight: z.literal(true),
  isUnder18: z.boolean().default(false),
  parentalConsentConfirmed: z.boolean().default(false),
  authorisationAccepted: z.literal(true),
  typedSignature: z.string().trim().min(2, 'Please type your full legal name to sign.'),
  signedAt: z.string().min(1),
}).refine(
  (data) => !data.isUnder18 || data.parentalConsentConfirmed,
  {
    message: 'Parental or guardian consent is required for students under 18.',
    path: ['parentalConsentConfirmed'],
  }
);

export type ConsentRecord = z.infer<typeof ConsentSchema>;

export const ExchangeRateConfigSchema = z.object({
  asOfDate: z.string().min(1),
  sourceNote: z.string().min(1),
  ratesToInr: z.record(z.string(), z.number().positive()),
});

export type ExchangeRateConfig = z.infer<typeof ExchangeRateConfigSchema>;

export type FlagSeverity = 'red' | 'amber' | 'green';

export interface CheckFlag {
  id: string;
  checkType: 'funds' | 'name_match' | 'gpa_backlogs' | 'document_date' | 'uk_28_day' | 'quote_review';
  severity: FlagSeverity;
  title: string;
  summary: string;
  quote: string;
  sourceDocName?: string;
  sourceUrl?: string;
  ruleAsOf?: string;
  mathLines?: string[];
  explanation?: string;
  suggestedFix?: string;
}

export interface StatusStep {
  step: string;
  status: 'done' | 'current' | 'pending';
  at?: string;
}

export interface CaseDocumentSummary {
  fileName: string;
  mimeType: string;
  documentType: DocumentType;
}

export interface RiskAssessment {
  score: number; // 0 to 100
  level: 'high' | 'medium' | 'low';
  brief: string;
  modelUsed: string;
}

export interface CaseUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  agentSteps: number;
  estimatedUsd: number;
  calls: Array<{
    model: string;
    task: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    fallbackUsed: boolean;
  }>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action:
    | 'case_created'
    | 'case_approved'
    | 'case_batch_approved'
    | 'case_edited'
    | 'case_rejected'
    | 'settings_updated'
    | 'delete_my_data'
    | 'token_created'
    | 'token_consumed';
  caseId?: string;
  details: string;
}

export interface ApprovalTokenRecord {
  token: string;
  caseId: string;
  portalUrl: string;
  approvedBy: string;
  approvedAt: string;
  used: boolean;
  usedAt?: string;
  revoked?: boolean;
}

export interface CounselorSettings {
  ukRules: {
    country: 'UK';
    asOf: string;
    sourceUrl: string;
    maintenance: {
      currency: 'GBP';
      londonPerMonth: number;
      outsideLondonPerMonth: number;
      maxMonths: number;
      note: string;
    };
    bankStatement: {
      minConsecutiveDaysHeld: number;
      maxAgeDays: number;
      sourceUrl: string;
      note: string;
    };
  };
  exchangeRates: ExchangeRateConfig;
  updatedAt: string;
  updatedBy: string;
}

export interface CaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'needs_counselor_review' | 'ready_for_batch_approval' | 'approved' | 'rejected';
  queueBucket: 'exceptions' | 'green_batch';
  exceptionReasons: string[];
  riskScore: RiskAssessment;
  destinationCountry: 'UK' | 'US' | 'Canada' | 'Australia' | 'Germany' | 'Other';
  ukRegion?: 'london' | 'outside_london';
  targetPortalUrl?: string;
  requiredCostOverride?: { amount: number; currency: string } | null;
  exchangeRates: ExchangeRateConfig;
  consent: ConsentRecord;
  documents: CaseDocumentSummary[];
  facts: VerifiedFact[];
  flags: CheckFlag[];
  statusTimeline: StatusStep[];
  auditLog: AuditLogEntry[];
  counselorNotes?: string;
  approvalTokenId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  usageSummary?: CaseUsageSummary;
  storageBackend: 'firestore' | 'memory_fallback';
}

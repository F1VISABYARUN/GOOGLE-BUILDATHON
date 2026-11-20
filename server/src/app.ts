import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MODELS } from './config/models.js';
import { generateWithFallback, listAllowedModels } from './gemini.js';
import {
  ConsentSchema,
  ExchangeRateConfigSchema,
  type CaseDocumentSummary,
  type CaseRecord,
  type CounselorSettings,
  type VerifiedFact,
} from './schemas/case.js';
import {
  classifyDocument,
  explainFlagsWithGemini,
  extractDocumentFacts,
  scoreCaseRiskWithGemini,
} from './services/documentPipeline.js';
import { runAllChecks } from './checks/runChecks.js';
import { evaluateExceptionRouting } from './checks/exceptionRouting.js';
import { maskFactIfSensitive } from './checks/masking.js';
import { validateOwnPortalUrl } from './checks/portalUrlGuard.js';
import {
  appendAuditLog,
  createApprovalToken,
  deleteCaseAndData,
  getAgentRun,
  getCaseRecord,
  getCounselorSettings,
  listAgentRunsForCase,
  listAuditLogs,
  listCaseRecords,
  revokeTokensForCase,
  saveAgentRun,
  saveCaseRecord,
  saveCounselorSettings,
} from './services/firestoreStore.js';
import { createMultiWindowRateLimiter } from './middleware/rateLimit.js';
import { createPortalRouter } from './routes/portal.js';
import { fetchUniversityRulesGrounded } from './services/universityRules.js';
import { enqueueAgentRunTask } from './services/cloudTasks.js';
import { summarizeCaseUsage, type ModelUsageEntry } from './services/cloudLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// Phase 3 rate limits: 30 runs/hour, 200 runs/day, plus 10/hour per-IP guard
const analyzeRateLimiter = createMultiWindowRateLimiter({
  maxPerIpPerHour: 10,
  maxPerHour: 30,
  maxPerDay: 200,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type "${file.mimetype}". Upload PDF, JPG, or PNG files only.`
        )
      );
    }
  },
});

const CounselorApproveSchema = z.object({
  counselorName: z.string().trim().min(2, 'Please enter your counselor name.'),
  portalUrl: z.string().trim().min(1).default('/portal'),
  notes: z.string().trim().max(1000).optional(),
});

const CounselorRejectSchema = z.object({
  counselorName: z.string().trim().min(2, 'Please enter your counselor name.'),
  reason: z.string().trim().min(3, 'Please enter a clear reason for rejection.'),
});

const CounselorEditSchema = z.object({
  counselorName: z.string().trim().min(2, 'Please enter your counselor name.'),
  notes: z.string().trim().max(1000).optional(),
  factEdits: z
    .array(
      z.object({
        index: z.number().int().min(0),
        value: z.string(),
        markVerified: z.boolean().optional(),
      })
    )
    .optional(),
  requiredCostOverride: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().min(3).max(5),
    })
    .nullable()
    .optional(),
});

const CounselorBatchApproveSchema = z.object({
  counselorName: z.string().trim().min(2, 'Please enter your counselor name.'),
  portalUrl: z.string().trim().min(1).default('/portal'),
  caseIds: z.array(z.string()).optional(),
});

const CounselorSettingsUpdateSchema = z.object({
  counselorName: z.string().trim().min(2).default('Counselor'),
  ukRules: z.object({
    country: z.literal('UK'),
    asOf: z.string().min(1),
    sourceUrl: z.string().url(),
    maintenance: z.object({
      currency: z.literal('GBP'),
      londonPerMonth: z.number().positive(),
      outsideLondonPerMonth: z.number().positive(),
      maxMonths: z.number().int().min(1).max(12),
      note: z.string().min(1),
    }),
    bankStatement: z.object({
      minConsecutiveDaysHeld: z.number().int().min(1).max(365),
      maxAgeDays: z.number().int().min(1).max(365),
      sourceUrl: z.string().url(),
      note: z.string().min(1),
    }),
  }),
  exchangeRates: ExchangeRateConfigSchema,
});

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/rules/uk', async (_req, res) => {
    try {
      const settings = await getCounselorSettings();
      res.json(settings.ukRules);
    } catch (err) {
      res.status(500).json({
        error: 'Could not load UK rules.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getCounselorSettings();
      res.json(settings);
    } catch (err) {
      res.status(500).json({
        error: 'Could not load rules and exchange rates.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/api/models', async (_req, res) => {
    try {
      const models = await listAllowedModels();
      res.json({ models });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to list Gemini models.';
      const safeMessage = rawMessage.includes('Headers.append')
        ? 'API key format is invalid (check for extra spaces or newlines in Secret Manager).'
        : rawMessage;
      console.error('[api/models] error:', safeMessage);
      res.status(502).json({
        error: 'Could not load Gemini models from Google AI.',
        details: safeMessage,
      });
    }
  });

  app.post('/api/hello', async (_req, res) => {
    try {
      const result = await generateWithFallback({
        primaryModel: MODELS.extraction.primary,
        fallbackModel: MODELS.extraction.fallback,
        prompt:
          'Reply in one short, plain-English sentence confirming that Aira Application Agent is connected to Gemini and ready to verify student documents.',
      });

      res.json({
        model: result.model,
        text: result.text,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Gemini request failed.';
      const safeMessage = rawMessage.includes('Headers.append')
        ? 'API key format is invalid (check for extra spaces or newlines in Secret Manager).'
        : rawMessage;
      console.error('[api/hello] error:', safeMessage);
      res.status(502).json({
        error: 'Could not reach Gemini right now. Please check your API key and billing.',
        details: safeMessage,
      });
    }
  });

  // =========================================================================
  // STUDENT ENDPOINTS: Analyze, Read Case, Delete My Data (DPDP)
  // =========================================================================

  app.post('/api/cases/analyze', analyzeRateLimiter.middleware, (req, res) => {
    upload.array('documents', 5)(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({
          error: uploadErr instanceof Error ? uploadErr.message : 'File upload failed.',
        });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({
          error: 'Please upload at least 1 document (PDF, JPG, or PNG).',
        });
      }

      try {
        const consentRaw = JSON.parse(String(req.body.consent || '{}'));
        const consentParsed = ConsentSchema.safeParse(consentRaw);
        if (!consentParsed.success) {
          return res.status(400).json({
            error:
              'Please complete the consent and one-time authorisation screen before uploading.',
            details: consentParsed.error.issues.map((i) => i.message).join(' '),
          });
        }

        const settings = await getCounselorSettings();
        const exchangeRatesRaw = req.body.exchangeRates
          ? JSON.parse(String(req.body.exchangeRates))
          : settings.exchangeRates;
        const exchangeRatesParsed = ExchangeRateConfigSchema.safeParse(exchangeRatesRaw);
        if (!exchangeRatesParsed.success) {
          return res.status(400).json({
            error: 'Please provide valid, dated exchange rates before checking funds.',
            details: exchangeRatesParsed.error.issues.map((i) => i.message).join(' '),
          });
        }

        const destinationCountry = String(
          req.body.destinationCountry || 'UK'
        ) as CaseRecord['destinationCountry'];
        const ukRegion = req.body.ukRegion === 'london' ? 'london' : 'outside_london';
        const targetPortalUrl = String(req.body.targetPortalUrl || '/portal').trim() || '/portal';

        let requiredCostOverride: { amount: number; currency: string } | null = null;
        if (req.body.requiredCostAmount && Number(req.body.requiredCostAmount) > 0) {
          requiredCostOverride = {
            amount: Number(req.body.requiredCostAmount),
            currency: String(req.body.requiredCostCurrency || 'GBP').toUpperCase(),
          };
        }

        // Process each document strictly from memory buffers
        const documents: CaseDocumentSummary[] = [];
        const allFacts: VerifiedFact[] = [];
        const usageCollector: ModelUsageEntry[] = [];

        for (const file of files) {
          const docType = await classifyDocument(
            file.buffer,
            file.mimetype,
            file.originalname,
            usageCollector
          );
          documents.push({
            fileName: file.originalname,
            mimeType: file.mimetype,
            documentType: docType,
          });

          const { facts } = await extractDocumentFacts(
            file.buffer,
            file.mimetype,
            file.originalname,
            docType,
            usageCollector
          );
          allFacts.push(...facts);

          // Explicitly release buffer reference right after reading
          file.buffer = Buffer.alloc(0);
        }

        // 1. Plain-code checks using current counselor-managed rules
        const rawFlags = runAllChecks({
          facts: allFacts,
          destinationCountry,
          ukRegion,
          requiredCostOverride,
          exchangeRates: exchangeRatesParsed.data,
          ukRules: settings.ukRules,
        });

        // 2. Plain-code exception routing (decides Exceptions vs Green Batch)
        const routing = evaluateExceptionRouting({
          flags: rawFlags,
          facts: allFacts,
        });

        // 3. Plain-English explanations & risk score via gemini-4-carbon (fallback argon)
        const [explainedFlags, riskScore] = await Promise.all([
          explainFlagsWithGemini(rawFlags, usageCollector),
          scoreCaseRiskWithGemini(rawFlags, allFacts, routing.exceptionReasons, usageCollector),
        ]);

        const usageSummary = summarizeCaseUsage(usageCollector, 0);

        const now = new Date().toISOString();
        const caseId = `case_${crypto.randomBytes(6).toString('hex')}`;

        const createdAudit = await appendAuditLog({
          actor: consentParsed.data.typedSignature,
          action: 'case_created',
          caseId,
          details: `Analysed ${documents.length} document(s) for ${destinationCountry}. Queue: ${routing.queueBucket}, Risk score: ${riskScore.score}/100.`,
        });

        const record: CaseRecord = {
          id: caseId,
          createdAt: now,
          updatedAt: now,
          status:
            routing.queueBucket === 'exceptions'
              ? 'needs_counselor_review'
              : 'ready_for_batch_approval',
          queueBucket: routing.queueBucket,
          exceptionReasons: routing.exceptionReasons,
          riskScore,
          destinationCountry,
          ukRegion: destinationCountry === 'UK' ? ukRegion : undefined,
          targetPortalUrl,
          requiredCostOverride,
          exchangeRates: exchangeRatesParsed.data,
          consent: consentParsed.data,
          documents,
          facts: allFacts,
          flags: explainedFlags,
          statusTimeline: [
            {
              step: 'Consent & one-time authorisation signed',
              status: 'done',
              at: consentParsed.data.signedAt,
            },
            {
              step: 'Documents read in memory & deleted immediately',
              status: 'done',
              at: now,
            },
            {
              step: 'Facts extracted with quotes & checked in code',
              status: 'done',
              at: now,
            },
            {
              step:
                routing.queueBucket === 'exceptions'
                  ? 'Routed to counselor exception queue'
                  : 'Pre-approved by code rules — ready for counselor batch approval',
              status: 'current',
            },
            {
              step: 'Portal auto-fill & Submit (blocked until counselor approval token)',
              status: 'pending',
            },
          ],
          auditLog: [createdAudit],
          usageSummary,
          storageBackend: 'firestore',
        };

        const backend = await saveCaseRecord(record);
        record.storageBackend = backend;

        return res.status(201).json(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Document analysis failed.';
        console.error('[api/cases/analyze] error:', message);
        return res.status(502).json({
          error: 'Could not analyse your documents right now.',
          details: message,
        });
      }
    });
  });

  app.get('/api/cases/:id', async (req, res) => {
    const record = await getCaseRecord(String(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Case not found.' });
    }
    return res.json(record);
  });

  // DPDP Delete My Data
  app.delete('/api/cases/:id', async (req, res) => {
    const caseId = String(req.params.id);
    const { deleted, deletedAt } = await deleteCaseAndData(caseId);
    if (!deleted) {
      return res.status(404).json({
        error: 'Case not found or already deleted.',
      });
    }
    return res.json({
      deleted: true,
      caseId,
      deletedAt,
      message:
        'Your case, extracted facts, quotes, flags, consent record, and approval tokens have been permanently deleted.',
    });
  });

  // =========================================================================
  // COUNSELOR QUEUE ENDPOINTS (Demo mode: opens directly; approver's name is
  // required on every write for approval tokens & timestamped audit logs)
  // =========================================================================

  app.get('/api/counselor/queue', async (_req, res) => {
    try {
      const [allCases, auditLog, settings] = await Promise.all([
        listCaseRecords(),
        listAuditLogs(50),
        getCounselorSettings(),
      ]);

      // Normalize older cases & enrich with live agent step/token counts from agent_runs
      const normalized = await Promise.all(
        allCases.map(async (c) => {
          const runs = await listAgentRunsForCase(c.id);
          const agentSteps = runs.reduce((acc, r) => acc + Number(r.stepCount || 0), 0);
          const baseUsage = c.usageSummary ?? {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            agentSteps: 0,
            estimatedUsd: 0,
            calls: [],
          };
          const enrichedUsage = { ...baseUsage, agentSteps };

          if (c.queueBucket && c.riskScore) {
            return { ...c, usageSummary: enrichedUsage };
          }
          const routing = evaluateExceptionRouting({ flags: c.flags || [], facts: c.facts || [] });
          const redCount = (c.flags || []).filter((f) => f.severity === 'red').length;
          const fallbackScore =
            redCount > 0 ? Math.min(95, 65 + redCount * 10) : routing.exceptionReasons.length > 0 ? 50 : 15;
          return {
            ...c,
            queueBucket: routing.queueBucket,
            exceptionReasons: routing.exceptionReasons,
            riskScore: {
              score: fallbackScore,
              level: (fallbackScore >= 65 ? 'high' : fallbackScore >= 35 ? 'medium' : 'low') as
                | 'high'
                | 'medium'
                | 'low',
              brief:
                routing.exceptionReasons[0] ||
                'Pre-checked green case ready for counselor batch approval.',
              modelUsed: 'code_fallback',
            },
            auditLog: c.auditLog || [],
            usageSummary: enrichedUsage,
          };
        })
      );

      const exceptions = normalized.filter(
        (c) => c.status === 'needs_counselor_review'
      );
      const greenBatch = normalized.filter(
        (c) => c.status === 'ready_for_batch_approval'
      );
      const resolved = normalized.filter(
        (c) => c.status === 'approved' || c.status === 'rejected'
      );

      res.json({
        exceptions,
        greenBatch,
        resolved,
        auditLog,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Could not load counselor queue.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/api/counselor/cases/:id/approve', async (req, res) => {
    const parsed = CounselorApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join(' '),
      });
    }

    const record = await getCaseRecord(String(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    const portalUrl = parsed.data.portalUrl || record.targetPortalUrl || '/portal';
    const approvalToken = await createApprovalToken({
      caseId: record.id,
      portalUrl,
      approvedBy: parsed.data.counselorName,
    });

    const now = approvalToken.approvedAt;
    const auditEntry = await appendAuditLog({
      actor: parsed.data.counselorName,
      action: 'case_approved',
      caseId: record.id,
      details: `Approved for portal ${portalUrl}. Single-use token ${approvalToken.token.slice(0, 12)}... created.${parsed.data.notes ? ` Note: ${parsed.data.notes}` : ''}`,
    });

    const updated: CaseRecord = {
      ...record,
      updatedAt: now,
      status: 'approved',
      targetPortalUrl: portalUrl,
      counselorNotes: parsed.data.notes ?? record.counselorNotes,
      approvalTokenId: approvalToken.token,
      approvedBy: parsed.data.counselorName,
      approvedAt: now,
      auditLog: [auditEntry, ...(record.auditLog || [])],
      statusTimeline: record.statusTimeline.map((step, idx) => {
        if (idx === 3) {
          return {
            step: `Approved by counselor ${parsed.data.counselorName} (single-use token issued)`,
            status: 'done',
            at: now,
          };
        }
        if (idx === 4) {
          return {
            step: `Ready to submit on ${portalUrl} with counselor token`,
            status: 'current',
          };
        }
        return step;
      }),
    };

    await saveCaseRecord(updated);
    return res.json({ case: updated, approvalToken });
  });

  app.post('/api/counselor/cases/:id/edit', async (req, res) => {
    const parsed = CounselorEditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join(' '),
      });
    }

    const record = await getCaseRecord(String(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    const updatedFacts = [...record.facts];
    const editedFields: string[] = [];

    if (parsed.data.factEdits) {
      for (const edit of parsed.data.factEdits) {
        if (edit.index >= 0 && edit.index < updatedFacts.length) {
          const prev = updatedFacts[edit.index];
          const nextFact = maskFactIfSensitive({
            ...prev,
            value: edit.value,
            quoteVerified: edit.markVerified ? true : prev.quoteVerified,
            needsReview: edit.markVerified ? false : prev.needsReview,
          });
          updatedFacts[edit.index] = nextFact;
          editedFields.push(prev.field);
        }
      }
    }

    const nextRequiredOverride =
      parsed.data.requiredCostOverride !== undefined
        ? parsed.data.requiredCostOverride && parsed.data.requiredCostOverride.amount > 0
          ? parsed.data.requiredCostOverride
          : null
        : record.requiredCostOverride ?? null;

    const settings = await getCounselorSettings();
    const rawFlags = runAllChecks({
      facts: updatedFacts,
      destinationCountry: record.destinationCountry,
      ukRegion: record.ukRegion,
      requiredCostOverride: nextRequiredOverride,
      exchangeRates: settings.exchangeRates,
      ukRules: settings.ukRules,
    });

    const routing = evaluateExceptionRouting({
      flags: rawFlags,
      facts: updatedFacts,
    });

    const [explainedFlags, riskScore] = await Promise.all([
      explainFlagsWithGemini(rawFlags),
      scoreCaseRiskWithGemini(rawFlags, updatedFacts, routing.exceptionReasons),
    ]);

    const now = new Date().toISOString();
    const auditEntry = await appendAuditLog({
      actor: parsed.data.counselorName,
      action: 'case_edited',
      caseId: record.id,
      details: `Edited ${editedFields.length > 0 ? editedFields.join(', ') : 'case parameters'} and re-ran checks. New risk score: ${riskScore.score}/100 (${routing.queueBucket}).`,
    });

    const updated: CaseRecord = {
      ...record,
      updatedAt: now,
      facts: updatedFacts,
      flags: explainedFlags,
      requiredCostOverride: nextRequiredOverride,
      exchangeRates: settings.exchangeRates,
      queueBucket: routing.queueBucket,
      exceptionReasons: routing.exceptionReasons,
      riskScore,
      status:
        routing.queueBucket === 'exceptions'
          ? 'needs_counselor_review'
          : 'ready_for_batch_approval',
      counselorNotes: parsed.data.notes ?? record.counselorNotes,
      auditLog: [auditEntry, ...(record.auditLog || [])],
    };

    await saveCaseRecord(updated);
    return res.json({ case: updated });
  });

  app.post('/api/counselor/cases/:id/reject', async (req, res) => {
    const parsed = CounselorRejectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join(' '),
      });
    }

    const record = await getCaseRecord(String(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    await revokeTokensForCase(record.id);

    const now = new Date().toISOString();
    const auditEntry = await appendAuditLog({
      actor: parsed.data.counselorName,
      action: 'case_rejected',
      caseId: record.id,
      details: `Rejected by ${parsed.data.counselorName}. Reason: ${parsed.data.reason}`,
    });

    const updated: CaseRecord = {
      ...record,
      updatedAt: now,
      status: 'rejected',
      rejectedReason: parsed.data.reason,
      approvalTokenId: undefined,
      auditLog: [auditEntry, ...(record.auditLog || [])],
      statusTimeline: record.statusTimeline.map((step, idx) => {
        if (idx === 3) {
          return {
            step: `Returned by counselor ${parsed.data.counselorName}: ${parsed.data.reason}`,
            status: 'done',
            at: now,
          };
        }
        return step;
      }),
    };

    await saveCaseRecord(updated);
    return res.json({ case: updated });
  });

  app.post('/api/counselor/batch-approve', async (req, res) => {
    const parsed = CounselorBatchApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join(' '),
      });
    }

    const allCases = await listCaseRecords();
    const requestedIds = parsed.data.caseIds ? new Set(parsed.data.caseIds) : null;

    // Plain-code safety guard: NEVER batch-approve any case that has exceptions!
    const eligible = allCases.filter((c) => {
      if (c.status !== 'ready_for_batch_approval') return false;
      if (requestedIds && !requestedIds.has(c.id)) return false;
      const routing = evaluateExceptionRouting({ flags: c.flags || [], facts: c.facts || [] });
      return routing.preApprovedByRules;
    });

    const tokens = [];
    const approvedCases: CaseRecord[] = [];

    for (const c of eligible) {
      const portalUrl = parsed.data.portalUrl || c.targetPortalUrl || '/portal';
      const token = await createApprovalToken({
        caseId: c.id,
        portalUrl,
        approvedBy: parsed.data.counselorName,
      });
      const auditEntry = await appendAuditLog({
        actor: parsed.data.counselorName,
        action: 'case_batch_approved',
        caseId: c.id,
        details: `Green case batch-approved for ${portalUrl}. Single-use token ${token.token.slice(0, 12)}... issued.`,
      });
      const updated: CaseRecord = {
        ...c,
        updatedAt: token.approvedAt,
        status: 'approved',
        targetPortalUrl: portalUrl,
        approvalTokenId: token.token,
        approvedBy: parsed.data.counselorName,
        approvedAt: token.approvedAt,
        auditLog: [auditEntry, ...(c.auditLog || [])],
        statusTimeline: c.statusTimeline.map((step, idx) =>
          idx === 3
            ? {
                step: `Batch-approved by counselor ${parsed.data.counselorName}`,
                status: 'done',
                at: token.approvedAt,
              }
            : idx === 4
              ? { step: `Ready to submit on ${portalUrl} with counselor token`, status: 'current' }
              : step
        ),
      };
      await saveCaseRecord(updated);
      approvedCases.push(updated);
      tokens.push(token);
    }

    return res.json({
      approvedCount: approvedCases.length,
      approvedCases,
      tokens,
    });
  });

  app.put('/api/counselor/settings', async (req, res) => {
    const parsed = CounselorSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid rules or exchange rates.',
        details: parsed.error.issues.map((i) => i.message).join(' '),
      });
    }

    const nextSettings: CounselorSettings = {
      ukRules: parsed.data.ukRules,
      exchangeRates: parsed.data.exchangeRates,
      updatedAt: new Date().toISOString(),
      updatedBy: parsed.data.counselorName,
    };

    await saveCounselorSettings(nextSettings);
    await appendAuditLog({
      actor: parsed.data.counselorName,
      action: 'settings_updated',
      details: `Updated UK rules (London GBP ${nextSettings.ukRules.maintenance.londonPerMonth}, outside GBP ${nextSettings.ukRules.maintenance.outsideLondonPerMonth}) and exchange rates as of ${nextSettings.exchangeRates.asOfDate}.`,
    });

    return res.json(nextSettings);
  });

  app.get('/api/counselor/audit', async (_req, res) => {
    const logs = await listAuditLogs(100);
    res.json({ auditLog: logs });
  });

  // =========================================================================
  // PHASE 4: /portal API, University Rules Grounding (gemini-4-neon), & Cloud Tasks Agent Dispatch
  // =========================================================================

  app.use(createPortalRouter());

  app.post('/api/university-rules', async (req, res) => {
    const universityName = String(req.body?.universityName || '').trim();
    const programName = String(req.body?.programName || '').trim();
    const url = req.body?.url ? String(req.body.url).trim() : undefined;

    if (!universityName || !programName) {
      return res.status(400).json({
        error: 'Please enter both a university name and a program name.',
      });
    }

    try {
      const result = await fetchUniversityRulesGrounded({
        universityName,
        programName,
        url,
      });
      return res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not fetch university rules right now.';
      console.error('[api/university-rules] error:', message);
      return res.status(502).json({
        error: 'Could not look up university rules right now.',
        details: message,
      });
    }
  });

  app.post('/api/agent/runs', async (req, res) => {
    const caseId = String(req.body?.caseId || '').trim();
    const studentEmail = String(req.body?.studentEmail || '').trim().toLowerCase();
    const studentPhone = String(req.body?.studentPhone || '').trim();
    const rawPortalUrl = String(req.body?.portalUrl || '').trim();

    // Strict SSRF check FIRST: only accept our own /portal URL on the exact same host.
    // Rejects localhost, 169.254.169.254, internal/private IPs, foreign hosts, and redirects with 400.
    const publicBaseUrl =
      process.env.PUBLIC_WEB_URL ||
      `${req.protocol}://${req.get('host')}`;
    const portalValidation = validateOwnPortalUrl(rawPortalUrl, publicBaseUrl);
    if (!portalValidation.ok) {
      return res.status(400).json({
        error: portalValidation.error,
        code: 'INVALID_PORTAL_URL',
      });
    }

    if (!caseId) {
      return res.status(400).json({ error: 'caseId is required.' });
    }
    if (!studentEmail || !studentEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter the student email address.' });
    }

    const record = await getCaseRecord(caseId);
    if (!record) {
      return res.status(404).json({ error: `Case ${caseId} not found.` });
    }

    const portalUrl = portalValidation.normalizedUrl;
    const runId = `run_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const allowlistedDomains = [portalValidation.allowedHost];

    const runRecord = {
      id: runId,
      caseId,
      portalUrl,
      allowlistedDomains,
      studentEmail,
      studentPhone: studentPhone || '+91-9000000000',
      status: 'queued',
      currentModel: MODELS.computerUse.primary,
      stepCount: 0,
      consecutiveFailures: 0,
      statusMessage: 'Queued via Google Cloud Tasks for Playwright computer-use worker.',
      steps: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveAgentRun(runRecord);
    await appendAuditLog({
      actor: studentEmail,
      action: 'case_created',
      caseId,
      details: `Dispatched computer-use agent run ${runId} targeting ${portalUrl}.`,
    });

    try {
      const dispatch = await enqueueAgentRunTask({ runId });
      return res.status(202).json({
        run: runRecord,
        dispatch,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await saveAgentRun({
        ...runRecord,
        status: 'failed',
        statusMessage: `Could not dispatch Cloud Task: ${message}`,
        updatedAt: new Date().toISOString(),
      });
      return res.status(502).json({
        error: 'Could not dispatch agent worker via Cloud Tasks.',
        details: message,
        runId,
      });
    }
  });

  app.get('/api/agent/runs/:runId', async (req, res) => {
    const run = await getAgentRun(String(req.params.runId));
    if (!run) {
      return res.status(404).json({ error: 'Agent run not found.' });
    }
    return res.json(run);
  });

  app.get('/api/cases/:id/agent-runs', async (req, res) => {
    const runs = await listAgentRunsForCase(String(req.params.id));
    return res.json({ runs });
  });

  app.post('/api/agent/runs/:runId/resume', async (req, res) => {
    const runId = String(req.params.runId);
    const safetyAcknowledged = Boolean(req.body?.safetyAcknowledged);
    const run = await getAgentRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Agent run not found.' });
    }

    await saveAgentRun({
      ...run,
      id: runId,
      status: 'queued',
      statusMessage: 'Resuming agent run via Google Cloud Tasks...',
      updatedAt: new Date().toISOString(),
    });

    try {
      const dispatch = await enqueueAgentRunTask({ runId, safetyAcknowledged });
      return res.status(202).json({ ok: true, runId, dispatch });
    } catch (err) {
      return res.status(502).json({
        error: 'Could not enqueue resume task.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Serve built web app if present
  const webDistCandidates = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  const webDistDir = webDistCandidates.find((dir) =>
    fs.existsSync(path.join(dir, 'index.html'))
  );

  if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  return app;
}

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODELS } from './config/models.js';
import { generateWithFallback, listAllowedModels } from './gemini.js';
import {
  ConsentSchema,
  ExchangeRateConfigSchema,
  type CaseDocumentSummary,
  type CaseRecord,
  type VerifiedFact,
} from './schemas/case.js';
import {
  classifyDocument,
  explainFlagsWithGemini,
  extractDocumentFacts,
} from './services/documentPipeline.js';
import { runAllChecks } from './checks/runChecks.js';
import { loadUkRules } from './checks/rulesLoader.js';
import { getCaseRecord, saveCaseRecord } from './services/firestoreStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

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
      cb(new Error(`Unsupported file type "${file.mimetype}". Upload PDF, JPG, or PNG files only.`));
    }
  },
});

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/rules/uk', (_req, res) => {
    try {
      res.json(loadUkRules());
    } catch (err) {
      res.status(500).json({
        error: 'Could not load UK rules file.',
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

  app.post('/api/cases/analyze', (req, res) => {
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
            error: 'Please complete the consent and one-time authorisation screen before uploading.',
            details: consentParsed.error.issues.map((i) => i.message).join(' '),
          });
        }

        const exchangeRatesRaw = JSON.parse(String(req.body.exchangeRates || '{}'));
        const exchangeRatesParsed = ExchangeRateConfigSchema.safeParse(exchangeRatesRaw);
        if (!exchangeRatesParsed.success) {
          return res.status(400).json({
            error: 'Please provide valid, dated exchange rates before checking funds.',
            details: exchangeRatesParsed.error.issues.map((i) => i.message).join(' '),
          });
        }

        const destinationCountry = String(req.body.destinationCountry || 'UK') as CaseRecord['destinationCountry'];
        const ukRegion =
          req.body.ukRegion === 'london' ? 'london' : 'outside_london';

        let requiredCostOverride: { amount: number; currency: string } | null = null;
        if (req.body.requiredCostAmount && Number(req.body.requiredCostAmount) > 0) {
          requiredCostOverride = {
            amount: Number(req.body.requiredCostAmount),
            currency: String(req.body.requiredCostCurrency || 'GBP').toUpperCase(),
          };
        }

        // Process each document purely from memory buffers
        const documents: CaseDocumentSummary[] = [];
        const allFacts: VerifiedFact[] = [];

        for (const file of files) {
          const docType = await classifyDocument(file.buffer, file.mimetype, file.originalname);
          documents.push({
            fileName: file.originalname,
            mimeType: file.mimetype,
            documentType: docType,
          });

          const { facts } = await extractDocumentFacts(
            file.buffer,
            file.mimetype,
            file.originalname,
            docType
          );
          allFacts.push(...facts);

          // Explicitly release buffer reference right after reading
          file.buffer = Buffer.alloc(0);
        }

        // Run deterministic plain-code checks
        const rawFlags = runAllChecks({
          facts: allFacts,
          destinationCountry,
          ukRegion,
          requiredCostOverride,
          exchangeRates: exchangeRatesParsed.data,
        });

        // Plain-English explanations & suggested fixes from gemini-4-carbon (fallback argon)
        const explainedFlags = await explainFlagsWithGemini(rawFlags);

        const hasRedOrReview =
          explainedFlags.some((f) => f.severity === 'red') ||
          allFacts.some((f) => f.needsReview);

        const now = new Date().toISOString();
        const caseId = `case_${crypto.randomBytes(6).toString('hex')}`;

        const record: CaseRecord = {
          id: caseId,
          createdAt: now,
          updatedAt: now,
          status: hasRedOrReview ? 'needs_counselor_review' : 'ready_for_batch_approval',
          destinationCountry,
          ukRegion: destinationCountry === 'UK' ? ukRegion : undefined,
          requiredCostOverride,
          exchangeRates: exchangeRatesParsed.data,
          consent: consentParsed.data,
          documents,
          facts: allFacts,
          flags: explainedFlags,
          statusTimeline: [
            { step: 'Consent & one-time authorisation signed', status: 'done', at: consentParsed.data.signedAt },
            { step: 'Documents read in memory & deleted immediately', status: 'done', at: now },
            { step: 'Facts extracted with quotes & checked in code', status: 'done', at: now },
            {
              step: hasRedOrReview
                ? 'Waiting for counselor exception review'
                : 'Pre-checked green — ready for counselor batch approval',
              status: 'current',
            },
            { step: 'Portal auto-fill & Submit (blocked until counselor approval)', status: 'pending' },
          ],
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
    const record = await getCaseRecord(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Case not found.' });
    }
    return res.json(record);
  });

  // Serve built web app if present
  const webDistCandidates = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  const webDistDir = webDistCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

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

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODELS } from './config/models.js';
import { generateWithFallback, listAllowedModels } from './gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
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

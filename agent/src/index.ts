import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runComputerUseAgent } from './agentLoop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'aira-agent' });
});

app.post('/tasks/run-agent', async (req, res) => {
  const runId = String(req.body?.runId || '').trim();
  const safetyAcknowledged = Boolean(req.body?.safetyAcknowledged);

  if (!runId) {
    return res.status(400).json({ error: 'Missing runId in task payload.' });
  }

  console.info(`[aira-agent] Starting runId=${runId} safetyAcknowledged=${safetyAcknowledged}`);
  try {
    const result = await runComputerUseAgent({ runId, safetyAcknowledged });
    return res.json({
      ok: true,
      runId: result.id,
      status: result.status,
      stepCount: result.stepCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[aira-agent] Task error for runId=${runId}:`, message);
    return res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => {
  console.log(`[aira-agent] Playwright worker listening on http://0.0.0.0:${port}`);
});

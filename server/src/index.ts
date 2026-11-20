import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from repo root first, then current working directory if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const port = Number(process.env.PORT || 8080);
const app = createApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`[aira-server] Listening on http://0.0.0.0:${port}`);
});

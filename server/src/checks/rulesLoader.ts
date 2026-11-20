import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UkRules {
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
}

let cachedUkRules: UkRules | null = null;

export function loadUkRules(): UkRules {
  if (cachedUkRules) {
    return cachedUkRules;
  }
  const candidates = [
    path.resolve(__dirname, '../../../rules/uk.json'),
    path.resolve(process.cwd(), 'rules/uk.json'),
    path.resolve(process.cwd(), '../rules/uk.json'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Could not locate rules/uk.json.');
  }
  cachedUkRules = JSON.parse(fs.readFileSync(found, 'utf8')) as UkRules;
  return cachedUkRules;
}

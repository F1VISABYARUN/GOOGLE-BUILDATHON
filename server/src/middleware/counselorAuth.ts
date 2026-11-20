import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let secretClient: SecretManagerServiceClient | null = null;
let cachedPasscode: { value: string; expiresAt: number } | null = null;

function sanitizeSecret(raw: string | undefined): string {
  if (!raw) return '';
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine ?? '';
}

export function timingSafePasscodeEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Compare dummy equal-length buffers to keep timing consistent
    crypto.timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export async function loadCounselorPasscode(): Promise<string | null> {
  // 1. Injected via Cloud Run --set-secrets or local .env
  const envPass = sanitizeSecret(process.env.COUNSELOR_PASSCODE);
  if (envPass) {
    return envPass;
  }

  // 2. Cached Secret Manager value (60s TTL)
  if (cachedPasscode && Date.now() < cachedPasscode.expiresAt) {
    return cachedPasscode.value;
  }

  // 3. Read directly from Google Cloud Secret Manager (`COUNSELOR_PASSCODE`)
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6';
    if (!secretClient) {
      secretClient = new SecretManagerServiceClient();
    }
    const name = `projects/${projectId}/secrets/COUNSELOR_PASSCODE/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const secretVal = sanitizeSecret(version.payload?.data?.toString('utf8'));
    if (secretVal) {
      cachedPasscode = { value: secretVal, expiresAt: Date.now() + 60_000 };
      return secretVal;
    }
  } catch (err) {
    console.warn(
      '[counselor-auth] Could not load COUNSELOR_PASSCODE from Secret Manager:',
      err instanceof Error ? err.message : String(err)
    );
  }

  return null;
}

export function isCounselorDemoOpen(): boolean {
  return process.env.COUNSELOR_DEMO_OPEN === 'true';
}

export function createCounselorAuthMiddleware(
  passcodeLoader: () => Promise<string | null> = loadCounselorPasscode
) {
  return async function requireCounselorPasscode(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (isCounselorDemoOpen()) {
      return next();
    }

    const expected = await passcodeLoader();
    if (!expected) {
      return res.status(503).json({
        error:
          'Counselor passcode is not configured yet. Create the COUNSELOR_PASSCODE secret in Google Secret Manager and grant Cloud Run access.',
      });
    }

    const headerVal = req.headers['x-counselor-passcode'];
    const provided = typeof headerVal === 'string' ? headerVal.trim() : '';

    if (!provided || !timingSafePasscodeEquals(provided, expected)) {
      return res.status(401).json({
        error: 'Invalid counselor passcode. Please check the passcode and try again.',
      });
    }

    return next();
  };
}

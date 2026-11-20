import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { createApp } from './app.js';
import { createApprovalToken } from './services/firestoreStore.js';
import { validateOwnPortalUrl } from './checks/portalUrlGuard.js';

async function startTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('/portal Submit Gate & Counselor Token Enforcement (Phase 4)', () => {
  it('returns 403 Forbidden without a counselor approval token, succeeds once with a valid token, and returns 403 on replay', async () => {
    const srv = await startTestServer();
    try {
      // 1. Submit without approval token -> 403
      const blockedNoToken = await fetch(
        `${srv.baseUrl}/api/portal/applications/sess_test1/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: 'case_gate_test',
            portalUrl: '/portal',
          }),
        }
      );
      expect(blockedNoToken.status).toBe(403);
      const blockedJson = (await blockedNoToken.json()) as { code: string };
      expect(blockedJson.code).toBe('COUNSELOR_APPROVAL_REQUIRED');

      // 2. Submit with fake token -> 403
      const blockedFake = await fetch(
        `${srv.baseUrl}/api/portal/applications/sess_test1/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: 'case_gate_test',
            portalUrl: '/portal',
            approvalToken: 'tok_forged_12345',
          }),
        }
      );
      expect(blockedFake.status).toBe(403);

      // 3. Issue a real single-use counselor token -> 200 OK
      const tok = await createApprovalToken({
        caseId: 'case_gate_test',
        portalUrl: '/portal',
        approvedBy: 'Counselor Meera',
      });

      const approvedSubmit = await fetch(
        `${srv.baseUrl}/api/portal/applications/sess_test1/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: 'case_gate_test',
            portalUrl: '/portal',
            approvalToken: tok.token,
          }),
        }
      );
      expect(approvedSubmit.status).toBe(200);
      const receipt = (await approvedSubmit.json()) as {
        submitted: boolean;
        submissionId: string;
        approvedBy: string;
      };
      expect(receipt.submitted).toBe(true);
      expect(receipt.submissionId).toMatch(/^APP-/);
      expect(receipt.approvedBy).toBe('Counselor Meera');

      // 4. Replay of the same token -> 403 (single-use enforced)
      const replay = await fetch(
        `${srv.baseUrl}/api/portal/applications/sess_test1/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: 'case_gate_test',
            portalUrl: '/portal',
            approvalToken: tok.token,
          }),
        }
      );
      expect(replay.status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});

describe('SSRF Protection on /api/agent/runs', () => {
  it('allows only our own /portal URL and rejects localhost, 169.254.169.254, internal IPs, foreign hosts, and redirects with 400', async () => {
    const ownOrigin = 'https://aira-web-217073132830.asia-south1.run.app';
    expect(validateOwnPortalUrl('/portal', ownOrigin).ok).toBe(true);
    expect(validateOwnPortalUrl(`${ownOrigin}/portal`, ownOrigin).ok).toBe(true);

    const prevPublicUrl = process.env.PUBLIC_WEB_URL;
    process.env.PUBLIC_WEB_URL = ownOrigin;
    const srv = await startTestServer();
    try {
      const blockedUrls = [
        'http://169.254.169.254',
        'http://169.254.169.254/latest/meta-data/',
        'http://localhost:8080/portal',
        'http://127.0.0.1:8080/portal',
        'http://[::1]:8080/portal',
        'http://10.0.0.1/portal',
        'http://172.16.0.1/portal',
        'http://192.168.1.10/portal',
        'http://metadata.google.internal/computeMetadata/v1/',
        'https://evil.example.com/portal',
        `${ownOrigin}/portal?redirect=http://169.254.169.254`,
        `${ownOrigin}/api/health`,
        `${ownOrigin}/portal/../redirect`,
        `https://aira-web-217073132830.asia-south1.run.app@169.254.169.254/portal`,
      ];

      for (const badUrl of blockedUrls) {
        const res = await fetch(`${srv.baseUrl}/api/agent/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: 'case_ssrf_test',
            studentEmail: 'student@example.com',
            portalUrl: badUrl,
          }),
        });
        expect(res.status, `Expected 400 for ${badUrl}`).toBe(400);
        const data = (await res.json()) as { code?: string };
        expect(data.code).toBe('INVALID_PORTAL_URL');
      }
    } finally {
      await srv.close();
      if (prevPublicUrl === undefined) {
        delete process.env.PUBLIC_WEB_URL;
      } else {
        process.env.PUBLIC_WEB_URL = prevPublicUrl;
      }
    }
  });
});

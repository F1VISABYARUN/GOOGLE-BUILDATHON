import crypto from 'node:crypto';
import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import {
  appendAuditLog,
  verifyAndConsumeApprovalToken,
} from '../services/firestoreStore.js';

interface PortalAccount {
  email: string;
  phone: string;
  fullName: string;
  verificationCode: string;
  verified: boolean;
  sessionId?: string;
  createdAt: string;
}

interface PortalApplicationDraft {
  sessionId: string;
  email: string;
  caseId?: string;
  personal?: Record<string, unknown>;
  academics?: Record<string, unknown>;
  funding?: Record<string, unknown>;
  documentFileName?: string;
  declarationAccepted?: boolean;
  declarationName?: string;
  submitted?: boolean;
  submissionId?: string;
  submittedAt?: string;
  approvedBy?: string;
  updatedAt: string;
}

const memoryAccounts = new Map<string, PortalAccount>();
const memoryApps = new Map<string, PortalApplicationDraft>();

function isTestMode(): boolean {
  return process.env.VITEST === 'true' || process.env.USE_MEMORY_STORE === 'true';
}

let dbInstance: Firestore | null = null;
function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6',
      ignoreUndefinedProperties: true,
    });
  }
  return dbInstance;
}

export function createPortalRouter() {
  const router = express.Router();

  /**
   * 1. Account creation — sends a 6-digit verification code to the student's Aira inbox
   *    (`portal_inbox` in Firestore), never exposing the code in the HTTP response.
   */
  router.post('/api/portal/register', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const fullName = String(req.body?.fullName || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid student email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const now = new Date().toISOString();
    const account: PortalAccount = {
      email,
      phone,
      fullName: fullName || 'Applicant',
      verificationCode: code,
      verified: false,
      createdAt: now,
    };
    memoryAccounts.set(email, account);

    if (!isTestMode()) {
      try {
        const db = getDb();
        await db.collection('portal_accounts').doc(email).set(account);
        const msgId = `msg_${crypto.randomBytes(6).toString('hex')}`;
        await db.collection('portal_inbox').doc(msgId).set({
          id: msgId,
          toEmail: email,
          fromSender: 'admissions@direct-university.portal',
          subject: 'Your Direct University Portal Verification Code',
          body: `Hello ${account.fullName}, your 6-digit portal email verification code is ${code}. Enter this code to activate your application account.`,
          receivedAt: now,
        });
      } catch (err) {
        console.warn('[portal] Firestore write warning on register:', err);
      }
    }

    return res.status(201).json({
      ok: true,
      email,
      message:
        'Account created. A 6-digit verification code was sent to your student email / Aira inbox.',
    });
  });

  /**
   * Forward external portal verification emails (e.g. from Slate or PeopleSoft) to the student's Aira inbox.
   */
  router.post('/api/inbox/forward', async (req, res) => {
    const toEmail = String(req.body?.toEmail || '').trim().toLowerCase();
    const fromSender = String(req.body?.fromSender || 'admissions@university.edu').trim();
    const subject = String(req.body?.subject || 'Verification Code').trim();
    const body = String(req.body?.body || '').trim();

    if (!toEmail || !body) {
      return res.status(400).json({ error: 'toEmail and body are required.' });
    }

    const now = new Date().toISOString();
    const msgId = `msg_${crypto.randomBytes(6).toString('hex')}`;
    if (!isTestMode()) {
      try {
        await getDb().collection('portal_inbox').doc(msgId).set({
          id: msgId,
          toEmail,
          fromSender,
          subject,
          body,
          receivedAt: now,
        });
      } catch (err) {
        console.warn('[inbox] Firestore write failed:', err);
      }
    }

    return res.status(201).json({ ok: true, id: msgId, receivedAt: now });
  });

  /**
   * 2. Email verification step
   */
  router.post('/api/portal/verify-email', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const caseId = req.body?.caseId ? String(req.body.caseId).trim() : undefined;

    let account = memoryAccounts.get(email);
    if (!account && !isTestMode()) {
      try {
        const snap = await getDb().collection('portal_accounts').doc(email).get();
        if (snap.exists) {
          account = snap.data() as PortalAccount;
        }
      } catch {
        // ignore
      }
    }

    if (!account) {
      return res.status(404).json({ error: 'Account not found. Please create an account first.' });
    }
    if (account.verificationCode !== code) {
      return res.status(400).json({ error: 'Incorrect verification code. Please check your inbox.' });
    }

    const sessionId = `sess_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    account.verified = true;
    account.sessionId = sessionId;
    memoryAccounts.set(email, account);

    const draft: PortalApplicationDraft = {
      sessionId,
      email,
      caseId,
      updatedAt: now,
    };
    memoryApps.set(sessionId, draft);

    if (!isTestMode()) {
      try {
        const db = getDb();
        await db.collection('portal_accounts').doc(email).set(account);
        await db.collection('portal_applications').doc(sessionId).set(draft);
      } catch (err) {
        console.warn('[portal] Firestore write warning on verify:', err);
      }
    }

    return res.json({
      verified: true,
      sessionId,
      email,
    });
  });

  /**
   * 3. Save application draft progress across pages (personal, academics, funding, documents, declaration)
   */
  router.post('/api/portal/applications/:sessionId/save', async (req, res) => {
    const sessionId = String(req.params.sessionId);
    let draft = memoryApps.get(sessionId);

    if (!draft && !isTestMode()) {
      try {
        const snap = await getDb().collection('portal_applications').doc(sessionId).get();
        if (snap.exists) draft = snap.data() as PortalApplicationDraft;
      } catch {
        // ignore
      }
    }

    if (!draft) {
      draft = {
        sessionId,
        email: String(req.body?.email || 'applicant@example.com'),
        updatedAt: new Date().toISOString(),
      };
    }

    const updated: PortalApplicationDraft = {
      ...draft,
      caseId: req.body?.caseId ? String(req.body.caseId) : draft.caseId,
      personal: req.body?.personal ?? draft.personal,
      academics: req.body?.academics ?? draft.academics,
      funding: req.body?.funding ?? draft.funding,
      documentFileName: req.body?.documentFileName ?? draft.documentFileName,
      declarationAccepted:
        req.body?.declarationAccepted !== undefined
          ? Boolean(req.body.declarationAccepted)
          : draft.declarationAccepted,
      declarationName: req.body?.declarationName ?? draft.declarationName,
      updatedAt: new Date().toISOString(),
    };

    memoryApps.set(sessionId, updated);
    if (!isTestMode()) {
      try {
        await getDb().collection('portal_applications').doc(sessionId).set(updated);
      } catch (err) {
        console.warn('[portal] Firestore save draft warning:', err);
      }
    }

    return res.json({ saved: true, draft: updated });
  });

  /**
   * 4. HARD SUBMIT GATE:
   *    Checks Firestore for a valid single-use counselor approval token tied to (caseId, portalUrl).
   *    Returns HTTP 403 Forbidden without a valid token!
   */
  router.post('/api/portal/applications/:sessionId/submit', async (req, res) => {
    const sessionId = String(req.params.sessionId);
    const headerToken = req.headers['x-approval-token'];
    const approvalToken =
      (typeof headerToken === 'string' ? headerToken.trim() : '') ||
      String(req.body?.approvalToken || '').trim();
    const caseId = String(req.body?.caseId || '').trim();
    const portalUrl = String(req.body?.portalUrl || '/portal').trim() || '/portal';

    if (!approvalToken || !caseId) {
      return res.status(403).json({
        error:
          'Submit blocked (403): A valid single-use counselor approval token and case ID are required before submitting this application.',
        code: 'COUNSELOR_APPROVAL_REQUIRED',
      });
    }

    const check = await verifyAndConsumeApprovalToken({
      token: approvalToken,
      caseId,
      portalUrl,
    });

    if (!check.valid || !check.record) {
      return res.status(403).json({
        error: `Submit blocked (403): ${check.reason || 'Invalid counselor approval token.'}`,
        code: 'COUNSELOR_APPROVAL_INVALID',
      });
    }

    const submissionId = `APP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const submittedAt = new Date().toISOString();

    const receipt = {
      submitted: true,
      submissionId,
      sessionId,
      caseId,
      portalUrl,
      approvedBy: check.record.approvedBy,
      approvedAt: check.record.approvedAt,
      submittedAt,
    };

    if (!isTestMode()) {
      try {
        const db = getDb();
        await db.collection('portal_submissions').doc(submissionId).set(receipt);
        await db.collection('portal_applications').doc(sessionId).set(
          {
            submitted: true,
            submissionId,
            submittedAt,
            approvedBy: check.record.approvedBy,
            updatedAt: submittedAt,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('[portal] Firestore receipt warning:', err);
      }
    }

    await appendAuditLog({
      actor: 'aira-agent',
      action: 'token_consumed',
      caseId,
      details: `Portal application submitted (${submissionId}) on ${portalUrl} using single-use token approved by ${check.record.approvedBy}.`,
    });

    return res.json(receipt);
  });

  return router;
}

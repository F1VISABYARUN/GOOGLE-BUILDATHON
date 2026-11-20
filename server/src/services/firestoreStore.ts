import crypto from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import type {
  ApprovalTokenRecord,
  AuditLogEntry,
  CaseRecord,
  CounselorSettings,
} from '../schemas/case.js';
import { loadUkRules } from '../checks/rulesLoader.js';

let firestoreClient: Firestore | null = null;

// Local memory fallbacks (used only if local laptop has no GCP ADC)
const memoryCases = new Map<string, CaseRecord>();
const memoryTokens = new Map<string, ApprovalTokenRecord>();
const memoryAuditLogs: AuditLogEntry[] = [];
let memorySettings: CounselorSettings | null = null;

function isMemoryOnlyTestMode(): boolean {
  return process.env.VITEST === 'true' || process.env.USE_MEMORY_STORE === 'true';
}

function getFirestore(): Firestore {
  if (!firestoreClient) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6';
    firestoreClient = new Firestore({
      projectId,
      ignoreUndefinedProperties: true,
    });
  }
  return firestoreClient;
}

export function getDefaultCounselorSettings(): CounselorSettings {
  return {
    ukRules: loadUkRules(),
    exchangeRates: {
      asOfDate: new Date().toISOString().slice(0, 10),
      sourceNote: 'Counselor-managed dated rate table (editable)',
      ratesToInr: {
        INR: 1,
        GBP: 120,
        USD: 96,
        EUR: 102,
        CAD: 68,
        AUD: 62,
      },
    },
    updatedAt: new Date().toISOString(),
    updatedBy: 'default',
  };
}

/**
 * Stores ONLY structured facts, quotes, flags, status, consent, and authorisation in Firestore (`cases/{id}`).
 * NEVER stores uploaded document bytes or files.
 */
export async function saveCaseRecord(
  record: CaseRecord
): Promise<'firestore' | 'memory_fallback'> {
  if (isMemoryOnlyTestMode()) {
    memoryCases.set(record.id, { ...record, storageBackend: 'memory_fallback' });
    return 'memory_fallback';
  }
  try {
    const db = getFirestore();
    await db.collection('cases').doc(record.id).set({
      ...record,
      storageBackend: 'firestore',
    });
    console.info(
      `[firestore] Saved cases/${record.id} (facts=${record.facts.length}, flags=${record.flags.length}, risk=${record.riskScore?.score ?? 0})`
    );
    return 'firestore';
  } catch (err) {
    console.warn(
      `[firestore] Could not write cases/${record.id} to Firestore, using local memory fallback:`,
      err instanceof Error ? err.message : String(err)
    );
    memoryCases.set(record.id, {
      ...record,
      storageBackend: 'memory_fallback',
    });
    return 'memory_fallback';
  }
}

export async function getCaseRecord(caseId: string): Promise<CaseRecord | null> {
  if (isMemoryOnlyTestMode()) {
    return memoryCases.get(caseId) ?? null;
  }
  try {
    const db = getFirestore();
    const snap = await db.collection('cases').doc(caseId).get();
    if (snap.exists) {
      return snap.data() as CaseRecord;
    }
  } catch (err) {
    console.warn(
      `[firestore] Read failed for cases/${caseId}, checking local memory fallback:`,
      err instanceof Error ? err.message : String(err)
    );
  }
  return memoryCases.get(caseId) ?? null;
}

export async function listCaseRecords(): Promise<CaseRecord[]> {
  const byId = new Map<string, CaseRecord>();
  if (!isMemoryOnlyTestMode()) {
    try {
      const db = getFirestore();
      const snap = await db.collection('cases').limit(200).get();
      for (const doc of snap.docs) {
        const data = doc.data() as CaseRecord;
        byId.set(data.id || doc.id, data);
      }
    } catch (err) {
      console.warn(
        '[firestore] List cases failed, using local memory fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  for (const [id, rec] of memoryCases.entries()) {
    if (!byId.has(id)) {
      byId.set(id, rec);
    }
  }

  // Sort by highest risk score first, then newest createdAt
  return Array.from(byId.values()).sort((a, b) => {
    const scoreDiff = (b.riskScore?.score ?? 0) - (a.riskScore?.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

export async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
  const fullEntry: AuditLogEntry = {
    id: `aud_${crypto.randomBytes(6).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  memoryAuditLogs.unshift(fullEntry);
  if (memoryAuditLogs.length > 200) {
    memoryAuditLogs.pop();
  }

  if (!isMemoryOnlyTestMode()) {
    try {
      const db = getFirestore();
      await db.collection('audit_logs').doc(fullEntry.id).set(fullEntry);
    } catch (err) {
      console.warn(
        '[firestore] Could not persist audit log entry:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return fullEntry;
}

export async function listAuditLogs(limitCount = 50): Promise<AuditLogEntry[]> {
  if (isMemoryOnlyTestMode()) {
    return memoryAuditLogs.slice(0, limitCount);
  }
  try {
    const db = getFirestore();
    const snap = await db
      .collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(limitCount)
      .get();
    if (!snap.empty) {
      return snap.docs.map((d) => d.data() as AuditLogEntry);
    }
  } catch (err) {
    console.warn(
      '[firestore] Could not read audit_logs, falling back to memory:',
      err instanceof Error ? err.message : String(err)
    );
  }
  return memoryAuditLogs.slice(0, limitCount);
}

/**
 * Creates a single-use approval token in Firestore tied to `caseId` and `portalUrl`,
 * recording who approved it and when.
 */
export async function createApprovalToken(params: {
  caseId: string;
  portalUrl: string;
  approvedBy: string;
}): Promise<ApprovalTokenRecord> {
  const record: ApprovalTokenRecord = {
    token: `tok_${crypto.randomBytes(24).toString('hex')}`,
    caseId: params.caseId,
    portalUrl: params.portalUrl.trim() || '/portal',
    approvedBy: params.approvedBy.trim(),
    approvedAt: new Date().toISOString(),
    used: false,
    revoked: false,
  };

  memoryTokens.set(record.token, record);
  if (!isMemoryOnlyTestMode()) {
    try {
      const db = getFirestore();
      await db.collection('approval_tokens').doc(record.token).set(record);
      console.info(
        `[firestore] Created single-use approval token for case=${record.caseId} portal=${record.portalUrl}`
      );
    } catch (err) {
      console.warn(
        '[firestore] Could not save approval token to Firestore, kept in local memory:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return record;
}

export async function revokeTokensForCase(caseId: string): Promise<void> {
  for (const tok of memoryTokens.values()) {
    if (tok.caseId === caseId) {
      tok.revoked = true;
    }
  }
  if (isMemoryOnlyTestMode()) return;
  try {
    const db = getFirestore();
    const snap = await db.collection('approval_tokens').where('caseId', '==', caseId).get();
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, { revoked: true });
    }
    if (!snap.empty) {
      await batch.commit();
    }
  } catch (err) {
    console.warn(
      '[firestore] Could not revoke tokens in Firestore:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

export interface ConsumeTokenResult {
  valid: boolean;
  reason?: string;
  record?: ApprovalTokenRecord;
}

/**
 * Verifies a single-use token is valid for (caseId, portalUrl), unused, and unrevoked,
 * then immediately marks it `used = true` so it cannot be replayed.
 */
export async function verifyAndConsumeApprovalToken(params: {
  token: string;
  caseId: string;
  portalUrl: string;
}): Promise<ConsumeTokenResult> {
  const { token, caseId, portalUrl } = params;
  if (!token) {
    return { valid: false, reason: 'Missing counselor approval token.' };
  }

  if (isMemoryOnlyTestMode()) {
    const mem = memoryTokens.get(token);
    if (!mem) return { valid: false, reason: 'Approval token not found.' };
    if (mem.revoked) return { valid: false, reason: 'Approval token has been revoked.' };
    if (mem.used) return { valid: false, reason: 'Approval token has already been used (single-use).' };
    if (mem.caseId !== caseId) return { valid: false, reason: 'Approval token does not match this case ID.' };
    if (mem.portalUrl !== portalUrl) return { valid: false, reason: 'Approval token is tied to a different portal URL.' };
    mem.used = true;
    mem.usedAt = new Date().toISOString();
    return { valid: true, record: { ...mem } };
  }

  try {
    const db = getFirestore();
    const ref = db.collection('approval_tokens').doc(token);
    const result = await db.runTransaction<ConsumeTokenResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { valid: false, reason: 'Approval token not found.' };
      }
      const data = snap.data() as ApprovalTokenRecord;
      if (data.revoked) {
        return { valid: false, reason: 'Approval token has been revoked.' };
      }
      if (data.used) {
        return { valid: false, reason: 'Approval token has already been used (single-use).' };
      }
      if (data.caseId !== caseId) {
        return { valid: false, reason: 'Approval token does not match this case ID.' };
      }
      if (data.portalUrl !== portalUrl) {
        return { valid: false, reason: 'Approval token is tied to a different portal URL.' };
      }
      const usedAt = new Date().toISOString();
      tx.update(ref, { used: true, usedAt });
      return { valid: true, record: { ...data, used: true, usedAt } };
    });
    return result;
  } catch (err) {
    console.warn(
      '[firestore] Transaction failed on approval token, checking memory store:',
      err instanceof Error ? err.message : String(err)
    );
    const mem = memoryTokens.get(token);
    if (!mem) return { valid: false, reason: 'Approval token not found.' };
    if (mem.revoked) return { valid: false, reason: 'Approval token has been revoked.' };
    if (mem.used) return { valid: false, reason: 'Approval token has already been used (single-use).' };
    if (mem.caseId !== caseId) return { valid: false, reason: 'Approval token does not match this case ID.' };
    if (mem.portalUrl !== portalUrl) return { valid: false, reason: 'Approval token is tied to a different portal URL.' };
    mem.used = true;
    mem.usedAt = new Date().toISOString();
    return { valid: true, record: { ...mem } };
  }
}

/**
 * DPDP Delete My Data: deletes the case, all its facts/quotes/flags/consent,
 * and deletes any approval tokens tied to the case.
 */
export async function deleteCaseAndData(
  caseId: string
): Promise<{ deleted: boolean; deletedAt: string }> {
  const deletedAt = new Date().toISOString();
  let existed = memoryCases.delete(caseId);

  for (const [key, tok] of memoryTokens.entries()) {
    if (tok.caseId === caseId) {
      memoryTokens.delete(key);
    }
  }

  if (!isMemoryOnlyTestMode()) {
    try {
      const db = getFirestore();
      const caseRef = db.collection('cases').doc(caseId);
      const snap = await caseRef.get();
      if (snap.exists) {
        existed = true;
        await caseRef.delete();
      }

      const tokenSnap = await db.collection('approval_tokens').where('caseId', '==', caseId).get();
      if (!tokenSnap.empty) {
        const batch = db.batch();
        for (const doc of tokenSnap.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
      }
    } catch (err) {
      console.warn(
        `[firestore] Delete failed for cases/${caseId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  if (existed) {
    await appendAuditLog({
      actor: 'student',
      action: 'delete_my_data',
      caseId,
      details: 'Case, extracted facts, quotes, flags, consent record, and tokens permanently deleted.',
    });
  }

  return { deleted: existed, deletedAt };
}

export async function getCounselorSettings(): Promise<CounselorSettings> {
  if (isMemoryOnlyTestMode()) {
    return memorySettings ?? getDefaultCounselorSettings();
  }
  try {
    const db = getFirestore();
    const snap = await db.collection('settings').doc('global').get();
    if (snap.exists) {
      return snap.data() as CounselorSettings;
    }
  } catch (err) {
    console.warn(
      '[firestore] Could not load settings/global, using defaults:',
      err instanceof Error ? err.message : String(err)
    );
  }
  return memorySettings ?? getDefaultCounselorSettings();
}

export async function saveCounselorSettings(
  settings: CounselorSettings
): Promise<CounselorSettings> {
  memorySettings = settings;
  if (isMemoryOnlyTestMode()) {
    return settings;
  }
  try {
    const db = getFirestore();
    await db.collection('settings').doc('global').set(settings);
  } catch (err) {
    console.warn(
      '[firestore] Could not save settings/global to Firestore, kept in memory:',
      err instanceof Error ? err.message : String(err)
    );
  }
  return settings;
}

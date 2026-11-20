import { Firestore } from '@google-cloud/firestore';
import type { CaseRecord } from '../schemas/case.js';

let firestoreClient: Firestore | null = null;
const memoryFallbackStore = new Map<string, CaseRecord>();

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

/**
 * Stores ONLY structured facts, quotes, flags, status, consent, and authorisation in Firestore (`cases/{id}`).
 * NEVER stores uploaded document bytes or files.
 */
export async function saveCaseRecord(record: CaseRecord): Promise<'firestore' | 'memory_fallback'> {
  try {
    const db = getFirestore();
    await db.collection('cases').doc(record.id).set({
      ...record,
      storageBackend: 'firestore',
    });
    console.info(`[firestore] Saved cases/${record.id} (facts=${record.facts.length}, flags=${record.flags.length})`);
    return 'firestore';
  } catch (err) {
    console.warn(
      `[firestore] Could not write cases/${record.id} to Firestore, using local memory fallback:`,
      err instanceof Error ? err.message : String(err)
    );
    memoryFallbackStore.set(record.id, {
      ...record,
      storageBackend: 'memory_fallback',
    });
    return 'memory_fallback';
  }
}

export async function getCaseRecord(caseId: string): Promise<CaseRecord | null> {
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
  return memoryFallbackStore.get(caseId) ?? null;
}

import { adminDb } from './firebaseAdmin';
import crypto from 'crypto';

/** Shared per-user limit across serverless instances. A rejected request never calls the AI or checkout. */
export async function enforceUserRateLimit(
  uid: string,
  operation: 'analyze' | 'chat' | 'order' | 'tool_session_start' | 'tool_session_renew',
  maximum: number,
  periodMs = 60_000,
): Promise<boolean> {
  const period = Math.floor(Date.now() / periodMs);
  const uidHash = crypto.createHash('sha256').update(uid).digest('hex');
  const ref = adminDb.collection('rateLimits').doc(`${uidHash}_${operation}_${period}`);
  return adminDb.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref);
    const count = snapshot.exists ? Number(snapshot.data().count) || 0 : 0;
    if (count >= maximum) return false;
    tx.set(ref, { uid, operation, period, count: count + 1, expiresAt: (period + 2) * periodMs });
    return true;
  });
}

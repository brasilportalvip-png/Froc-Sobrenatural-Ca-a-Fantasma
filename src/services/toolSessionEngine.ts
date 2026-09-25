import { adminDb } from './firebaseAdmin';
import { PremiumToolId, ToolSession, UserWallet, LedgerEntry } from '../types';
import { getToolPricing, isValidPremiumTool } from './toolPricing';

/**
 * Motor Central de Sessões Temporizadas por Ferramenta
 * 
 * Responsabilidades:
 * - Controle autoritativo de sessões no Firestore com transações atômicas.
 * - Cobrança inicial de 5 créditos por 4 minutos de utilização contínua.
 * - Suporte a auto-renovação e renovação manual com idempotência estrita.
 * - Encerramento de sessão e verificação de acesso para endpoints de API.
 */

export interface StartSessionResult {
  success: boolean;
  session: ToolSession;
  balanceAfter: number;
}

export interface RenewSessionResult {
  success: boolean;
  session: ToolSession;
  balanceAfter: number;
}

export async function startToolSession(
  uid: string,
  toolId: PremiumToolId,
  autoRenew: boolean = false,
  requestId: string
): Promise<StartSessionResult> {
  if (!isValidPremiumTool(toolId)) {
    throw new Error(`FERRAMENTA_INVALIDA: ${toolId}`);
  }

  const pricing = getToolPricing(toolId);
  const cost = pricing.costCredits;
  const durationMs = pricing.durationSeconds * 1000;

  const walletRef = adminDb.collection('wallets').doc(uid);
  const toolSessionRef = adminDb.collection('toolSessions').doc(requestId);
  const lockRef = adminDb.collection('toolSessionLocks').doc(`${uid}_${toolId}`);
  const ledgerRef = walletRef.collection('ledger').doc();

  return await adminDb.runTransaction(async (t: any) => {
    // 1. Idempotência estrita: se a sessão já foi criada para este requestId
    const existingReqSnap = await t.get(toolSessionRef);
    if (existingReqSnap.exists) {
      const existingSession = existingReqSnap.data() as ToolSession;
      if (existingSession.uid !== uid) {
        throw new Error('REQUEST_UID_MISMATCH');
      }
      const wSnap = await t.get(walletRef);
      const wData = wSnap.data() as UserWallet;
      return {
        success: true,
        session: existingSession,
        balanceAfter: wData?.balance ?? 0,
      };
    }

    const now = Date.now();

    // 2. Lock determinístico por uid + toolId (O(1) sem necessidade de queries dinâmicas na transação)
    const lockSnap = await t.get(lockRef);
    if (lockSnap.exists) {
      const lockData = lockSnap.data();
      if (lockData.status === 'active' && lockData.expiresAt > now && lockData.activeSessionId) {
        const activeDocSnap = await t.get(adminDb.collection('toolSessions').doc(lockData.activeSessionId));
        if (activeDocSnap.exists) {
          const s = activeDocSnap.data() as ToolSession;
          if (s.status === 'active' && s.expiresAt > now) {
            const wSnap = await t.get(walletRef);
            const wData = wSnap.data() as UserWallet;
            return {
              success: true,
              session: s,
              balanceAfter: wData?.balance ?? 0,
            };
          }
        }
      }
    }

    // 3. Obter e validar saldo da carteira
    const walletSnap = await t.get(walletRef);
    let wallet: UserWallet;
    if (!walletSnap.exists) {
      wallet = {
        uid,
        balance: 0,
        reserved: 0,
        promotionalGranted: 0,
        purchasedTotal: 0,
        manualGrantedTotal: 0,
        spentTotal: 0,
        debtAmount: 0,
        version: 1,
        updatedAt: now,
      };
      t.set(walletRef, wallet);
      throw new Error('INSUFFICIENT_BALANCE');
    } else {
      wallet = walletSnap.data() as UserWallet;
    }

    if (wallet.balance < cost) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // 4. Débito atômico
    const newBalance = wallet.balance - cost;
    const newSpent = (wallet.spentTotal || 0) + cost;

    t.update(walletRef, {
      balance: newBalance,
      spentTotal: newSpent,
      version: (wallet.version || 1) + 1,
      updatedAt: now,
    });

    // 5. Criar registro da sessão
    const newSession: ToolSession = {
      toolSessionId: toolSessionRef.id,
      uid,
      toolId,
      status: 'active',
      startedAt: now,
      expiresAt: now + durationMs,
      durationSeconds: pricing.durationSeconds,
      costCredits: cost,
      autoRenew: !!autoRenew,
      renewalCount: 0,
      createdAt: now,
      requestId,
    };

    t.set(toolSessionRef, newSession);

    // Atualizar lock determinístico atômico por UID + ToolId
    const lockData: any = {
      uid,
      toolId,
      activeSessionId: toolSessionRef.id,
      expiresAt: now + durationMs,
      status: 'active',
      autoRenewCount: 0,
      maxAutoRenewals: 5,
      updatedAt: now,
    };
    t.set(lockRef, lockData, { merge: true });

    // 6. Registro no Ledger de auditoria
    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'tool_session',
      amount: -cost,
      balanceAfter: newBalance,
      description: `Sessão iniciada: ${pricing.name} (${pricing.durationSeconds / 60} min)`,
      referenceId: toolSessionRef.id,
      timestamp: now,
    };
    t.set(ledgerRef, ledgerEntry);

    return {
      success: true,
      session: newSession,
      balanceAfter: newBalance,
    };
  });
}

export async function renewToolSession(
  uid: string,
  toolSessionId: string,
  requestId: string
): Promise<RenewSessionResult> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const toolSessionRef = adminDb.collection('toolSessions').doc(toolSessionId);
  const ledgerRef = walletRef.collection('ledger').doc();

  return await adminDb.runTransaction(async (t: any) => {
    const sessionSnap = await t.get(toolSessionRef);
    if (!sessionSnap.exists) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const session = sessionSnap.data() as ToolSession;
    if (session.uid !== uid) {
      throw new Error('SESSION_UID_MISMATCH');
    }

    // Idempotência na renovação
    if ((session as any).lastRenewRequestId === requestId) {
      const wSnap = await t.get(walletRef);
      const wData = wSnap.data() as UserWallet;
      return {
        success: true,
        session,
        balanceAfter: wData?.balance ?? 0,
      };
    }

    const pricing = getToolPricing(session.toolId);
    const cost = pricing.costCredits;
    const durationMs = pricing.durationSeconds * 1000;

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) {
      throw new Error('WALLET_NOT_FOUND');
    }

    const wallet = walletSnap.data() as UserWallet;
    if (wallet.balance < cost) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const now = Date.now();
    const newBalance = wallet.balance - cost;
    const newSpent = (wallet.spentTotal || 0) + cost;

    t.update(walletRef, {
      balance: newBalance,
      spentTotal: newSpent,
      version: (wallet.version || 1) + 1,
      updatedAt: now,
    });

    // Verificar limite máximo de renovações automáticas (proteção contra esgotamento involuntário)
    const currentAutoCount = session.autoRenewCount || 0;
    const maxAuto = session.maxAutoRenewals || 5;
    if (session.autoRenew && currentAutoCount >= maxAuto) {
      throw new Error('MAX_AUTORENEWALS_REACHED');
    }

    // Se a sessão ainda não tinha expirado completamente, estender a partir de expiresAt
    // Se já havia expirado, iniciar novo ciclo a partir de now
    const baseTime = session.expiresAt > now ? session.expiresAt : now;
    const newExpiresAt = baseTime + durationMs;
    const newRenewalCount = (session.renewalCount || 0) + 1;
    const newAutoRenewCount = session.autoRenew ? currentAutoCount + 1 : currentAutoCount;
    const shouldDisableAuto = session.autoRenew && newAutoRenewCount >= maxAuto;

    const updatedFields: Partial<ToolSession> & { lastRenewRequestId: string } = {
      expiresAt: newExpiresAt,
      renewalCount: newRenewalCount,
      autoRenewCount: newAutoRenewCount,
      autoRenew: shouldDisableAuto ? false : session.autoRenew,
      lastRenewedAt: now,
      status: 'active',
      lastRenewRequestId: requestId,
    };

    t.update(toolSessionRef, updatedFields);

    const lockRef = adminDb.collection('toolSessionLocks').doc(`${uid}_${session.toolId}`);
    t.set(
      lockRef,
      {
        uid,
        toolId: session.toolId,
        activeSessionId: toolSessionId,
        expiresAt: newExpiresAt,
        status: 'active',
        autoRenewCount: newAutoRenewCount,
        maxAutoRenewals: maxAuto,
        updatedAt: now,
      },
      { merge: true }
    );

    const updatedSession: ToolSession = {
      ...session,
      ...updatedFields,
    };

    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'tool_session_renewal',
      amount: -cost,
      balanceAfter: newBalance,
      description: `Renovação de sessão (+${pricing.durationSeconds / 60} min): ${pricing.name}`,
      referenceId: toolSessionId,
      timestamp: now,
    };
    t.set(ledgerRef, ledgerEntry);

    return {
      success: true,
      session: updatedSession,
      balanceAfter: newBalance,
    };
  });
}

export async function toggleAutoRenew(
  uid: string,
  toolSessionId: string,
  autoRenew: boolean
): Promise<ToolSession> {
  const toolSessionRef = adminDb.collection('toolSessions').doc(toolSessionId);
  const snap = await toolSessionRef.get();
  if (!snap.exists) throw new Error('SESSION_NOT_FOUND');
  const session = snap.data() as ToolSession;
  if (session.uid !== uid) throw new Error('SESSION_UID_MISMATCH');

  await toolSessionRef.update({
    autoRenew: !!autoRenew,
    updatedAt: Date.now(),
  });

  return {
    ...session,
    autoRenew: !!autoRenew,
  };
}

export async function endToolSession(
  uid: string,
  toolSessionId: string
): Promise<ToolSession> {
  const toolSessionRef = adminDb.collection('toolSessions').doc(toolSessionId);
  const snap = await toolSessionRef.get();
  if (!snap.exists) throw new Error('SESSION_NOT_FOUND');
  const session = snap.data() as ToolSession;
  if (session.uid !== uid) throw new Error('SESSION_UID_MISMATCH');

  const now = Date.now();
  await toolSessionRef.update({
    status: 'ended',
    endedAt: now,
  });

  const lockRef = adminDb.collection('toolSessionLocks').doc(`${uid}_${session.toolId}`);
  await lockRef.set({ status: 'ended', updatedAt: now }, { merge: true }).catch(() => {});

  return {
    ...session,
    status: 'ended',
    endedAt: now,
  };
}

export async function getActiveToolSession(
  uid: string,
  toolId: PremiumToolId
): Promise<ToolSession | null> {
  const now = Date.now();

  // 1. Tentar leitura direta via Lock determinístico (O(1))
  const lockRef = adminDb.collection('toolSessionLocks').doc(`${uid}_${toolId}`);
  const lockSnap = await lockRef.get().catch(() => null);
  if (lockSnap?.exists) {
    const lockData = lockSnap.data();
    if (lockData?.status === 'active' && lockData?.expiresAt > now && lockData?.activeSessionId) {
      const activeDocSnap = await adminDb.collection('toolSessions').doc(lockData.activeSessionId).get().catch(() => null);
      if (activeDocSnap?.exists) {
        const session = activeDocSnap.data() as ToolSession;
        if (session.status === 'active' && session.expiresAt > now) {
          return session;
        }
      }
    }
  }

  // 2. Fallback de consulta
  const snaps = await adminDb.collection('toolSessions')
    .where('uid', '==', uid)
    .where('toolId', '==', toolId)
    .where('status', '==', 'active')
    .limit(5)
    .get();

  for (const doc of snaps.docs) {
    const session = doc.data() as ToolSession;
    if (session.expiresAt > now) {
      return session;
    } else {
      // Lazy status update
      doc.ref.update({ status: 'expired' }).catch(() => {});
    }
  }

  return null;
}

export async function validateToolAccess(
  uid: string,
  toolId: PremiumToolId,
  toolSessionId?: string
): Promise<{ allowed: boolean; session?: ToolSession; reason?: string }> {
  const now = Date.now();

  if (toolSessionId) {
    const snap = await adminDb.collection('toolSessions').doc(toolSessionId).get();
    if (snap.exists) {
      const session = snap.data() as ToolSession;
      if (session.uid === uid && session.toolId === toolId && session.status === 'active' && session.expiresAt > now) {
        return { allowed: true, session };
      }
    }
  }

  // Fallback para procurar qualquer sessão ativa válida do usuário para essa ferramenta
  const activeSession = await getActiveToolSession(uid, toolId);
  if (activeSession) {
    return { allowed: true, session: activeSession };
  }

  return { allowed: false, reason: 'Nenhuma sessão ativa válida para esta ferramenta.' };
}

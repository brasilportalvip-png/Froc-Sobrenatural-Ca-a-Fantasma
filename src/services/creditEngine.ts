import { adminDb } from './firebaseAdmin';
import { UserWallet, LedgerEntry } from '../types';

/**
 * Máquina de Estados de Créditos com Transações Atômicas no Firestore
 * 
 * Regras:
 * - 25 créditos grátis concedidos estritamente 1 vez após verificação de e-mail e checagem anti-fraude.
 * - Cada consulta confirmada custa exatamente 5 créditos.
 * - Created -> Reserved -> Processing -> Completed ou Failed_Released.
 * - Reconciliação atômica: se falha técnica, +5 créditos devolvidos (liberação da reserva).
 * - "Nenhuma resposta identificada" após processamento bem-sucedido é consulta válida cobrada (5 créditos).
 */

export async function getOrCreateWallet(uid: string): Promise<UserWallet> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const snap = await walletRef.get();

  if (snap.exists) {
    return snap.data() as UserWallet;
  }

  const initialWallet: UserWallet = {
    uid,
    balance: 0,
    reserved: 0,
    promotionalGranted: 0,
    purchasedTotal: 0,
    spentTotal: 0,
    version: 1,
    updatedAt: Date.now(),
  };

  await walletRef.set(initialWallet);
  return initialWallet;
}

/**
 * Concede 25 créditos gratuitos de forma idempotente em transação Firestore
 */
export async function claimFreeGrant(uid: string, userEmail?: string, emailVerified: boolean = false): Promise<{ success: boolean; message: string; balance: number }> {
  if (!emailVerified) {
    return {
      success: false,
      message: 'É necessário verificar o seu e-mail antes de resgatar os 25 créditos de boas-vindas.',
      balance: 0,
    };
  }

  const grantRef = adminDb.collection('freeGrants').doc(uid);
  const walletRef = adminDb.collection('wallets').doc(uid);
  const ledgerRef = walletRef.collection('ledger').doc();

  try {
    const result = await adminDb.runTransaction(async (t: any) => {
      const grantSnap = await t.get(grantRef);
      if (grantSnap.exists) {
        throw new Error('ALREADY_CLAIMED');
      }

      const walletSnap = await t.get(walletRef);
      let currentWallet: UserWallet;

      if (!walletSnap.exists) {
        currentWallet = {
          uid,
          balance: 0,
          reserved: 0,
          promotionalGranted: 0,
          purchasedTotal: 0,
          spentTotal: 0,
          version: 1,
          updatedAt: Date.now(),
        };
      } else {
        currentWallet = walletSnap.data() as UserWallet;
      }

      const newBalance = currentWallet.balance + 25;
      const updatedWallet: UserWallet = {
        ...currentWallet,
        balance: newBalance,
        promotionalGranted: (currentWallet.promotionalGranted || 0) + 25,
        version: currentWallet.version + 1,
        updatedAt: Date.now(),
      };

      const ledgerEntry: LedgerEntry = {
        id: ledgerRef.id,
        uid,
        type: 'free_grant',
        amount: 25,
        balanceAfter: newBalance,
        description: 'Bônus de boas-vindas: 25 créditos para experimentar (até 5 consultas)',
        timestamp: Date.now(),
      };

      // Atomic batch within transaction
      t.set(grantRef, {
        uid,
        email: userEmail || '',
        grantedAt: Date.now(),
        amount: 25,
      });

      t.set(walletRef, updatedWallet);
      t.set(ledgerRef, ledgerEntry);

      return newBalance;
    });

    return {
      success: true,
      message: '25 créditos promocionais concedidos com sucesso! Você pode realizar até 5 consultas periciais.',
      balance: result,
    };
  } catch (err: any) {
    if (err.message === 'ALREADY_CLAIMED') {
      const w = await getOrCreateWallet(uid);
      return {
        success: false,
        message: 'O bônus de 25 créditos já foi concedido anteriormente para esta conta.',
        balance: w.balance,
      };
    }
    console.error('[CreditEngine] Erro ao conceder free grant:', err);
    throw err;
  }
}

/**
 * Reserva 5 créditos antes de chamar a IA. Retorna ID da consulta e novo saldo.
 */
export async function reserveConsultationCredits(uid: string, requestId: string): Promise<{ success: boolean; consultationId: string; balanceAfter: number; reservedAfter: number }> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const consultationRef = adminDb.collection('consultations').doc(requestId);
  const ledgerRef = walletRef.collection('ledger').doc();

  return await adminDb.runTransaction(async (t: any) => {
    // Idempotency check: if consultation already exists for this requestId, return current status
    const consultSnap = await t.get(consultationRef);
    if (consultSnap.exists) {
      const cData = consultSnap.data() as any;
      const wSnap = await t.get(walletRef);
      const wData = wSnap.data() as UserWallet;
      return {
        success: true,
        consultationId: consultationRef.id,
        balanceAfter: wData.balance,
        reservedAfter: wData.reserved,
      };
    }

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) {
      throw new Error('WALLET_NOT_FOUND');
    }

    const wallet = walletSnap.data() as UserWallet;
    if (wallet.balance < 5) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const newBalance = wallet.balance - 5;
    const newReserved = (wallet.reserved || 0) + 5;

    t.update(walletRef, {
      balance: newBalance,
      reserved: newReserved,
      version: wallet.version + 1,
      updatedAt: Date.now(),
    });

    t.set(consultationRef, {
      id: consultationRef.id,
      requestId,
      uid,
      creditsReserved: 5,
      creditsCommitted: 0,
      status: 'reserved',
      createdAt: Date.now(),
    });

    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'consultation_reserve',
      amount: -5,
      balanceAfter: newBalance,
      description: 'Reserva para análise de sinal (5 créditos)',
      referenceId: requestId,
      timestamp: Date.now(),
    };
    t.set(ledgerRef, ledgerEntry);

    return {
      success: true,
      consultationId: consultationRef.id,
      balanceAfter: newBalance,
      reservedAfter: newReserved,
    };
  });
}

/**
 * Conclui a consulta convertendo a reserva em débito definitivo (spentTotal + 5, reserved - 5)
 */
export async function commitConsultationCredits(uid: string, requestId: string, modelUsed: string, executionTimeMs: number): Promise<void> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const consultationRef = adminDb.collection('consultations').doc(requestId);
  const ledgerRef = walletRef.collection('ledger').doc();

  await adminDb.runTransaction(async (t: any) => {
    const consultSnap = await t.get(consultationRef);
    if (!consultSnap.exists) return;
    const cData = consultSnap.data() as any;
    if (cData.status === 'completed') return; // Idempotent

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) return;
    const wallet = walletSnap.data() as UserWallet;

    const newReserved = Math.max(0, (wallet.reserved || 0) - 5);
    const newSpent = (wallet.spentTotal || 0) + 5;

    t.update(walletRef, {
      reserved: newReserved,
      spentTotal: newSpent,
      version: wallet.version + 1,
      updatedAt: Date.now(),
    });

    t.update(consultationRef, {
      status: 'completed',
      creditsCommitted: 5,
      modelUsed,
      executionTimeMs,
      completedAt: Date.now(),
    });

    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'consultation_commit',
      amount: 0, // O saldo já foi debitado na reserva; esta entrada registra o gasto definitivo
      balanceAfter: wallet.balance,
      description: `Consulta concluída via ${modelUsed} (${executionTimeMs}ms)`,
      referenceId: requestId,
      timestamp: Date.now(),
    };
    t.set(ledgerRef, ledgerEntry);
  });
}

/**
 * Libera os 5 créditos em caso de falha técnica de processamento
 */
export async function releaseConsultationCredits(uid: string, requestId: string, errorReason: string): Promise<void> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const consultationRef = adminDb.collection('consultations').doc(requestId);
  const ledgerRef = walletRef.collection('ledger').doc();

  await adminDb.runTransaction(async (t: any) => {
    const consultSnap = await t.get(consultationRef);
    if (!consultSnap.exists) return;
    const cData = consultSnap.data() as any;
    if (cData.status === 'failed_released' || cData.status === 'completed') return;

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) return;
    const wallet = walletSnap.data() as UserWallet;

    const newBalance = wallet.balance + 5;
    const newReserved = Math.max(0, (wallet.reserved || 0) - 5);

    t.update(walletRef, {
      balance: newBalance,
      reserved: newReserved,
      version: wallet.version + 1,
      updatedAt: Date.now(),
    });

    t.update(consultationRef, {
      status: 'failed_released',
      errorReason,
      releasedAt: Date.now(),
    });

    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'consultation_release',
      amount: +5,
      balanceAfter: newBalance,
      description: `Estorno automático: Falha técnica na análise (${errorReason})`,
      referenceId: requestId,
      timestamp: Date.now(),
    };
    t.set(ledgerRef, ledgerEntry);
  });
}

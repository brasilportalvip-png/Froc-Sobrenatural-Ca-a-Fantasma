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

  return await adminDb.runTransaction(async (t: any) => {
    const snap = await t.get(walletRef);
    if (snap.exists) {
      return snap.data() as UserWallet;
    }

    const initialWallet: UserWallet = {
      uid,
      balance: 0,
      reserved: 0,
      promotionalGranted: 0,
      purchasedTotal: 0,
      manualGrantedTotal: 0,
      spentTotal: 0,
      debtAmount: 0,
      version: 1,
      updatedAt: Date.now(),
    };

    t.set(walletRef, initialWallet);
    return initialWallet;
  });
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
 * Suporta idempotência estrita com hash da requisição e detecção de replay.
 */
export async function reserveConsultationCredits(
  uid: string,
  requestId: string,
  payloadHash?: string
): Promise<{ success: boolean; consultationId: string; balanceAfter: number; reservedAfter: number; cachedResult?: any }> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const consultationRef = adminDb.collection('consultations').doc(requestId);
  const ledgerRef = walletRef.collection('ledger').doc();

  return await adminDb.runTransaction(async (t: any) => {
    // Idempotency check: if consultation already exists for this requestId, check status
    const consultSnap = await t.get(consultationRef);
    if (consultSnap.exists) {
      const cData = consultSnap.data() as any;
      if (cData.uid !== uid) {
        throw new Error('REQUEST_UID_MISMATCH');
      }
      if (!payloadHash || cData.payloadHash !== payloadHash) {
        throw new Error('REQUEST_PAYLOAD_MISMATCH');
      }
      if (cData.status === 'completed' && cData.resultData) {
        const wSnap = await t.get(walletRef);
        const wData = wSnap.data() as UserWallet;
        return {
          success: true,
          consultationId: consultationRef.id,
          balanceAfter: wData?.balance || 0,
          reservedAfter: wData?.reserved || 0,
          cachedResult: cData.resultData,
        };
      }

      // Se a reserva ficou presa ('reserved') há mais de 2 minutos (TTL de timeout serverless),
      // reabilitar esta mesma reserva reaproveitando os créditos já reservados anteriormente
      // sem debitar novamente a carteira!
      const RESERVATION_TTL_MS = 2 * 60 * 1000;
      const isStale = cData.status === 'reserved' && (Date.now() - (cData.createdAt || 0)) > RESERVATION_TTL_MS;

      if (isStale) {
        // Renovar o timestamp da reserva para reexecução segura
        t.update(consultationRef, {
          createdAt: Date.now(),
          retriedAt: Date.now(),
        });
        const wSnap = await t.get(walletRef);
        const wData = wSnap.data() as UserWallet;
        return {
          success: true,
          consultationId: consultationRef.id,
          balanceAfter: wData?.balance || 0,
          reservedAfter: wData?.reserved || 0,
        };
      }

      if (cData.status !== 'completed' || !cData.resultData) {
        throw new Error('CONSULTATION_IN_PROGRESS');
      }
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
      payloadHash: payloadHash || null,
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
 * e grava o resultado para replay idempotente.
 */
export async function commitConsultationCredits(
  uid: string,
  requestId: string,
  modelUsed: string,
  executionTimeMs: number,
  resultData?: any
): Promise<void> {
  const walletRef = adminDb.collection('wallets').doc(uid);
  const consultationRef = adminDb.collection('consultations').doc(requestId);
  const ledgerRef = walletRef.collection('ledger').doc();

  await adminDb.runTransaction(async (t: any) => {
    const consultSnap = await t.get(consultationRef);
    if (!consultSnap.exists) throw new Error('CONSULTATION_NOT_FOUND');
    const cData = consultSnap.data() as any;
    if (cData.uid !== uid) throw new Error('REQUEST_UID_MISMATCH');
    if (cData.status === 'completed') return;
    if (cData.status !== 'reserved') throw new Error('CONSULTATION_NOT_RESERVED');

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletSnap.data() as UserWallet;
    if (wallet.reserved < 5) throw new Error('INVALID_RESERVED_BALANCE');

    const newReserved = wallet.reserved - 5;
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
      resultData: resultData || null,
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
    if (!consultSnap.exists) throw new Error('CONSULTATION_NOT_FOUND');
    const cData = consultSnap.data() as any;
    if (cData.uid !== uid) throw new Error('REQUEST_UID_MISMATCH');
    if (cData.status === 'completed' || cData.status === 'failed_released') return;
    if (cData.status !== 'reserved') throw new Error('CONSULTATION_NOT_RESERVED');

    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletSnap.data() as UserWallet;
    if (wallet.reserved < 5) throw new Error('INVALID_RESERVED_BALANCE');

    const newBalance = wallet.balance + 5;
    const newReserved = wallet.reserved - 5;

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

/**
 * Reconciliação em lote ou individual de reservas órfãs presas (TTL expirado sem commit).
 * Libera os 5 créditos de volta para a carteira caso o processo tenha falhado silenciosamente.
 */
export async function reconcileStaleReservations(targetUid?: string): Promise<{ reconciledCount: number }> {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos
  const cutoff = Date.now() - STALE_THRESHOLD_MS;

  // Consulta sem índice composto: filtrar status e filtrar createdAt em memória
  let query: any = adminDb.collection('consultations')
    .where('status', '==', 'reserved')
    .limit(50);

  if (targetUid) {
    query = adminDb.collection('consultations')
      .where('uid', '==', targetUid)
      .limit(30);
  }

  let reconciledCount = 0;
  try {
    const snap = await query.get();
    for (const doc of snap.docs) {
      const cData = doc.data();
      if (cData.status === 'reserved' && (!cData.createdAt || cData.createdAt < cutoff)) {
        try {
          await releaseConsultationCredits(
            cData.uid,
            doc.id,
            'Reconciliação automática: tempo de execução excedido (reserva órfã estornada)'
          );
          reconciledCount++;
        } catch (err: any) {
          console.warn(`[CreditEngine] Falha ao reconciliar reserva órfã ${doc.id}:`, err?.message);
        }
      }
    }
  } catch (err: any) {
    console.warn('[CreditEngine] Falha ao executar consulta de reservas órfãs:', err?.message);
  }

  return { reconciledCount };
}

/**
 * Concessão ou Retirada Manual de Créditos pelo Administrador
 * - Transação atômica
 * - Leituras antes de escritas
 * - Idempotência estrita por idempotencyKey
 * - Registro em ledger com categoria, operador, motivo e auditoria
 */
export async function adminAdjustCredits(params: {
  adminUid: string;
  targetUid: string;
  action: 'grant' | 'revoke';
  amount: number;
  reason: string;
  category: 'courtesy' | 'support' | 'correction' | 'other';
  idempotencyKey: string;
  referenceId?: string;
}): Promise<{
  success: boolean;
  receipt: any;
  wallet: UserWallet;
}> {
  const { adminUid, targetUid, action, amount, reason, category, idempotencyKey, referenceId } = params;

  if (!targetUid || typeof targetUid !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) {
    throw new Error('UID de usuário alvo inválido.');
  }

  if (!amount || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('A quantidade deve ser um número inteiro positivo.');
  }

  if (amount > 1000) {
    throw new Error('Limite máximo de 1000 créditos por operação de ajuste.');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    throw new Error('O motivo do ajuste é obrigatório (mínimo 3 caracteres).');
  }

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    throw new Error('Chave de idempotência inválida (mínimo 8 caracteres).');
  }

  const validCategories = ['courtesy', 'support', 'correction', 'other'];
  if (!validCategories.includes(category)) {
    throw new Error('Categoria de ajuste inválida.');
  }

  const walletRef = adminDb.collection('wallets').doc(targetUid);
  const idempotencyRef = adminDb.collection('adminAdjustmentIdempotency').doc(idempotencyKey);
  const auditRef = adminDb.collection('auditLogs').doc();
  const ledgerRef = walletRef.collection('ledger').doc();

  return await adminDb.runTransaction(async (t: any) => {
    // 1. TODAS AS LEITURAS PRIMEIRO
    const idempSnap = await t.get(idempotencyRef);
    const walletSnap = await t.get(walletRef);

    // Se já foi processada essa chave de idempotência
    if (idempSnap.exists) {
      const existing = idempSnap.data();
      // Validar se payload é idêntico
      const isIdentical =
        existing.adminUid === adminUid &&
        existing.targetUid === targetUid &&
        existing.action === action &&
        existing.amount === amount &&
        existing.reason.trim() === reason.trim() &&
        existing.category === category &&
        (existing.referenceId || null) === (referenceId || null);

      if (!isIdentical) {
        const err: any = new Error('Conflito de Idempotência: chave já utilizada com parâmetros diferentes.');
        err.statusCode = 409;
        throw err;
      }

      // Devolver recibo original idempotente
      let currentWallet: UserWallet;
      if (walletSnap.exists) {
        currentWallet = walletSnap.data() as UserWallet;
      } else {
        currentWallet = {
          uid: targetUid,
          balance: 0,
          reserved: 0,
          promotionalGranted: 0,
          purchasedTotal: 0,
          manualGrantedTotal: 0,
          spentTotal: 0,
          version: 1,
          updatedAt: Date.now(),
        };
      }

      return {
        success: true,
        receipt: existing.receipt,
        wallet: currentWallet,
      };
    }

    // Obter ou preparar carteira
    let wallet: UserWallet;
    const walletExists = walletSnap.exists;
    if (!walletExists) {
      wallet = {
        uid: targetUid,
        balance: 0,
        reserved: 0,
        promotionalGranted: 0,
        purchasedTotal: 0,
        manualGrantedTotal: 0,
        spentTotal: 0,
        version: 1,
        updatedAt: Date.now(),
      };
    } else {
      wallet = walletSnap.data() as UserWallet;
    }

    let newBalance = wallet.balance;
    let newManualTotal = wallet.manualGrantedTotal || 0;
    let debtAmount = wallet.debtAmount || 0;

    if (action === 'grant') {
      newBalance += amount;
      newManualTotal += amount;
    } else {
      // Revoke: nunca reduz do reservado e não permite saldo negativo silencioso
      if (wallet.balance < amount) {
        const deficit = amount - wallet.balance;
        newBalance = 0;
        debtAmount += deficit; // Registra dívida compensatória transparente
      } else {
        newBalance -= amount;
      }
    }

    const previousBalance = wallet.balance;
    const now = Date.now();
    const operationId = `admin_adj_${now}_${Math.random().toString(36).substring(2, 8)}`;

    const receipt = {
      operationId,
      targetUid,
      adminUid,
      action,
      amount,
      reason: reason.trim(),
      category,
      previousBalance,
      balanceAfter: newBalance,
      timestamp: now,
      idempotencyKey,
      referenceId: referenceId || null,
    };

    // 2. TODAS AS ESCRITAS APÓS AS LEITURAS
    const updatedWalletData: any = {
      ...wallet,
      balance: newBalance,
      manualGrantedTotal: newManualTotal,
      debtAmount,
      version: (wallet.version || 1) + 1,
      updatedAt: now,
    };

    if (!walletExists) {
      t.set(walletRef, updatedWalletData);
    } else {
      t.update(walletRef, updatedWalletData);
    }

    // Ledger para o extrato do usuário
    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid: targetUid,
      type: 'admin_adjustment',
      amount: action === 'grant' ? amount : -amount,
      balanceAfter: newBalance,
      description:
        action === 'grant'
          ? `Créditos adicionados pela administração (+${amount}) - ${reason}`
          : `Ajuste de débito pela administração (-${amount}) - ${reason}`,
      referenceId: operationId,
      adminUid,
      reason,
      category,
      timestamp: now,
    };
    t.set(ledgerRef, ledgerEntry);

    // Registro na tabela de idempotência
    t.set(idempotencyRef, {
      idempotencyKey,
      adminUid,
      targetUid,
      action,
      amount,
      reason: reason.trim(),
      category,
      referenceId: referenceId || null,
      receipt,
      createdAt: now,
    });

    // Trilha de auditoria separada
    t.set(auditRef, {
      id: auditRef.id,
      type: 'admin_credit_adjustment',
      actorAdminUid: adminUid,
      targetUid,
      action,
      amount,
      reason: reason.trim(),
      category,
      previousBalance,
      balanceAfter: newBalance,
      idempotencyKey,
      timestamp: now,
    });

    return {
      success: true,
      receipt,
      wallet: updatedWalletData,
    };
  });
}

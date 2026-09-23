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
      if (payloadHash && cData.payloadHash && cData.payloadHash !== payloadHash) {
        throw new Error('REQUEST_PAYLOAD_MISMATCH');
      }
      const wSnap = await t.get(walletRef);
      const wData = wSnap.data() as UserWallet;
      return {
        success: true,
        consultationId: consultationRef.id,
        balanceAfter: wData?.balance || 0,
        reservedAfter: wData?.reserved || 0,
        cachedResult: cData.status === 'completed' ? cData.resultData : undefined,
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

/**
 * Controle de Acesso e Quota/Cobrança para o Chat Metodológico da IA:
 * - 3 consultas gratuitas por dia por usuário (quota estrita)
 * - Acima da quota diária gratuita, debita atomicamente 1 crédito por consulta de orientação metodológica
 */
export async function processChatConsultationAccess(
  uid: string
): Promise<{ allowed: boolean; isFreeTier: boolean; remainingFreeQuota: number; balanceAfter?: number; error?: string }> {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const quotaRef = adminDb.collection('userChatQuotas').doc(`${uid}_${todayStr}`);
  const walletRef = adminDb.collection('wallets').doc(uid);
  const ledgerRef = walletRef.collection('ledger').doc();

  const FREE_DAILY_QUOTA = 3;

  return await adminDb.runTransaction(async (t: any) => {
    // 1. Leituras
    const quotaSnap = await t.get(quotaRef);
    const walletSnap = await t.get(walletRef);

    const currentCount = quotaSnap.exists ? (quotaSnap.data().count || 0) : 0;

    // Se estiver dentro da quota gratuita do dia
    if (currentCount < FREE_DAILY_QUOTA) {
      const nextCount = currentCount + 1;
      t.set(quotaRef, {
        uid,
        date: todayStr,
        count: nextCount,
        updatedAt: Date.now(),
      }, { merge: true });

      return {
        allowed: true,
        isFreeTier: true,
        remainingFreeQuota: FREE_DAILY_QUOTA - nextCount,
      };
    }

    // Quota gratuita esgotada: requer saldo (1 crédito)
    if (!walletSnap.exists) {
      return {
        allowed: false,
        isFreeTier: false,
        remainingFreeQuota: 0,
        error: 'Quota diária gratuita excedida (3/3). Adicione créditos para continuar consultando o assistente de IA.',
      };
    }

    const wallet = walletSnap.data() as UserWallet;
    if (wallet.balance < 1) {
      return {
        allowed: false,
        isFreeTier: false,
        remainingFreeQuota: 0,
        error: 'Quota diária gratuita esgotada (3/3) e saldo insuficiente. É necessário 1 crédito por consulta adicional.',
      };
    }

    const newBalance = wallet.balance - 1;
    const newSpent = (wallet.spentTotal || 0) + 1;

    t.update(walletRef, {
      balance: newBalance,
      spentTotal: newSpent,
      version: (wallet.version || 1) + 1,
      updatedAt: Date.now(),
    });

    const ledgerEntry: LedgerEntry = {
      id: ledgerRef.id,
      uid,
      type: 'consultation_commit',
      amount: -1,
      balanceAfter: newBalance,
      description: 'Consulta adicional ao Assistente Metodológico de IA (1 crédito)',
      referenceId: `chat_${Date.now()}`,
      timestamp: Date.now(),
    };
    t.set(ledgerRef, ledgerEntry);

    t.set(quotaRef, {
      uid,
      date: todayStr,
      count: currentCount + 1,
      updatedAt: Date.now(),
    }, { merge: true });

    return {
      allowed: true,
      isFreeTier: false,
      remainingFreeQuota: 0,
      balanceAfter: newBalance,
    };
  });
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

  if (!targetUid || typeof targetUid !== 'string' || targetUid.trim().length === 0) {
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
        existing.reason.trim() === reason.trim();

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



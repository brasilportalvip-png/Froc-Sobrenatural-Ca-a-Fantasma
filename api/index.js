// src/serverApp.ts
import express from "express";
import dotenv from "dotenv";
import crypto3 from "crypto";
import { GoogleGenAI } from "@google/genai";

// src/services/firebaseAdmin.ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// src/services/firebaseConfig.ts
var firebaseConfig = {
  projectId: "froc-sobrenatural",
  appId: "1:284776343207:web:70ec39f9f69a3bde2c5d82",
  apiKey: "AIzaSyDtW6pOZu17wtBe8d-ZtBc7OcTtaq-j18g",
  authDomain: "froc-sobrenatural.firebaseapp.com",
  firestoreDatabaseId: "",
  storageBucket: "froc-sobrenatural.firebasestorage.app",
  messagingSenderId: "284776343207",
  measurementId: "G-RDT9SEM7KD"
};
var firebaseConfig_default = firebaseConfig;

// src/services/firebaseAdmin.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var appInstance = null;
if (!getApps().length) {
  let credentials = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.warn("[Firebase Admin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_KEY do env:", e);
    }
  }
  if (!credentials) {
    const candidatePaths = [
      path.resolve(process.cwd(), "firebase-service-account.json"),
      path.resolve(process.cwd(), "..", "firebase-service-account.json"),
      path.resolve(__dirname, "../../firebase-service-account.json"),
      path.resolve(__dirname, "../firebase-service-account.json")
    ];
    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf-8");
          credentials = JSON.parse(raw);
          break;
        }
      } catch {
      }
    }
  }
  try {
    if (credentials && credentials.private_key) {
      appInstance = initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id || firebaseConfig_default.projectId,
        storageBucket: firebaseConfig_default.storageBucket
      });
      console.log(`[Firebase Admin] Inicializado com sucesso com Service Account para projeto: ${credentials.project_id}`);
    } else {
      console.warn("[Firebase Admin] Credenciais de Service Account n\xE3o encontradas. Inicializando com projectId de fallback.");
      appInstance = initializeApp({
        projectId: firebaseConfig_default.projectId,
        storageBucket: firebaseConfig_default.storageBucket
      });
    }
  } catch (err) {
    console.error("[Firebase Admin] Erro durante inicializa\xE7\xE3o do Admin App:", err);
    try {
      appInstance = initializeApp({
        projectId: firebaseConfig_default.projectId,
        storageBucket: firebaseConfig_default.storageBucket
      });
    } catch (fallbackErr) {
      console.error("[Firebase Admin] Erro de fallback:", fallbackErr);
    }
  }
} else {
  appInstance = getApps()[0];
}
var adminAuth = getAuth(appInstance);
var adminDb = getFirestore(appInstance);

// src/services/creditEngine.ts
async function getOrCreateWallet(uid) {
  const walletRef = adminDb.collection("wallets").doc(uid);
  return await adminDb.runTransaction(async (t) => {
    const snap = await t.get(walletRef);
    if (snap.exists) {
      return snap.data();
    }
    const initialWallet = {
      uid,
      balance: 0,
      reserved: 0,
      promotionalGranted: 0,
      purchasedTotal: 0,
      manualGrantedTotal: 0,
      spentTotal: 0,
      debtAmount: 0,
      version: 1,
      updatedAt: Date.now()
    };
    t.set(walletRef, initialWallet);
    return initialWallet;
  });
}
async function claimFreeGrant(uid, userEmail, emailVerified = false) {
  if (!emailVerified) {
    return {
      success: false,
      message: "\xC9 necess\xE1rio verificar o seu e-mail antes de resgatar os 25 cr\xE9ditos de boas-vindas.",
      balance: 0
    };
  }
  const grantRef = adminDb.collection("freeGrants").doc(uid);
  const walletRef = adminDb.collection("wallets").doc(uid);
  const ledgerRef = walletRef.collection("ledger").doc();
  try {
    const result = await adminDb.runTransaction(async (t) => {
      const grantSnap = await t.get(grantRef);
      if (grantSnap.exists) {
        throw new Error("ALREADY_CLAIMED");
      }
      const walletSnap = await t.get(walletRef);
      let currentWallet;
      if (!walletSnap.exists) {
        currentWallet = {
          uid,
          balance: 0,
          reserved: 0,
          promotionalGranted: 0,
          purchasedTotal: 0,
          spentTotal: 0,
          version: 1,
          updatedAt: Date.now()
        };
      } else {
        currentWallet = walletSnap.data();
      }
      const newBalance = currentWallet.balance + 25;
      const updatedWallet = {
        ...currentWallet,
        balance: newBalance,
        promotionalGranted: (currentWallet.promotionalGranted || 0) + 25,
        version: currentWallet.version + 1,
        updatedAt: Date.now()
      };
      const ledgerEntry = {
        id: ledgerRef.id,
        uid,
        type: "free_grant",
        amount: 25,
        balanceAfter: newBalance,
        description: "B\xF4nus de boas-vindas: 25 cr\xE9ditos para experimentar (at\xE9 5 consultas)",
        timestamp: Date.now()
      };
      t.set(grantRef, {
        uid,
        email: userEmail || "",
        grantedAt: Date.now(),
        amount: 25
      });
      t.set(walletRef, updatedWallet);
      t.set(ledgerRef, ledgerEntry);
      return newBalance;
    });
    return {
      success: true,
      message: "25 cr\xE9ditos promocionais concedidos com sucesso! Voc\xEA pode realizar at\xE9 5 consultas periciais.",
      balance: result
    };
  } catch (err) {
    if (err.message === "ALREADY_CLAIMED") {
      const w = await getOrCreateWallet(uid);
      return {
        success: false,
        message: "O b\xF4nus de 25 cr\xE9ditos j\xE1 foi concedido anteriormente para esta conta.",
        balance: w.balance
      };
    }
    console.error("[CreditEngine] Erro ao conceder free grant:", err);
    throw err;
  }
}
async function reserveConsultationCredits(uid, requestId, payloadHash) {
  const walletRef = adminDb.collection("wallets").doc(uid);
  const consultationRef = adminDb.collection("consultations").doc(requestId);
  const ledgerRef = walletRef.collection("ledger").doc();
  return await adminDb.runTransaction(async (t) => {
    const consultSnap = await t.get(consultationRef);
    if (consultSnap.exists) {
      const cData = consultSnap.data();
      if (cData.uid !== uid) {
        throw new Error("REQUEST_UID_MISMATCH");
      }
      if (!payloadHash || cData.payloadHash !== payloadHash) {
        throw new Error("REQUEST_PAYLOAD_MISMATCH");
      }
      if (cData.status !== "completed" || !cData.resultData) {
        throw new Error("CONSULTATION_IN_PROGRESS");
      }
      const wSnap = await t.get(walletRef);
      const wData = wSnap.data();
      return {
        success: true,
        consultationId: consultationRef.id,
        balanceAfter: wData?.balance || 0,
        reservedAfter: wData?.reserved || 0,
        cachedResult: cData.resultData
      };
    }
    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) {
      throw new Error("WALLET_NOT_FOUND");
    }
    const wallet = walletSnap.data();
    if (wallet.balance < 5) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    const newBalance = wallet.balance - 5;
    const newReserved = (wallet.reserved || 0) + 5;
    t.update(walletRef, {
      balance: newBalance,
      reserved: newReserved,
      version: wallet.version + 1,
      updatedAt: Date.now()
    });
    t.set(consultationRef, {
      id: consultationRef.id,
      requestId,
      uid,
      payloadHash: payloadHash || null,
      creditsReserved: 5,
      creditsCommitted: 0,
      status: "reserved",
      createdAt: Date.now()
    });
    const ledgerEntry = {
      id: ledgerRef.id,
      uid,
      type: "consultation_reserve",
      amount: -5,
      balanceAfter: newBalance,
      description: "Reserva para an\xE1lise de sinal (5 cr\xE9ditos)",
      referenceId: requestId,
      timestamp: Date.now()
    };
    t.set(ledgerRef, ledgerEntry);
    return {
      success: true,
      consultationId: consultationRef.id,
      balanceAfter: newBalance,
      reservedAfter: newReserved
    };
  });
}
async function commitConsultationCredits(uid, requestId, modelUsed, executionTimeMs, resultData) {
  const walletRef = adminDb.collection("wallets").doc(uid);
  const consultationRef = adminDb.collection("consultations").doc(requestId);
  const ledgerRef = walletRef.collection("ledger").doc();
  await adminDb.runTransaction(async (t) => {
    const consultSnap = await t.get(consultationRef);
    if (!consultSnap.exists) throw new Error("CONSULTATION_NOT_FOUND");
    const cData = consultSnap.data();
    if (cData.uid !== uid) throw new Error("REQUEST_UID_MISMATCH");
    if (cData.status === "completed") return;
    if (cData.status !== "reserved") throw new Error("CONSULTATION_NOT_RESERVED");
    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) throw new Error("WALLET_NOT_FOUND");
    const wallet = walletSnap.data();
    if (wallet.reserved < 5) throw new Error("INVALID_RESERVED_BALANCE");
    const newReserved = wallet.reserved - 5;
    const newSpent = (wallet.spentTotal || 0) + 5;
    t.update(walletRef, {
      reserved: newReserved,
      spentTotal: newSpent,
      version: wallet.version + 1,
      updatedAt: Date.now()
    });
    t.update(consultationRef, {
      status: "completed",
      creditsCommitted: 5,
      modelUsed,
      executionTimeMs,
      resultData: resultData || null,
      completedAt: Date.now()
    });
    const ledgerEntry = {
      id: ledgerRef.id,
      uid,
      type: "consultation_commit",
      amount: 0,
      // O saldo já foi debitado na reserva; esta entrada registra o gasto definitivo
      balanceAfter: wallet.balance,
      description: `Consulta conclu\xEDda via ${modelUsed} (${executionTimeMs}ms)`,
      referenceId: requestId,
      timestamp: Date.now()
    };
    t.set(ledgerRef, ledgerEntry);
  });
}
async function releaseConsultationCredits(uid, requestId, errorReason) {
  const walletRef = adminDb.collection("wallets").doc(uid);
  const consultationRef = adminDb.collection("consultations").doc(requestId);
  const ledgerRef = walletRef.collection("ledger").doc();
  await adminDb.runTransaction(async (t) => {
    const consultSnap = await t.get(consultationRef);
    if (!consultSnap.exists) throw new Error("CONSULTATION_NOT_FOUND");
    const cData = consultSnap.data();
    if (cData.uid !== uid) throw new Error("REQUEST_UID_MISMATCH");
    if (cData.status === "completed" || cData.status === "failed_released") return;
    if (cData.status !== "reserved") throw new Error("CONSULTATION_NOT_RESERVED");
    const walletSnap = await t.get(walletRef);
    if (!walletSnap.exists) throw new Error("WALLET_NOT_FOUND");
    const wallet = walletSnap.data();
    if (wallet.reserved < 5) throw new Error("INVALID_RESERVED_BALANCE");
    const newBalance = wallet.balance + 5;
    const newReserved = wallet.reserved - 5;
    t.update(walletRef, {
      balance: newBalance,
      reserved: newReserved,
      version: wallet.version + 1,
      updatedAt: Date.now()
    });
    t.update(consultationRef, {
      status: "failed_released",
      errorReason,
      releasedAt: Date.now()
    });
    const ledgerEntry = {
      id: ledgerRef.id,
      uid,
      type: "consultation_release",
      amount: 5,
      balanceAfter: newBalance,
      description: `Estorno autom\xE1tico: Falha t\xE9cnica na an\xE1lise (${errorReason})`,
      referenceId: requestId,
      timestamp: Date.now()
    };
    t.set(ledgerRef, ledgerEntry);
  });
}
async function adminAdjustCredits(params) {
  const { adminUid, targetUid, action, amount, reason, category, idempotencyKey, referenceId } = params;
  if (!targetUid || typeof targetUid !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) {
    throw new Error("UID de usu\xE1rio alvo inv\xE1lido.");
  }
  if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    throw new Error("A quantidade deve ser um n\xFAmero inteiro positivo.");
  }
  if (amount > 1e3) {
    throw new Error("Limite m\xE1ximo de 1000 cr\xE9ditos por opera\xE7\xE3o de ajuste.");
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    throw new Error("O motivo do ajuste \xE9 obrigat\xF3rio (m\xEDnimo 3 caracteres).");
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8) {
    throw new Error("Chave de idempot\xEAncia inv\xE1lida (m\xEDnimo 8 caracteres).");
  }
  const validCategories = ["courtesy", "support", "correction", "other"];
  if (!validCategories.includes(category)) {
    throw new Error("Categoria de ajuste inv\xE1lida.");
  }
  const walletRef = adminDb.collection("wallets").doc(targetUid);
  const idempotencyRef = adminDb.collection("adminAdjustmentIdempotency").doc(idempotencyKey);
  const auditRef = adminDb.collection("auditLogs").doc();
  const ledgerRef = walletRef.collection("ledger").doc();
  return await adminDb.runTransaction(async (t) => {
    const idempSnap = await t.get(idempotencyRef);
    const walletSnap = await t.get(walletRef);
    if (idempSnap.exists) {
      const existing = idempSnap.data();
      const isIdentical = existing.adminUid === adminUid && existing.targetUid === targetUid && existing.action === action && existing.amount === amount && existing.reason.trim() === reason.trim() && existing.category === category && (existing.referenceId || null) === (referenceId || null);
      if (!isIdentical) {
        const err = new Error("Conflito de Idempot\xEAncia: chave j\xE1 utilizada com par\xE2metros diferentes.");
        err.statusCode = 409;
        throw err;
      }
      let currentWallet;
      if (walletSnap.exists) {
        currentWallet = walletSnap.data();
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
          updatedAt: Date.now()
        };
      }
      return {
        success: true,
        receipt: existing.receipt,
        wallet: currentWallet
      };
    }
    let wallet;
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
        updatedAt: Date.now()
      };
    } else {
      wallet = walletSnap.data();
    }
    let newBalance = wallet.balance;
    let newManualTotal = wallet.manualGrantedTotal || 0;
    let debtAmount = wallet.debtAmount || 0;
    if (action === "grant") {
      newBalance += amount;
      newManualTotal += amount;
    } else {
      if (wallet.balance < amount) {
        const deficit = amount - wallet.balance;
        newBalance = 0;
        debtAmount += deficit;
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
      referenceId: referenceId || null
    };
    const updatedWalletData = {
      ...wallet,
      balance: newBalance,
      manualGrantedTotal: newManualTotal,
      debtAmount,
      version: (wallet.version || 1) + 1,
      updatedAt: now
    };
    if (!walletExists) {
      t.set(walletRef, updatedWalletData);
    } else {
      t.update(walletRef, updatedWalletData);
    }
    const ledgerEntry = {
      id: ledgerRef.id,
      uid: targetUid,
      type: "admin_adjustment",
      amount: action === "grant" ? amount : -amount,
      balanceAfter: newBalance,
      description: action === "grant" ? `Cr\xE9ditos adicionados pela administra\xE7\xE3o (+${amount}) - ${reason}` : `Ajuste de d\xE9bito pela administra\xE7\xE3o (-${amount}) - ${reason}`,
      referenceId: operationId,
      adminUid,
      reason,
      category,
      timestamp: now
    };
    t.set(ledgerRef, ledgerEntry);
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
      createdAt: now
    });
    t.set(auditRef, {
      id: auditRef.id,
      type: "admin_credit_adjustment",
      actorAdminUid: adminUid,
      targetUid,
      action,
      amount,
      reason: reason.trim(),
      category,
      previousBalance,
      balanceAfter: newBalance,
      idempotencyKey,
      timestamp: now
    });
    return {
      success: true,
      receipt,
      wallet: updatedWalletData
    };
  });
}

// src/services/mercadoPagoEngine.ts
import crypto from "crypto";
function verifyMercadoPagoWebhookSignature(xSignatureHeader, xRequestIdHeader, dataId, secretKey) {
  if (!xSignatureHeader || !xRequestIdHeader || !dataId || !secretKey) {
    return false;
  }
  const parts = xSignatureHeader.split(",").map((p) => p.trim());
  let ts = "";
  let v1 = "";
  for (const part of parts) {
    const [k, val] = part.split("=");
    if (k === "ts") ts = val;
    if (k === "v1") v1 = val;
  }
  if (!ts || !v1) {
    return false;
  }
  const timestamp = Number(ts);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 6e4) {
    return false;
  }
  let manifest = "";
  if (dataId) {
    manifest += `id:${dataId};`;
  }
  if (xRequestIdHeader) {
    manifest += `request-id:${xRequestIdHeader};`;
  }
  manifest += `ts:${ts};`;
  try {
    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(manifest);
    const calculatedHash = hmac.digest("hex");
    const bufA = Buffer.from(calculatedHash, "hex");
    const bufB = Buffer.from(v1, "hex");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (err) {
    console.warn("[Webhook MP] Erro ao validar assinatura:", err);
    return false;
  }
}
function getCatalogPackages() {
  const p50Price = parseInt(process.env.PACKAGE_50_PRICE_CENTS || "0", 10);
  const p75Price = parseInt(process.env.PACKAGE_75_PRICE_CENTS || "0", 10);
  const p100Price = parseInt(process.env.PACKAGE_100_PRICE_CENTS || "0", 10);
  return [
    {
      id: "pack_50",
      credits: 50,
      consultationsEquivalent: 10,
      priceInCentsBRL: p50Price,
      active: p50Price > 0,
      description: "Pacote 50 Cr\xE9ditos (equivalente a 10 consultas completas)"
    },
    {
      id: "pack_75",
      credits: 75,
      consultationsEquivalent: 15,
      priceInCentsBRL: p75Price,
      active: p75Price > 0,
      description: "Pacote 75 Cr\xE9ditos (equivalente a 15 consultas completas)"
    },
    {
      id: "pack_100",
      credits: 100,
      consultationsEquivalent: 20,
      priceInCentsBRL: p100Price,
      active: p100Price > 0,
      description: "Pacote 100 Cr\xE9ditos (equivalente a 20 consultas completas)"
    }
  ];
}
async function createMercadoPagoOrder(uid, packageId, userEmail) {
  const catalog = getCatalogPackages();
  const selectedPackage = catalog.find((p) => p.id === packageId);
  if (!selectedPackage) {
    throw new Error("Pacote inv\xE1lido ou inexistente.");
  }
  if (!selectedPackage.active || selectedPackage.priceInCentsBRL <= 0) {
    throw new Error("Este pacote n\xE3o possui pre\xE7o configurado pelo propriet\xE1rio no servidor.");
  }
  const orderId = `ord_${crypto.randomUUID()}`;
  const orderRef = adminDb.collection("orders").doc(orderId);
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const appUrl = process.env.APP_URL;
  if (!accessToken || !appUrl || !appUrl.startsWith("https://")) {
    throw new Error("Checkout indispon\xEDvel: token ou APP_URL HTTPS n\xE3o configurado.");
  }
  {
    try {
      const unitPriceBRL = selectedPackage.priceInCentsBRL / 100;
      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-Idempotency-Key": orderId
        },
        body: JSON.stringify({
          items: [
            {
              id: selectedPackage.id,
              title: `Froc Sobrenatural - ${selectedPackage.credits} Cr\xE9ditos`,
              description: selectedPackage.description,
              quantity: 1,
              currency_id: "BRL",
              unit_price: unitPriceBRL
            }
          ],
          payer: {
            email: userEmail
          },
          external_reference: orderId,
          statement_descriptor: "FROC SOBRENATURAL",
          back_urls: {
            success: `${appUrl}/?payment_status=success&orderId=${orderId}`,
            pending: `${appUrl}/?payment_status=pending&orderId=${orderId}`,
            failure: `${appUrl}/?payment_status=failure&orderId=${orderId}`
          },
          auto_return: "approved",
          notification_url: `${appUrl}/api/webhooks/mercadopago`
        })
      });
      if (!mpResponse.ok) throw new Error("Falha ao criar prefer\xEAncia no Mercado Pago.");
      const mpData = await mpResponse.json();
      const preferenceId = String(mpData.id || "");
      const initPoint = String(mpData.init_point || mpData.sandbox_init_point || "");
      if (!preferenceId || !/^https:\/\/((www\.)?mercadopago\.com(\.br)?|www\.mercadopago\.com\.br)\//.test(initPoint)) {
        throw new Error("Resposta de checkout inv\xE1lida.");
      }
      const order = {
        id: orderId,
        uid,
        packageId: selectedPackage.id,
        credits: selectedPackage.credits,
        amountCentsBRL: selectedPackage.priceInCentsBRL,
        status: "created",
        mercadoPagoPreferenceId: preferenceId,
        mercadoPagoInitPoint: initPoint,
        createdAt: Date.now()
      };
      await orderRef.create(order);
      return order;
    } catch (err) {
      console.error("[MercadoPago] Prefer\xEAncia n\xE3o dispon\xEDvel:", err);
      throw new Error("N\xE3o foi poss\xEDvel iniciar o pagamento. Tente novamente.");
    }
  }
}
async function processMercadoPagoWebhook(paymentId) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Mercado Pago n\xE3o configurado no servidor.");
  }
  if (!/^\d{1,30}$/.test(paymentId)) throw new Error("Identificador de pagamento inv\xE1lido.");
  const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!paymentResp.ok) {
    throw new Error(`Falha ao consultar pagamento ${paymentId} no Mercado Pago`);
  }
  const payment = await paymentResp.json();
  const orderId = payment.external_reference;
  const status = payment.status;
  if (!orderId) {
    throw new Error("Refer\xEAncia externa ausente no pagamento.");
  }
  if (String(payment.id) !== paymentId) throw new Error("ID do pagamento inconsistente.");
  const merchantResp = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!merchantResp.ok) throw new Error("N\xE3o foi poss\xEDvel verificar a conta recebedora.");
  const merchant = await merchantResp.json();
  if (!merchant.id || String(payment.collector_id) !== String(merchant.id)) {
    throw new Error("Conta recebedora diferente da conta configurada.");
  }
  const orderRef = adminDb.collection("orders").doc(orderId);
  const paymentEventRef = adminDb.collection("paymentEvents").doc(`mp_${paymentId}_${status}`);
  return await adminDb.runTransaction(async (t) => {
    const eventSnap = await t.get(paymentEventRef);
    if (eventSnap.exists) {
      return { success: true, message: "Evento j\xE1 processado anteriormente." };
    }
    const orderSnap = await t.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error(`Pedido ${orderId} n\xE3o encontrado no banco`);
    }
    const order = orderSnap.data();
    if (!order.mercadoPagoPreferenceId || payment.preference_id && String(payment.preference_id) !== order.mercadoPagoPreferenceId || payment.currency_id !== "BRL" || !Number.isFinite(Number(payment.transaction_amount)) || Math.round(Number(payment.transaction_amount) * 100) !== order.amountCentsBRL) {
      throw new Error("Moeda, valor ou prefer\xEAncia n\xE3o conferem com o pedido.");
    }
    if (order.mercadoPagoPaymentId && order.mercadoPagoPaymentId !== paymentId) {
      throw new Error("Pedido vinculado a outro pagamento.");
    }
    const uid = order.uid;
    const walletRef = adminDb.collection("wallets").doc(uid);
    const ledgerRef = walletRef.collection("ledger").doc();
    const walletSnap = await t.get(walletRef);
    t.set(paymentEventRef, {
      paymentId,
      orderId,
      status,
      receivedAt: Date.now(),
      rawStatus: payment.status_detail
    });
    if (status === "approved" && order.status !== "approved" && order.status !== "refunded") {
      const walletExists = walletSnap.exists;
      let wallet;
      if (!walletExists) {
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
          updatedAt: Date.now()
        };
      } else {
        wallet = walletSnap.data();
      }
      const outstandingDebt = wallet.debtAmount || 0;
      const appliedToDebt = Math.min(order.credits, outstandingDebt);
      const newBalance = wallet.balance + order.credits - appliedToDebt;
      const newPurchased = (wallet.purchasedTotal || 0) + order.credits;
      if (!walletExists) {
        t.set(walletRef, {
          ...wallet,
          balance: newBalance,
          purchasedTotal: newPurchased,
          debtAmount: outstandingDebt - appliedToDebt,
          updatedAt: Date.now()
        });
      } else {
        t.update(walletRef, {
          balance: newBalance,
          purchasedTotal: newPurchased,
          debtAmount: outstandingDebt - appliedToDebt,
          version: (wallet.version || 1) + 1,
          updatedAt: Date.now()
        });
      }
      t.update(orderRef, {
        status: "approved",
        mercadoPagoPaymentId: paymentId,
        approvedAt: Date.now()
      });
      const ledgerEntry = {
        id: ledgerRef.id,
        uid,
        type: "purchase",
        amount: order.credits - appliedToDebt,
        balanceAfter: newBalance,
        description: `Compra aprovada via Mercado Pago: +${order.credits} cr\xE9ditos`,
        referenceId: orderId,
        timestamp: Date.now()
      };
      t.set(ledgerRef, ledgerEntry);
      return { success: true, message: `Cr\xE9ditos (+${order.credits}) aplicados com sucesso!` };
    } else if (status === "refunded" || status === "charged_back") {
      if (order.status === "refunded") return { success: true, message: "Estorno j\xE1 registrado." };
      if (order.status !== "approved") {
        t.update(orderRef, { status: "refunded", mercadoPagoPaymentId: paymentId });
        return { success: true, message: "Estorno de pagamento n\xE3o creditado registrado." };
      }
      const wallet = walletSnap.exists ? walletSnap.data() : null;
      if (!wallet) throw new Error("Carteira n\xE3o encontrada para concilia\xE7\xE3o.");
      const removed = Math.min(wallet.balance, order.credits);
      const newBalance = wallet.balance - removed;
      t.update(walletRef, {
        balance: newBalance,
        debtAmount: (wallet.debtAmount || 0) + order.credits - removed,
        purchasedTotal: Math.max(0, (wallet.purchasedTotal || 0) - order.credits),
        version: (wallet.version || 1) + 1,
        updatedAt: Date.now()
      });
      t.update(orderRef, { status: "refunded", refundedAt: Date.now() });
      t.set(ledgerRef, {
        id: ledgerRef.id,
        uid,
        type: "refund",
        amount: -removed,
        balanceAfter: newBalance,
        referenceId: orderId,
        description: `Pagamento estornado; ${order.credits - removed} cr\xE9ditos em d\xEDvida`,
        timestamp: Date.now()
      });
      return { success: true, message: "Estorno conciliado na carteira." };
    } else {
      if (order.status === "approved" || order.status === "refunded") {
        return { success: true, message: "Estado final preservado." };
      }
      t.update(orderRef, { status: status === "rejected" ? "declined" : "pending" });
      return { success: true, message: `Status do pedido atualizado para ${status}.` };
    }
  });
}

// src/services/aiOrchestrator.ts
async function executeGeminiWithFallback(ai2, promptParams, modelCascade = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]) {
  const startTime = Date.now();
  const failoverHistory = [];
  for (let i = 0; i < modelCascade.length; i++) {
    const currentModel = modelCascade[i];
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2e3);
    try {
      const result = await ai2.models.generateContent({
        model: currentModel,
        contents: promptParams.contents,
        config: { ...promptParams.config, abortSignal: controller.signal }
      });
      const elapsed = Date.now() - attemptStart;
      console.log(`[AI Cascade] Modelo ${currentModel} respondeu com sucesso em ${elapsed}ms`);
      return {
        text: result.text || "",
        modelUsed: currentModel,
        executionTimeMs: Date.now() - startTime,
        failoverHistory
      };
    } catch (err) {
      const elapsed = Date.now() - attemptStart;
      const reason = err?.message || "Falha transit\xF3ria";
      console.warn(`[AI Cascade] Falha ou timeout no modelo ${currentModel} (${elapsed}ms): ${reason}`);
      failoverHistory.push(`${currentModel} (${elapsed}ms: ${reason})`);
      if (/API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|RESOURCE_EXHAUSTED|429/.test(reason)) {
        throw new Error(`Erro permanente de credencial: ${reason}`);
      }
      if (i === modelCascade.length - 1) {
        throw new Error(`Todos os modelos na cascata falharam: ${failoverHistory.join(" -> ")}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Falha inesperada no processador de modelos");
}

// src/services/rateLimit.ts
import crypto2 from "crypto";
async function enforceUserRateLimit(uid, operation, maximum, periodMs = 6e4) {
  const period = Math.floor(Date.now() / periodMs);
  const uidHash = crypto2.createHash("sha256").update(uid).digest("hex");
  const ref = adminDb.collection("rateLimits").doc(`${uidHash}_${operation}_${period}`);
  return adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const count = snapshot.exists ? Number(snapshot.data().count) || 0 : 0;
    if (count >= maximum) return false;
    tx.set(ref, { uid, operation, period, count: count + 1, expiresAt: (period + 2) * periodMs });
    return true;
  });
}

// src/serverApp.ts
dotenv.config();
var app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
async function authenticateFirebaseUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autentica\xE7\xE3o n\xE3o fornecido ou cabe\xE7alho inv\xE1lido." });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.warn("[Auth Middleware] Token inv\xE1lido ou expirado:", err.message);
    return res.status(401).json({ error: "Sess\xE3o expirada ou token inv\xE1lido." });
  }
}
function isUserAdmin(uid, tokenClaims) {
  if (!uid) return false;
  if (tokenClaims && (tokenClaims.admin === true || tokenClaims.role === "admin")) {
    return true;
  }
  const envAdminUids = (process.env.ADMIN_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (envAdminUids.includes(uid)) {
    return true;
  }
  return false;
}
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Autentica\xE7\xE3o necess\xE1ria." });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token, true);
    req.user = decodedToken;
    if (!isUserAdmin(decodedToken.uid, decodedToken)) {
      return res.status(403).json({
        error: "Acesso negado. Esta rota \xE9 restrita a administradores reconhecidos."
      });
    }
    next();
  } catch (err) {
    console.warn("[Admin Middleware] Token inv\xE1lido ou expirado:", err.message);
    return res.status(401).json({ error: "Sess\xE3o administrativa expirada ou inv\xE1lida." });
  }
}
var apiKey = process.env.GEMINI_API_KEY;
var ai = null;
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error("Falha ao inicializar GoogleGenAI:", err);
  }
}
app.get("/api/status", (_req, res) => {
  res.json({
    status: "online",
    appName: "Froc Sobrenatural Ca\xE7a Fantasma",
    hasGemini: !!apiKey && !!ai,
    hasMercadoPago: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    modelCascade: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
    pricingConfigured: {
      p50: parseInt(process.env.PACKAGE_50_PRICE_CENTS || "0", 10) > 0,
      p75: parseInt(process.env.PACKAGE_75_PRICE_CENTS || "0", 10) > 0,
      p100: parseInt(process.env.PACKAGE_100_PRICE_CENTS || "0", 10) > 0
    },
    features: {
      audioAnalysis: true,
      investigationChat: true,
      blindTestVerification: true,
      evidenceLogging: true,
      walletAndCredits: true,
      mercadoPagoCheckoutPro: true
    }
  });
});
app.get("/api/wallet", authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const wallet = await getOrCreateWallet(uid);
    const ledgerSnap = await adminDb.collection("wallets").doc(uid).collection("ledger").orderBy("timestamp", "desc").limit(30).get();
    const ledger = ledgerSnap.docs.map((d) => d.data());
    res.json({
      wallet,
      ledger
    });
  } catch (err) {
    console.error("[API /api/wallet] Erro:", err);
    res.status(500).json({ error: "Erro ao carregar carteira no servidor." });
  }
});
app.post("/api/wallet/claim-free", authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email;
    const emailVerified = !!req.user.email_verified;
    const result = await claimFreeGrant(uid, email, emailVerified);
    res.json(result);
  } catch (err) {
    console.error("[API /api/wallet/claim-free] Erro:", err);
    res.status(500).json({ error: "Erro ao processar b\xF4nus gratuito." });
  }
});
app.get("/api/packages", (_req, res) => {
  res.json(getCatalogPackages());
});
app.post("/api/orders/create", authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email || "investigador@froc.app";
    const { packageId } = req.body;
    if (!packageId) {
      return res.status(400).json({ error: "packageId \xE9 obrigat\xF3rio." });
    }
    if (!await enforceUserRateLimit(uid, "order", 5)) return res.status(429).json({ error: "Aguarde antes de criar outro pedido." });
    const order = await createMercadoPagoOrder(uid, packageId, email);
    res.json(order);
  } catch (err) {
    console.error("[API /api/orders/create] Erro:", err);
    res.status(400).json({ error: err.message || "Falha ao criar pedido." });
  }
});
app.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(503).json({ error: "Webhook n\xE3o configurado." });
    const dataId = req.query["data.id"]?.toString();
    if (!verifyMercadoPagoWebhookSignature(xSignature, xRequestId, dataId, webhookSecret)) {
      console.warn("[Webhook MP] Rejeitado por assinatura inv\xE1lida ou ausente");
      return res.status(401).json({ error: "Assinatura inv\xE1lida do webhook" });
    }
    const topic = req.query.topic || req.body?.type || req.query.type;
    const paymentId = dataId;
    if ((topic === "payment" || req.body?.action === "payment.created" || req.body?.action === "payment.updated") && paymentId) {
      const result = await processMercadoPagoWebhook(paymentId.toString());
      return res.status(200).json(result);
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("[API Webhook MP] Erro:", err);
    res.status(500).json({ error: "Erro interno no processamento do webhook" });
  }
});
app.post("/api/analyze", authenticateFirebaseUser, async (req, res) => {
  const uid = req.user.uid;
  const requestId = req.headers["x-request-id"]?.toString() || crypto3.randomUUID();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) {
    return res.status(400).json({ error: "ID da consulta inv\xE1lido." });
  }
  const { question, audioBase64, mimeType, sensorContext, audioMetrics } = req.body || {};
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ error: "Pergunta da consulta \xE9 obrigat\xF3ria." });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "Pergunta excede limite de 500 caracteres." });
  }
  if (!ai) return res.status(503).json({ error: "An\xE1lise por IA indispon\xEDvel. Nenhum cr\xE9dito foi reservado." });
  if (audioBase64 !== void 0 && (typeof audioBase64 !== "string" || !/^data:audio\/(webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-z0-9-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(audioBase64))) {
    return res.status(400).json({ error: "Formato de \xE1udio inv\xE1lido." });
  }
  const hasAudioData = typeof audioBase64 === "string" && audioBase64.length > 100;
  if (hasAudioData && audioBase64.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: "\xC1udio excede o limite m\xE1ximo permitido de 8MB." });
  }
  try {
    if (!await enforceUserRateLimit(uid, "analyze", 12)) return res.status(429).json({ error: "Limite tempor\xE1rio de consultas atingido." });
  } catch {
    return res.status(503).json({ error: "Controle de uso indispon\xEDvel. Nenhum cr\xE9dito foi reservado." });
  }
  const payloadHash = crypto3.createHash("sha256").update(JSON.stringify({ question: question.trim(), audioBase64, mimeType, sensorContext, audioMetrics })).digest("hex");
  let creditReserved = false;
  try {
    const reservation = await reserveConsultationCredits(uid, requestId, payloadHash);
    creditReserved = reservation.success;
    if (reservation.cachedResult) {
      return res.json(reservation.cachedResult);
    }
  } catch (err) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      return res.status(402).json({
        error: "Saldo insuficiente. Esta consulta pericial requer 5 cr\xE9ditos dispon\xEDveis.",
        code: "INSUFFICIENT_CREDITS"
      });
    }
    if (err.message === "CONSULTATION_IN_PROGRESS") {
      return res.status(409).json({
        error: "Esta consulta j\xE1 est\xE1 sendo processada no momento.",
        code: "IN_PROGRESS"
      });
    }
    if (err.message === "REQUEST_PAYLOAD_MISMATCH" || err.message === "REQUEST_UID_MISMATCH") {
      return res.status(403).json({
        error: "Chave de requisi\xE7\xE3o inconsistente ou pertencente a outra opera\xE7\xE3o."
      });
    }
    console.error("[Analyze] Falha ao reservar cr\xE9ditos:", err);
    return res.status(500).json({ error: "Falha no controle transacional de cr\xE9ditos da carteira." });
  }
  try {
    if (!ai) {
      const dbfs = typeof audioMetrics?.dbfs === "number" ? audioMetrics.dbfs : -60;
      const peakHz = typeof audioMetrics?.peakFrequencyHz === "number" ? audioMetrics.peakFrequencyHz : 0;
      const isVoiceBand = peakHz >= 250 && peakHz <= 3500;
      const hasSignificantVolume = dbfs > -38;
      let candidateTranscription = null;
      let conclusion = hasAudioData ? "\xC1udio analisado pelo motor espectral local. Nenhuma resposta ou fonema intelig\xEDvel identificado." : "Consulta registrada sem amostra de \xE1udio anexada. Nenhuma emiss\xE3o ac\xFAstica examinada.";
      let confidence = 0.05;
      const alternativeHypotheses = [
        "Ru\xEDdo t\xE9rmico do transdutor do microfone",
        "Varia\xE7\xE3o normal do ru\xEDdo de fundo ambiente",
        "Aus\xEAncia de modula\xE7\xE3o harm\xF4nica de fala"
      ];
      if (hasAudioData && hasSignificantVolume && isVoiceBand) {
        conclusion = "Sinal com energia na faixa vocal (250Hz\u20133.5kHz), por\xE9m sem inteligibilidade para transcri\xE7\xE3o fon\xE9tica segura.";
        confidence = 0.35;
        alternativeHypotheses.unshift("Voz distante de pessoa no local ou vazamento de \xE1udio ac\xFAstico externo");
      }
      const localResult = {
        candidateTranscription,
        conclusion,
        confidence,
        voiceDetected: hasAudioData && hasSignificantVolume && isVoiceBand,
        acousticAnalysis: hasAudioData ? `[Medi\xE7\xE3o Real] dBFS: ${dbfs.toFixed(1)} | Frequ\xEAncia de pico: ${peakHz}Hz | Banda de fala: ${isVoiceBand ? "Sim" : "N\xE3o"}` : "Nenhum arquivo de \xE1udio enviado para an\xE1lise espectral.",
        alternativeHypotheses,
        possibleName: null,
        controlQuestionSuggestion: 'Sugest\xE3o de pergunta de controle: "Pode repetir com clareza em voz aud\xEDvel?"',
        provider: "Motor Espectral Local (Froc DSP v1.0)"
      };
      if (creditReserved) {
        await commitConsultationCredits(uid, requestId, "Motor Espectral Local (Froc DSP v1.0)", 50, localResult);
      }
      return res.json(localResult);
    }
    const prompt = `
Voc\xEA \xE9 o analisador pericial da esta\xE7\xE3o "Froc Sobrenatural Ca\xE7a Fantasma".
Sua fun\xE7\xE3o \xE9 avaliar com ceticismo metodol\xF3gico, an\xE1lise espectral e f\xEDsica uma amostra de \xE1udio e telemetria.

DIRETRIZES FUNDAMENTAIS DE RIGOR FORENSE:
1. NUNCA invente palavras, respostas, nomes ou identidades onde h\xE1 apenas ru\xEDdo, clique, sussurro inaud\xEDvel ou est\xE1tica.
2. Se o \xE1udio for ausente, inaud\xEDvel ou ru\xEDdo aleat\xF3rio, a conclus\xE3o DEVE ser: "Nenhuma resposta identificada." e candidateTranscription DEVE ser null.
3. Se a pergunta for "Quem est\xE1 a\xED?" ou similar, e for aud\xEDvel um nome claro:
   - possibleName: {"name": "Nome", "segmentTime": "mm:ss-mm:ss", "verified": false}
   - conclusion: "Poss\xEDvel nome: [Nome] \xB7 fonte: \xE1udio \xB7 trecho: [mm:ss\u2013mm:ss] \xB7 ainda n\xE3o verificado"
   - NUNCA declare "esp\xEDrito identificado" ou "entidade respondeu".
4. Indique sempre a hip\xF3tese nula e causas f\xEDsicas (fia\xE7\xE3o, pareidolia, ru\xEDdo de vento, compress\xE3o digital).
5. O score de confian\xE7a deve ser estritamente entre 0.00 e 1.00.

DADOS DA AMOSTRA:
- Pergunta: "${question}"
- Telemetria de Sensores: ${JSON.stringify(sensorContext || {})}
- M\xE9tricas Autodeclaradas pelo Dispositivo: ${JSON.stringify(audioMetrics || {})}

FORMATO JSON OBRIGAT\xD3RIO:
{
  "candidateTranscription": null ou string,
  "possibleName": null ou {"name": string, "segmentTime": string, "verified": false},
  "controlQuestionSuggestion": string,
  "voiceDetected": boolean,
  "confidence": number,
  "conclusion": string,
  "acousticAnalysis": string,
  "alternativeHypotheses": string[]
}
`;
    const parts = [{ text: prompt }];
    if (hasAudioData) {
      parts.push({
        inlineData: {
          mimeType: mimeType || "audio/webm",
          data: audioBase64.replace(/^data:audio\/[a-z0-9-+.]+(?:;codecs=[a-z0-9-]+)?;base64,/i, "")
        }
      });
    }
    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents: parts,
        config: { responseMimeType: "application/json" }
      },
      ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]
    );
    const parsed = JSON.parse(cascadeResult.text || "{}");
    if (!parsed || typeof parsed !== "object" || typeof parsed.conclusion !== "string" || typeof parsed.voiceDetected !== "boolean" || typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence) || !Array.isArray(parsed.alternativeHypotheses)) {
      throw new Error("Resposta de an\xE1lise inv\xE1lida.");
    }
    if (!parsed.voiceDetected || typeof parsed.confidence !== "number" || parsed.confidence < 0.4 || !hasAudioData) {
      parsed.candidateTranscription = null;
      if (!hasAudioData) {
        parsed.voiceDetected = false;
      }
    }
    if (parsed.possibleName && typeof parsed.possibleName === "object") {
      parsed.possibleName.verified = false;
    } else {
      parsed.possibleName = null;
    }
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const finalResponse = {
      ...parsed,
      provider: `${cascadeResult.modelUsed} (An\xE1lise Forense)`,
      modelUsed: cascadeResult.modelUsed,
      executionTimeMs: cascadeResult.executionTimeMs
    };
    if (creditReserved) {
      await commitConsultationCredits(uid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs, finalResponse);
    }
    return res.json(finalResponse);
  } catch (err) {
    console.error("Audio analysis error:", err);
    if (creditReserved) {
      try {
        await releaseConsultationCredits(uid, requestId, "Falha t\xE9cnica");
      } catch (releaseError) {
        console.error("[Analyze] Estorno pendente de concilia\xE7\xE3o:", releaseError);
      }
    }
    return res.status(500).json({
      candidateTranscription: null,
      voiceDetected: false,
      confidence: 0,
      conclusion: "Falha t\xE9cnica no processamento pericial. Os cr\xE9ditos da consulta foram integralmente liberados.",
      acousticAnalysis: "Erro ao contatar o servi\xE7o de an\xE1lise.",
      alternativeHypotheses: ["Falha de conex\xE3o", "Tempo de resposta excedido"],
      error: "Falha t\xE9cnica na an\xE1lise."
    });
  }
});
app.post("/api/chat", authenticateFirebaseUser, async (req, res) => {
  const uid = req.user.uid;
  const requestId = req.headers["x-request-id"]?.toString() || crypto3.randomUUID();
  let reserved = false;
  try {
    const { messages, sessionContext } = req.body || {};
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) return res.status(400).json({ error: "ID da consulta inv\xE1lido." });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Hist\xF3rico de mensagens \xE9 obrigat\xF3rio." });
    }
    const recentMessages = messages.slice(-10);
    const lastUserMsg = recentMessages[recentMessages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== "user" || typeof lastUserMsg.content !== "string" || lastUserMsg.content.length > 800 || recentMessages.some((msg) => !["user", "assistant"].includes(msg.role) || typeof msg.content !== "string" || msg.content.length > 1e3)) {
      return res.status(400).json({ error: "Mensagem inv\xE1lida ou excede limite de 800 caracteres." });
    }
    if (!ai) {
      return res.status(503).json({ error: "Assistente indispon\xEDvel. Nenhum cr\xE9dito foi reservado." });
    }
    if (!await enforceUserRateLimit(uid, "chat", 20)) return res.status(429).json({ error: "Limite tempor\xE1rio do chat atingido." });
    const payloadHash = crypto3.createHash("sha256").update(JSON.stringify({ messages: recentMessages, sessionContext })).digest("hex");
    const reservation = await reserveConsultationCredits(uid, requestId, payloadHash);
    if (reservation.cachedResult) return res.json(reservation.cachedResult);
    reserved = true;
    const systemInstruction = `
Voc\xEA \xE9 o assistente t\xE9cnico de metodologia e an\xE1lise da esta\xE7\xE3o "Froc Sobrenatural Ca\xE7a Fantasma".
Seu papel \xE9 orientar o pesquisador sobre m\xE9todo cient\xEDfico, calibra\xE7\xE3o de sensores, hip\xF3tese nula, descarte de interfer\xEAncias rotineiras e duplo-cego.
REGRAS:
1. NUNCA finja ser um esp\xEDrito, fantasma ou entidade. Voc\xEA \xE9 um analista de laborat\xF3rio.
2. Responda em Portugu\xEAs do Brasil com clareza, concis\xE3o e foco cient\xEDfico.
`;
    const contents = recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: String(msg.content).slice(0, 1e3) }]
    }));
    if (sessionContext) {
      contents.unshift({
        role: "user",
        parts: [{ text: `[CONTEXTO DA SESS\xC3O]:
${JSON.stringify(sessionContext).slice(0, 1e3)}` }]
      });
      contents.splice(1, 0, {
        role: "model",
        parts: [{ text: "Entendido. Contexto metodol\xF3gico da sess\xE3o registrado." }]
      });
    }
    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents,
        config: { systemInstruction }
      },
      ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]
    );
    const result = {
      reply: cascadeResult.text || "Nenhuma an\xE1lise gerada.",
      provider: cascadeResult.modelUsed,
      costCredits: 5
    };
    if (!cascadeResult.text) throw new Error("Assistente retornou resposta vazia.");
    await commitConsultationCredits(uid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs, result);
    res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    if (reserved) {
      try {
        await releaseConsultationCredits(uid, requestId, "Falha t\xE9cnica");
      } catch (releaseError) {
        console.error("[Chat] Estorno pendente de concilia\xE7\xE3o:", releaseError);
      }
    }
    if (err.message === "INSUFFICIENT_BALANCE") return res.status(402).json({ error: "Saldo insuficiente: chat custa 5 cr\xE9ditos." });
    if (err.message === "CONSULTATION_IN_PROGRESS") return res.status(409).json({ error: "Consulta em processamento." });
    if (err.message === "REQUEST_PAYLOAD_MISMATCH" || err.message === "REQUEST_UID_MISMATCH") return res.status(409).json({ error: "ID da consulta pertence a outra solicita\xE7\xE3o." });
    res.status(500).json({
      reply: "Erro ao processar consulta com o assistente.",
      error: "Falha t\xE9cnica na consulta."
    });
  }
});
app.get("/api/user/orders", authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const ordersSnap = await adminDb.collection("orders").where("uid", "==", uid).limit(50).get();
    const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(orders);
  } catch (err) {
    console.error("[API /api/user/orders] Erro:", err);
    res.status(500).json({ error: "Erro ao buscar hist\xF3rico de pedidos." });
  }
});
app.get("/api/user/role", authenticateFirebaseUser, async (req, res) => {
  const isAdmin = isUserAdmin(req.user.uid, req.user);
  res.json({
    uid: req.user.uid,
    isAdmin,
    email: req.user.email,
    emailVerified: !!req.user.email_verified
  });
});
app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const walletsSnap = await adminDb.collection("wallets").limit(500).get();
    let totalCreditsInCirculation = 0;
    let totalPurchasedCredits = 0;
    let totalSpentCredits = 0;
    let totalReservedCredits = 0;
    walletsSnap.forEach((doc) => {
      const data = doc.data();
      totalCreditsInCirculation += data.balance || 0;
      totalPurchasedCredits += data.purchasedTotal || 0;
      totalSpentCredits += data.spentTotal || 0;
      totalReservedCredits += data.reserved || 0;
    });
    const ordersSnap = await adminDb.collection("orders").limit(500).get();
    const ordersCountByStatus = {
      created: 0,
      pending: 0,
      approved: 0,
      declined: 0,
      refunded: 0
    };
    ordersSnap.forEach((doc) => {
      const d = doc.data();
      const status = d.status || "created";
      ordersCountByStatus[status] = (ordersCountByStatus[status] || 0) + 1;
    });
    const consultationsSnap = await adminDb.collection("consultations").limit(500).get();
    let totalConsultationsCompleted = 0;
    let totalConsultationsFailed = 0;
    consultationsSnap.forEach((doc) => {
      const d = doc.data();
      if (d.status === "completed") totalConsultationsCompleted++;
      if (d.status === "failed_released") totalConsultationsFailed++;
    });
    const envAdminUids = (process.env.ADMIN_UIDS || "").split(",").filter(Boolean);
    res.json({
      totalUsers: walletsSnap.size,
      metricsPartial: walletsSnap.size === 500 || ordersSnap.size === 500 || consultationsSnap.size === 500,
      totalCreditsInCirculation,
      totalPurchasedCredits,
      totalSpentCredits,
      totalReservedCredits,
      totalConsultationsCompleted,
      totalConsultationsFailed,
      ordersCountByStatus,
      apiHealth: {
        status: "online",
        geminiOnline: !!apiKey,
        mercadoPagoOnline: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
        adminConfigured: envAdminUids.length > 0
      }
    });
  } catch (err) {
    console.error("[Admin Overview] Erro:", err);
    res.status(500).json({ error: "Erro ao compilar vis\xE3o geral do sistema." });
  }
});
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").toLowerCase().trim();
    const requestedLimit = Number(req.query.limit || 30);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 30;
    const walletsSnap = await adminDb.collection("wallets").limit(limit).get();
    const users = [];
    walletsSnap.forEach((doc) => {
      const data = doc.data();
      if (!search || doc.id.toLowerCase().includes(search)) {
        users.push({
          uid: doc.id,
          balance: data.balance || 0,
          reserved: data.reserved || 0,
          promotionalGranted: data.promotionalGranted || 0,
          purchasedTotal: data.purchasedTotal || 0,
          manualGrantedTotal: data.manualGrantedTotal || 0,
          spentTotal: data.spentTotal || 0,
          debtAmount: data.debtAmount || 0,
          updatedAt: data.updatedAt
        });
      }
    });
    res.json(users);
  } catch (err) {
    console.error("[Admin Users] Erro:", err);
    res.status(500).json({ error: "Erro ao listar usu\xE1rios." });
  }
});
app.get("/api/admin/users/:uid/wallet", requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) return res.status(400).json({ error: "UID inv\xE1lido." });
    await adminAuth.getUser(targetUid);
    const wallet = await getOrCreateWallet(targetUid);
    const ledgerSnap = await adminDb.collection("wallets").doc(targetUid).collection("ledger").orderBy("timestamp", "desc").limit(50).get();
    const ledger = ledgerSnap.docs.map((d) => d.data());
    res.json({
      wallet,
      ledger
    });
  } catch (err) {
    console.error("[Admin User Wallet] Erro:", err);
    res.status(500).json({ error: "Erro ao carregar carteira do usu\xE1rio alvo." });
  }
});
app.post("/api/admin/credits/adjust", requireAdmin, async (req, res) => {
  try {
    const adminUid = req.user.uid;
    const { targetUid, action, amount, reason, category, idempotencyKey, referenceId } = req.body || {};
    if (!targetUid || !action || !amount || !reason || !idempotencyKey) {
      return res.status(400).json({
        error: "Campos obrigat\xF3rios ausentes: targetUid, action, amount, reason, idempotencyKey."
      });
    }
    if (action !== "grant" && action !== "revoke") {
      return res.status(400).json({ error: 'A\xE7\xE3o deve ser "grant" (conceder) ou "revoke" (retirar).' });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e3) {
      return res.status(400).json({ error: "Quantidade deve ser um inteiro entre 1 e 1000." });
    }
    if (typeof targetUid !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) {
      return res.status(400).json({ error: "UID inv\xE1lido." });
    }
    await adminAuth.getUser(targetUid);
    const result = await adminAdjustCredits({
      adminUid,
      targetUid,
      action,
      amount,
      reason,
      category: category || "support",
      idempotencyKey,
      referenceId
    });
    res.json(result);
  } catch (err) {
    console.error("[Admin Adjust Credits] Erro:", err);
    if (err.statusCode === 409 || err.message?.includes("Conflito de Idempot\xEAncia")) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || "Erro ao processar ajuste de cr\xE9ditos." });
  }
});
app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  try {
    const ordersSnap = await adminDb.collection("orders").orderBy("createdAt", "desc").limit(50).get();
    const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(orders);
  } catch (err) {
    console.error("[Admin Orders] Erro:", err);
    res.status(500).json({ error: "Erro ao buscar pedidos no servidor." });
  }
});
app.get("/api/admin/audit-logs", requireAdmin, async (_req, res) => {
  try {
    const logsSnap = await adminDb.collection("auditLogs").orderBy("timestamp", "desc").limit(50).get();
    const logs = logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(logs);
  } catch (err) {
    console.error("[Admin Audit Logs] Erro:", err);
    res.status(500).json({ error: "Erro ao buscar logs de auditoria." });
  }
});

// src/apiEntry.ts
function handler(req, res) {
  return app(req, res);
}
export {
  app,
  handler as default
};

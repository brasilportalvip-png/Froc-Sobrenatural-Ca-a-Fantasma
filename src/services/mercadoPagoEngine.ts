import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { CreditPackage, OrderItem, LedgerEntry, UserWallet } from '../types';

/**
 * Validação de Assinatura Oficial HMAC SHA-256 do Webhook do Mercado Pago
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(
  xSignatureHeader: string | undefined,
  xRequestIdHeader: string | undefined,
  dataId: string | undefined,
  secretKey: string
): boolean {
  if (!xSignatureHeader || !xRequestIdHeader || !dataId || !secretKey) {
    return false;
  }

  // O cabeçalho vem no formato: ts=1709...;v1=abcdef...
  const parts = xSignatureHeader.split(',').map((p) => p.trim());
  let ts = '';
  let v1 = '';

  for (const part of parts) {
    const [k, val] = part.split('=');
    if (k === 'ts') ts = val;
    if (k === 'v1') v1 = val;
  }

  if (!ts || !v1) {
    return false;
  }
  const timestamp = Number(ts);
  // The signature timestamp is milliseconds. Reject replayed notifications.
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60_000) {
    return false;
  }

  // Manifest template: id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
  let manifest = '';
  if (dataId) {
    manifest += `id:${dataId};`;
  }
  if (xRequestIdHeader) {
    manifest += `request-id:${xRequestIdHeader};`;
  }
  manifest += `ts:${ts};`;

  try {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    const bufA = Buffer.from(calculatedHash, 'hex');
    const bufB = Buffer.from(v1, 'hex');
    if (bufA.length !== bufB.length) {
      return false;
    }

    // Validação em tempo constante para mitigar timing attacks
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (err) {
    console.warn('[Webhook MP] Erro ao validar assinatura:', err);
    return false;
  }
}

/**
 * Catálogo Oficial do Servidor
 * Regra: Preços só aparecem e são permitidos se configurados nas variáveis de ambiente.
 * Nenhum preço ou desconto inventado!
 */
export function getCatalogPackages(): CreditPackage[] {
  const p50Price = parseInt(process.env.PACKAGE_50_PRICE_CENTS || '0', 10);
  const p75Price = parseInt(process.env.PACKAGE_75_PRICE_CENTS || '0', 10);
  const p100Price = parseInt(process.env.PACKAGE_100_PRICE_CENTS || '0', 10);

  return [
    {
      id: 'pack_50',
      credits: 50,
      consultationsEquivalent: 10,
      priceInCentsBRL: p50Price,
      active: p50Price > 0,
      description: 'Pacote 50 Créditos (equivalente a 10 consultas completas)',
    },
    {
      id: 'pack_75',
      credits: 75,
      consultationsEquivalent: 15,
      priceInCentsBRL: p75Price,
      active: p75Price > 0,
      description: 'Pacote 75 Créditos (equivalente a 15 consultas completas)',
    },
    {
      id: 'pack_100',
      credits: 100,
      consultationsEquivalent: 20,
      priceInCentsBRL: p100Price,
      active: p100Price > 0,
      description: 'Pacote 100 Créditos (equivalente a 20 consultas completas)',
    },
  ];
}

/**
 * Criação de Pedido com Preço Congelado e Integração Checkout Pro Mercado Pago
 */
export async function createMercadoPagoOrder(uid: string, packageId: string, userEmail: string): Promise<OrderItem> {
  const catalog = getCatalogPackages();
  const selectedPackage = catalog.find((p) => p.id === packageId);

  if (!selectedPackage) {
    throw new Error('Pacote inválido ou inexistente.');
  }

  if (!selectedPackage.active || selectedPackage.priceInCentsBRL <= 0) {
    throw new Error('Este pacote não possui preço configurado pelo proprietário no servidor.');
  }

  const orderId = `ord_${crypto.randomUUID()}`;
  const orderRef = adminDb.collection('orders').doc(orderId);

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const appUrl = process.env.APP_URL;
  if (!accessToken || !appUrl || !appUrl.startsWith('https://')) {
    throw new Error('Checkout indisponível: token ou APP_URL HTTPS não configurado.');
  }

  {
    // Chamada oficial da API de Preferências do Mercado Pago (Checkout Pro)
    try {
      const unitPriceBRL = selectedPackage.priceInCentsBRL / 100;
      const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Idempotency-Key': orderId,
        },
        body: JSON.stringify({
          items: [
            {
              id: selectedPackage.id,
              title: `Froc Sobrenatural - ${selectedPackage.credits} Créditos`,
              description: selectedPackage.description,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: unitPriceBRL,
            },
          ],
          payer: {
            email: userEmail,
          },
          external_reference: orderId,
          statement_descriptor: 'FROC SOBRENATURAL',
          back_urls: {
            success: `${appUrl}/?payment_status=success&orderId=${orderId}`,
            pending: `${appUrl}/?payment_status=pending&orderId=${orderId}`,
            failure: `${appUrl}/?payment_status=failure&orderId=${orderId}`,
          },
          auto_return: 'approved',
          notification_url: `${appUrl}/api/webhooks/mercadopago`,
        }),
      });

      if (!mpResponse.ok) throw new Error('Falha ao criar preferência no Mercado Pago.');
      const mpData = await mpResponse.json();
      const preferenceId = String(mpData.id || '');
      const initPoint = String(mpData.init_point || mpData.sandbox_init_point || '');
      if (!preferenceId || !/^https:\/\/((www\.)?mercadopago\.com(\.br)?|www\.mercadopago\.com\.br)\//.test(initPoint)) {
        throw new Error('Resposta de checkout inválida.');
      }
      const order: OrderItem = {
        id: orderId, uid, packageId: selectedPackage.id,
        credits: selectedPackage.credits, amountCentsBRL: selectedPackage.priceInCentsBRL,
        status: 'created', mercadoPagoPreferenceId: preferenceId,
        mercadoPagoInitPoint: initPoint, createdAt: Date.now(),
      };
      await orderRef.create(order);
      return order;
    } catch (err) {
      console.error('[MercadoPago] Preferência não disponível:', err);
      throw new Error('Não foi possível iniciar o pagamento. Tente novamente.');
    }
  }
}

/**
 * Processamento de Webhook Mercado Pago com Verificação Autorizada no Servidor
 */
export async function processMercadoPagoWebhook(paymentId: string): Promise<{ success: boolean; message: string }> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Mercado Pago não configurado no servidor.');
  }
  if (!/^\d{1,30}$/.test(paymentId)) throw new Error('Identificador de pagamento inválido.');

  // Consulta autoritativa à API do Mercado Pago
  const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!paymentResp.ok) {
    throw new Error(`Falha ao consultar pagamento ${paymentId} no Mercado Pago`);
  }

  const payment = await paymentResp.json();
  const orderId = payment.external_reference;
  const status = payment.status; // 'approved', 'rejected', 'cancelled', 'refunded', etc.

  if (!orderId) {
    throw new Error('Referência externa ausente no pagamento.');
  }
  if (String(payment.id) !== paymentId) throw new Error('ID do pagamento inconsistente.');

  // Confirm the merchant identity independently of the incoming webhook.
  const merchantResp = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!merchantResp.ok) throw new Error('Não foi possível verificar a conta recebedora.');
  const merchant = await merchantResp.json();
  if (!merchant.id || String(payment.collector_id) !== String(merchant.id)) {
    throw new Error('Conta recebedora diferente da conta configurada.');
  }

  const orderRef = adminDb.collection('orders').doc(orderId);
  const paymentEventRef = adminDb.collection('paymentEvents').doc(`mp_${paymentId}_${status}`);

  return await adminDb.runTransaction(async (t: any) => {
    // 1. TODAS AS LEITURAS ANTES DE QUALQUER ESCRITA (Regra obrigatória do Firestore)
    const eventSnap = await t.get(paymentEventRef);
    if (eventSnap.exists) {
      return { success: true, message: 'Evento já processado anteriormente.' };
    }

    const orderSnap = await t.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error(`Pedido ${orderId} não encontrado no banco`);
    }

    const order = orderSnap.data() as OrderItem;
    if (!order.mercadoPagoPreferenceId ||
        (payment.preference_id && String(payment.preference_id) !== order.mercadoPagoPreferenceId) ||
        payment.currency_id !== 'BRL' ||
        !Number.isFinite(Number(payment.transaction_amount)) ||
        Math.round(Number(payment.transaction_amount) * 100) !== order.amountCentsBRL) {
      throw new Error('Moeda, valor ou preferência não conferem com o pedido.');
    }
    if (order.mercadoPagoPaymentId && order.mercadoPagoPaymentId !== paymentId) {
      throw new Error('Pedido vinculado a outro pagamento.');
    }
    const uid = order.uid;
    const walletRef = adminDb.collection('wallets').doc(uid);
    const ledgerRef = walletRef.collection('ledger').doc();

    const walletSnap = await t.get(walletRef);

    // 2. TODAS AS ESCRITAS (t.set, t.update) APÓS O TÉRMINO DAS LEITURAS
    t.set(paymentEventRef, {
      paymentId,
      orderId,
      status,
      receivedAt: Date.now(),
      rawStatus: payment.status_detail,
    });

    if (status === 'approved' && order.status !== 'approved' && order.status !== 'refunded') {
      const walletExists = walletSnap.exists;
      let wallet: UserWallet;
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
          updatedAt: Date.now(),
        };
      } else {
        wallet = walletSnap.data() as UserWallet;
      }

      // Prior manual adjustments or chargebacks may have produced a debt.
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
          updatedAt: Date.now(),
        });
      } else {
        t.update(walletRef, {
          balance: newBalance,
          purchasedTotal: newPurchased,
          debtAmount: outstandingDebt - appliedToDebt,
          version: (wallet.version || 1) + 1,
          updatedAt: Date.now(),
        });
      }

      t.update(orderRef, {
        status: 'approved',
        mercadoPagoPaymentId: paymentId,
        approvedAt: Date.now(),
      });

      const ledgerEntry: LedgerEntry = {
        id: ledgerRef.id,
        uid,
        type: 'purchase',
        amount: order.credits - appliedToDebt,
        balanceAfter: newBalance,
        description: `Compra aprovada via Mercado Pago: +${order.credits} créditos`,
        referenceId: orderId,
        timestamp: Date.now(),
      };
      t.set(ledgerRef, ledgerEntry);

      return { success: true, message: `Créditos (+${order.credits}) aplicados com sucesso!` };
    } else if (status === 'refunded' || status === 'charged_back') {
      if (order.status === 'refunded') return { success: true, message: 'Estorno já registrado.' };
      if (order.status !== 'approved') {
        t.update(orderRef, { status: 'refunded', mercadoPagoPaymentId: paymentId });
        return { success: true, message: 'Estorno de pagamento não creditado registrado.' };
      }
      const wallet = walletSnap.exists ? walletSnap.data() as UserWallet : null;
      if (!wallet) throw new Error('Carteira não encontrada para conciliação.');
      const removed = Math.min(wallet.balance, order.credits);
      const newBalance = wallet.balance - removed;
      t.update(walletRef, {
        balance: newBalance,
        debtAmount: (wallet.debtAmount || 0) + order.credits - removed,
        purchasedTotal: Math.max(0, (wallet.purchasedTotal || 0) - order.credits),
        version: (wallet.version || 1) + 1,
        updatedAt: Date.now(),
      });
      t.update(orderRef, { status: 'refunded', refundedAt: Date.now() });
      t.set(ledgerRef, {
        id: ledgerRef.id, uid, type: 'refund', amount: -removed,
        balanceAfter: newBalance, referenceId: orderId,
        description: `Pagamento estornado; ${order.credits - removed} créditos em dívida`, timestamp: Date.now(),
      });
      return { success: true, message: 'Estorno conciliado na carteira.' };
    } else {
      if (order.status === 'approved' || order.status === 'refunded') {
        return { success: true, message: 'Estado final preservado.' };
      }
      t.update(orderRef, { status: status === 'rejected' ? 'declined' : 'pending' });
      return { success: true, message: `Status do pedido atualizado para ${status}.` };
    }
  });
}

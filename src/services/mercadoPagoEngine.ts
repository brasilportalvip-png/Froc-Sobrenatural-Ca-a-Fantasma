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
  if (!xSignatureHeader || !secretKey) {
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

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const orderRef = adminDb.collection('orders').doc(orderId);

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  let initPoint = '';
  let preferenceId = '';

  const appUrl = process.env.APP_URL || 'https://froc-sobrenatural.web.app';

  if (accessToken) {
    // Chamada oficial da API de Preferências do Mercado Pago (Checkout Pro)
    try {
      const unitPriceBRL = selectedPackage.priceInCentsBRL / 100;
      const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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

      if (mpResponse.ok) {
        const mpData = await mpResponse.json();
        preferenceId = mpData.id;
        initPoint = mpData.init_point || mpData.sandbox_init_point;
      } else {
        const errText = await mpResponse.text();
        console.error('[MercadoPago] Erro ao criar preferência:', errText);
      }
    } catch (err) {
      console.error('[MercadoPago] Falha de conexão:', err);
    }
  }

  const order: OrderItem = {
    id: orderId,
    uid,
    packageId: selectedPackage.id,
    credits: selectedPackage.credits,
    amountCentsBRL: selectedPackage.priceInCentsBRL,
    status: 'created',
    mercadoPagoPreferenceId: preferenceId || undefined,
    mercadoPagoInitPoint: initPoint || undefined,
    createdAt: Date.now(),
  };

  await orderRef.set(order);
  return order;
}

/**
 * Processamento de Webhook Mercado Pago com Verificação Autorizada no Servidor
 */
export async function processMercadoPagoWebhook(paymentId: string): Promise<{ success: boolean; message: string }> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return { success: false, message: 'Mercado Pago não configurado no servidor.' };
  }

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
    return { success: false, message: 'external_reference ausente no pagamento' };
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

    if (status === 'approved' && order.status !== 'approved') {
      const walletExists = walletSnap.exists;
      let wallet: UserWallet;
      if (!walletExists) {
        wallet = {
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
        wallet = walletSnap.data() as UserWallet;
      }

      const newBalance = wallet.balance + order.credits;
      const newPurchased = (wallet.purchasedTotal || 0) + order.credits;

      if (!walletExists) {
        t.set(walletRef, {
          ...wallet,
          balance: newBalance,
          purchasedTotal: newPurchased,
          updatedAt: Date.now(),
        });
      } else {
        t.update(walletRef, {
          balance: newBalance,
          purchasedTotal: newPurchased,
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
        amount: order.credits,
        balanceAfter: newBalance,
        description: `Compra aprovada via Mercado Pago: +${order.credits} créditos`,
        referenceId: orderId,
        timestamp: Date.now(),
      };
      t.set(ledgerRef, ledgerEntry);

      return { success: true, message: `Créditos (+${order.credits}) aplicados com sucesso!` };
    } else if (status === 'refunded' || status === 'charged_back') {
      t.update(orderRef, { status: 'refunded' });
      return { success: true, message: 'Estorno registrado.' };
    } else {
      t.update(orderRef, { status: status === 'rejected' ? 'declined' : 'pending' });
      return { success: true, message: `Status do pedido atualizado para ${status}.` };
    }
  });
}

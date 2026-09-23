import { adminDb } from './firebaseAdmin';
import { CreditPackage, OrderItem, LedgerEntry, UserWallet } from '../types';

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
    // Deduplicação de evento
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

    t.set(paymentEventRef, {
      paymentId,
      orderId,
      status,
      receivedAt: Date.now(),
      rawStatus: payment.status_detail,
    });

    if (status === 'approved' && order.status !== 'approved') {
      const walletSnap = await t.get(walletRef);
      let wallet: UserWallet;
      if (!walletSnap.exists) {
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

      t.update(walletRef, {
        balance: newBalance,
        purchasedTotal: newPurchased,
        version: wallet.version + 1,
        updatedAt: Date.now(),
      });

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

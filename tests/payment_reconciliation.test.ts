import test from 'node:test';
import assert from 'node:assert/strict';
import { adminDb } from '../src/services/firebaseAdmin';
import { processMercadoPagoWebhook } from '../src/services/mercadoPagoEngine';
import { adminAdjustCredits, reserveConsultationCredits, commitConsultationCredits } from '../src/services/creditEngine';
import { enforceUserRateLimit } from '../src/services/rateLimit';

function fakeFirestore(t: any) {
  const records = new Map<string, any>();
  t.mock.method(adminDb, 'runTransaction', async (callback: any) => {
    const pending: Array<() => void> = [];
    let wrote = false;
    const tx = {
      get: async (ref: any) => {
        if (wrote) throw new Error('Firestore: reads must precede writes');
        return { exists: records.has(ref.path), data: () => records.get(ref.path) };
      },
      set: (ref: any, value: any) => {
        wrote = true;
        pending.push(() => records.set(ref.path, value));
      },
      update: (ref: any, value: any) => {
        wrote = true;
        pending.push(() => records.set(ref.path, { ...records.get(ref.path), ...value }));
      },
    };
    const result = await callback(tx);
    pending.forEach((apply) => apply());
    return result;
  });
  return records;
}

function mockProvider(t: any, payment: Record<string, unknown>) {
  t.mock.method(globalThis, 'fetch', async (url: string) => ({
    ok: true,
    json: async () => String(url).includes('/users/me') ? { id: 777 } : payment,
  } as any));
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test-only-access-token';
  t.after(() => { delete process.env.MERCADO_PAGO_ACCESS_TOKEN; });
}

const order = {
  id: 'ord_test', uid: 'user_test', packageId: 'pack_50', credits: 50,
  amountCentsBRL: 2990, status: 'created', mercadoPagoPreferenceId: 'pref_test',
};
const payment = {
  id: 123, external_reference: 'ord_test', status: 'approved',
  collector_id: 777, preference_id: 'pref_test', currency_id: 'BRL', transaction_amount: 29.90,
};

test('approved payment credits once, repeated notification does not double credit', async (t) => {
  const records = fakeFirestore(t);
  records.set('orders/ord_test', { ...order });
  mockProvider(t, payment);

  await processMercadoPagoWebhook('123');
  await processMercadoPagoWebhook('123');
  assert.equal(records.get('wallets/user_test').balance, 50);
  assert.equal(records.get('orders/ord_test').status, 'approved');
});

test('wrong amount is rejected before any credit or payment event', async (t) => {
  const records = fakeFirestore(t);
  records.set('orders/ord_test', { ...order });
  mockProvider(t, { ...payment, transaction_amount: 1.00 });

  await assert.rejects(processMercadoPagoWebhook('123'), /Moeda, valor ou preferência/);
  assert.equal(records.has('wallets/user_test'), false);
  assert.equal([...records.keys()].some((key) => key.startsWith('paymentEvents/')), false);
});

test('refund records debt when already used credits exceed remaining balance', async (t) => {
  const records = fakeFirestore(t);
  records.set('orders/ord_test', { ...order, status: 'approved', mercadoPagoPaymentId: '123' });
  records.set('wallets/user_test', {
    uid: 'user_test', balance: 10, reserved: 0, purchasedTotal: 50,
    spentTotal: 40, version: 2, updatedAt: 1,
  });
  mockProvider(t, { ...payment, status: 'refunded' });

  await processMercadoPagoWebhook('123');
  assert.equal(records.get('wallets/user_test').balance, 0);
  assert.equal(records.get('wallets/user_test').debtAmount, 40);
  assert.equal(records.get('orders/ord_test').status, 'refunded');
});

test('manual grant is idempotent and conflicting replay is refused', async (t) => {
  const records = fakeFirestore(t);
  const input = {
    adminUid: 'admin_test', targetUid: 'user_test', action: 'grant' as const,
    amount: 10, reason: 'Correção de suporte', category: 'support' as const,
    idempotencyKey: 'adjustment-test-0001',
  };
  const first = await adminAdjustCredits(input);
  const repeated = await adminAdjustCredits(input);
  assert.equal(first.receipt.operationId, repeated.receipt.operationId);
  assert.equal(records.get('wallets/user_test').balance, 10);
  await assert.rejects(adminAdjustCredits({ ...input, amount: 20 }), /Conflito de Idempotência/);
  assert.equal(records.get('wallets/user_test').balance, 10);
});

test('a repeated consultation is blocked in progress and returns cached completed result', async (t) => {
  const records = fakeFirestore(t);
  records.set('wallets/user_test', {
    uid: 'user_test', balance: 25, reserved: 0, promotionalGranted: 25,
    purchasedTotal: 0, spentTotal: 0, version: 1, updatedAt: 1,
  });
  await reserveConsultationCredits('user_test', 'request_test_123', 'hash_test');
  await assert.rejects(reserveConsultationCredits('user_test', 'request_test_123', 'hash_test'), /CONSULTATION_IN_PROGRESS/);
  await commitConsultationCredits('user_test', 'request_test_123', 'test-model', 100, { reply: 'ok' });
  const replay = await reserveConsultationCredits('user_test', 'request_test_123', 'hash_test');
  assert.deepEqual(replay.cachedResult, { reply: 'ok' });
  assert.equal(records.get('wallets/user_test').balance, 20);
  assert.equal(records.get('wallets/user_test').spentTotal, 5);
});

test('rate limit stops further calls for the same user and operation', async (t) => {
  fakeFirestore(t);
  assert.equal(await enforceUserRateLimit('user_test', 'chat', 2), true);
  assert.equal(await enforceUserRateLimit('user_test', 'chat', 2), true);
  assert.equal(await enforceUserRateLimit('user_test', 'chat', 2), false);
  assert.equal(await enforceUserRateLimit('another_user', 'chat', 2), true);
});

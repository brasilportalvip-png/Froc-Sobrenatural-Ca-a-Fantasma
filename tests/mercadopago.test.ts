import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyMercadoPagoWebhookSignature, getCatalogPackages } from '../src/services/mercadoPagoEngine';

test('Catalog returns configured packages with active flags', () => {
  const catalog = getCatalogPackages();
  assert.equal(catalog.length, 3);
  assert.equal(catalog[0].id, 'pack_50');
  assert.equal(catalog[0].credits, 50);
  assert.equal(catalog[1].id, 'pack_75');
  assert.equal(catalog[2].id, 'pack_100');
});

test('Mercado Pago Webhook Signature rejects invalid or forged signatures', () => {
  const secret = 'fixture-secret-not-a-real-credential';
  const validHeader = 'ts=1710000000,v1=bad_hash_value';
  const result = verifyMercadoPagoWebhookSignature(validHeader, 'req_123', 'pay_456', secret);
  assert.equal(result, false);
});

test('webhook accepts matching HMAC and rejects stale timestamps', () => {
  const secret = 'fixture-only-secret';
  const requestId = 'request-local';
  const paymentId = '123';
  const ts = String(Date.now());
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const digest = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  assert.equal(verifyMercadoPagoWebhookSignature(`ts=${ts},v1=${digest}`, requestId, paymentId, secret), true);
  const staleTs = String(Date.now() - 11 * 60_000);
  const staleDigest = crypto.createHmac('sha256', secret).update(`id:${paymentId};request-id:${requestId};ts:${staleTs};`).digest('hex');
  assert.equal(verifyMercadoPagoWebhookSignature(`ts=${staleTs},v1=${staleDigest}`, requestId, paymentId, secret), false);
});

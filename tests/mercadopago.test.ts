import test from 'node:test';
import assert from 'node:assert/strict';
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
  const secret = '43251814cc231cea0835426040372e5ca38697cffb3318577a2e08f044dfdee9';
  const validHeader = 'ts=1710000000,v1=bad_hash_value';
  const result = verifyMercadoPagoWebhookSignature(validHeader, 'req_123', 'pay_456', secret);
  assert.equal(result, false);
});

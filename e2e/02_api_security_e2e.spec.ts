import { test, expect } from '@playwright/test';

test.describe('FROC E2E: API Security & Public Endpoints Quality Gate', () => {
  test('Public /api/status returns operational status and capabilities', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(['online', 'degraded']).toContain(data.status);
    const features = data.features || data;
    expect(features.localDspEngine).toBe(true);
    expect(features.audioAnalysis).toBe(true);
    expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
  });

  test('Public /api/tools/pricing returns authoritative pricing catalog', async ({ request }) => {
    const res = await request.get('/api/tools/pricing');
    expect(res.status()).toBe(200);

    const data = await res.json();
    const pricing = data.pricing || data;
    expect(pricing).toHaveProperty('communication');
    expect(pricing).toHaveProperty('vision');
    expect(pricing).toHaveProperty('ouija');
    expect(pricing.communication.costCredits).toBe(5);
    expect(pricing.communication.durationSeconds).toBe(240);
  });

  test('Protected routes strictly reject unauthenticated requests with 401', async ({ request }) => {
    const protectedRoutes = [
      { method: 'get', path: '/api/wallet' },
      { method: 'post', path: '/api/wallet/claim-free' },
      { method: 'get', path: '/api/tools/session/active' },
      { method: 'post', path: '/api/tools/session/start' },
      { method: 'post', path: '/api/tools/session/renew' },
      { method: 'post', path: '/api/orders/create' },
      { method: 'post', path: '/api/analyze' },
      { method: 'get', path: '/api/user/orders' },
      { method: 'get', path: '/api/user/role' },
      { method: 'get', path: '/api/admin/overview' },
      { method: 'get', path: '/api/admin/users' },
      { method: 'post', path: '/api/admin/credits/adjust' },
    ];

    for (const route of protectedRoutes) {
      const res = route.method === 'get'
        ? await request.get(route.path)
        : await request.post(route.path, { data: {} });

      expect(res.status(), `Rota ${route.method.toUpperCase()} ${route.path} deve retornar 401`).toBe(401);
    }
  });

  test('Mercado Pago webhook rejects invalid or forged signatures with 401 or 503 when secret is unconfigured', async ({ request }) => {
    const res = await request.post('/api/webhooks/mercadopago', {
      headers: {
        'x-signature': 'ts=1700000000,v1=bad_hash_value',
      },
      data: { type: 'payment', data: { id: '99999999' } },
    });

    expect([401, 503]).toContain(res.status());
    const data = await res.json();
    expect(data.error).toMatch(/(assinatura|não configurado)/i);
  });
});

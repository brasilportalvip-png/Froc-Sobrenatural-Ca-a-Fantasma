import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'http';
import { app } from '../src/serverApp';

// Helper to make test HTTP request to express app without listening on public port
function callApp(options: { method: string; path: string; headers?: Record<string, string>; body?: any }): Promise<{ status: number; headers: any; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const port = addr.port;

      const postData = options.body ? JSON.stringify(options.body) : '';
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (postData) {
        reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
      }

      const req = request.request(
        {
          hostname: '127.0.0.1',
          port,
          path: options.path,
          method: options.method,
          headers: reqHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            server.close(() => {
              let parsedBody = null;
              try {
                parsedBody = JSON.parse(data);
              } catch {
                parsedBody = null;
              }
              resolve({
                status: res.statusCode || 0,
                headers: res.headers,
                body: parsedBody,
                text: data,
              });
            });
          });
        }
      );

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  });
}

test('1. GET /api/status returns JSON and 200 with honest service status', async () => {
  const res = await callApp({ method: 'GET', path: '/api/status' });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body, 'object');
  assert.equal(res.body.service, 'froc-sobrenatural-api');
  assert.equal(typeof res.body.services, 'object');
  assert.equal(typeof res.body.features, 'object');
});

test('2. GET /api/packages returns JSON array with 3 packages', async () => {
  const res = await callApp({ method: 'GET', path: '/api/packages' });
  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 3);
  assert.equal(res.body[0].credits, 50);
});

test('3. Security: GET /api/wallet fails with 401 without Bearer token', async () => {
  const res = await callApp({ method: 'GET', path: '/api/wallet' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Token de autenticação não fornecido/);
});

test('4. Security: POST /api/analyze fails with 401 without Bearer token', async () => {
  const res = await callApp({
    method: 'POST',
    path: '/api/analyze',
    body: { question: 'Tem alguém aqui?' },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Token de autenticação não fornecido/);
});

test('5. Security: POST /api/chat fails with 401 without Bearer token', async () => {
  const res = await callApp({
    method: 'POST',
    path: '/api/chat',
    body: { messages: [{ role: 'user', content: 'Como calibrar o sensor?' }] },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Token de autenticação não fornecido/);
});

test('6. Security: Webhook rejects unverified signatures', async () => {
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'local-test-secret';
  const res = await callApp({
    method: 'POST',
    path: '/api/webhooks/mercadopago?data.id=12345',
    headers: {
      'x-signature': 'ts=1700000000,v1=fake_signature_hash',
      'x-request-id': 'req-test-999',
    },
    body: { action: 'payment.created' },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Assinatura inválida/);
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
});

test('7. Security: User orders endpoint /api/user/orders rejects anonymous request with 401', async () => {
  const res = await callApp({
    method: 'GET',
    path: '/api/user/orders',
  });
  assert.equal(res.status, 401);
});

test('8. Security: Admin overview /api/admin/overview rejects anonymous request with 401', async () => {
  const res = await callApp({
    method: 'GET',
    path: '/api/admin/overview',
  });
  assert.equal(res.status, 401);
});

test('9. Security: Admin adjustment /api/admin/credits/adjust rejects anonymous request with 401', async () => {
  const res = await callApp({
    method: 'POST',
    path: '/api/admin/credits/adjust',
    body: {
      targetUid: 'user-xyz',
      action: 'grant',
      amount: 50,
      reason: 'Teste sem autenticação',
      idempotencyKey: 'idemp-test-anon',
    },
  });
  assert.equal(res.status, 401);
});

test('10. Reliability: Non-existent API route /api/rota-inexistente returns 404 JSON', async () => {
  const res = await callApp({
    method: 'GET',
    path: '/api/rota-inexistente',
  });
  assert.equal(res.status, 404);
  assert.equal(typeof res.body, 'object');
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.match(res.headers['content-type'], /application\/json/);
});

test('11. Security: POST /api/wallet/claim-free rejects unauthenticated requests with 401', async () => {
  const res = await callApp({
    method: 'POST',
    path: '/api/wallet/claim-free',
  });
  assert.equal(res.status, 401);
});

test('12. Security: POST /api/orders/create rejects unauthenticated requests with 401', async () => {
  const res = await callApp({
    method: 'POST',
    path: '/api/orders/create',
    body: { packageId: 'pack_50' },
  });
  assert.equal(res.status, 401);
});

test('13. Security: GET /api/user/role rejects unauthenticated requests with 401', async () => {
  const res = await callApp({
    method: 'GET',
    path: '/api/user/role',
  });
  assert.equal(res.status, 401);
});

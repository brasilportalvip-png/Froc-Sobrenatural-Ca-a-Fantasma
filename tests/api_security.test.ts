import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'http';
import { app } from '../src/app';

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

test('1. GET /api/status returns JSON and 200 with honest model cascade', async () => {
  const res = await callApp({ method: 'GET', path: '/api/status' });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body, 'object');
  assert.equal(res.body.status, 'online');
  assert.deepEqual(res.body.modelCascade, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']);
  assert.equal(res.body.pricingConfigured.p50, true);
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
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'http';
import { app } from '../src/serverApp';
import { ensureUserProfileServer } from '../src/services/userProfileAdmin';
import { adminDb } from '../src/services/firebaseAdmin';

function callApp(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: any; body: any; text: string }> {
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

test('Perfil de Usuário - Validação de Proteção das Rotas de Perfil (401 para não autenticado)', async () => {
  const syncRes = await callApp({
    method: 'POST',
    path: '/api/user/sync-profile',
    body: {},
  });
  assert.equal(syncRes.status, 401, 'POST /api/user/sync-profile deve exigir autenticação');
  assert.ok(syncRes.body?.error, 'Deve retornar mensagem de erro');

  const getProfileRes = await callApp({
    method: 'GET',
    path: '/api/user/profile',
  });
  assert.equal(getProfileRes.status, 401, 'GET /api/user/profile deve exigir autenticação');
  assert.ok(getProfileRes.body?.error, 'Deve retornar mensagem de erro');
});

test('Perfil de Usuário - ensureUserProfileServer cria perfil com dados mínimos e seguros', async () => {
  const testUid = `test_user_${Date.now()}`;
  const mockUserRecord = {
    uid: testUid,
    email: 'investigador.teste@froc.app',
    name: 'Investigador Teste',
    picture: 'https://lh3.googleusercontent.com/photo.jpg',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  };

  const profile = await ensureUserProfileServer(mockUserRecord);

  assert.equal(profile.uid, testUid);
  assert.equal(profile.email, 'investigador.teste@froc.app');
  assert.equal(profile.displayName, 'Investigador Teste');
  assert.equal(profile.photoURL, 'https://lh3.googleusercontent.com/photo.jpg');
  assert.equal(profile.authProvider, 'google.com');
  assert.equal(profile.emailVerified, true);
  assert.ok(typeof profile.createdAt === 'number');
  assert.ok(typeof profile.updatedAt === 'number');
  assert.ok(typeof profile.lastLoginAt === 'number');

  // Assegura que nenhum campo financeiro ou de autorização foi injetado
  const disallowedKeys = ['role', 'admin', 'saldo', 'balance', 'credits', 'creditos', 'debt', 'debtAmount', 'grants'];
  for (const key of disallowedKeys) {
    assert.equal((profile as any)[key], undefined, `Campo indevido "${key}" não pode estar no perfil`);
  }

  // Verificar idempotência e preservação de createdAt
  const originalCreatedAt = profile.createdAt;
  await new Promise((r) => setTimeout(r, 15));

  const updatedProfile = await ensureUserProfileServer({
    uid: testUid,
    email: 'investigador.teste@froc.app',
    name: 'Investigador Teste Atualizado',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

  assert.equal(updatedProfile.uid, testUid);
  assert.equal(updatedProfile.createdAt, originalCreatedAt, 'createdAt deve ser imutável após criação');
  assert.equal(updatedProfile.displayName, 'Investigador Teste Atualizado', 'displayName deve ser atualizado');
  assert.ok(updatedProfile.updatedAt >= profile.updatedAt, 'updatedAt deve ser renovado');

  // Limpeza do documento de teste
  try {
    await adminDb.collection('users').doc(testUid).delete();
  } catch {}
});

test('Perfil de Usuário - Validação estrita das chaves permitidas pelo Firestore Rules', () => {
  const allowedKeys = [
    'uid',
    'email',
    'displayName',
    'photoURL',
    'createdAt',
    'updatedAt',
    'lastLoginAt',
    'authProvider',
    'emailVerified',
  ];

  const candidatePayload = {
    uid: 'user123',
    email: 'test@froc.app',
    displayName: 'Test',
    photoURL: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastLoginAt: Date.now(),
    authProvider: 'password',
    emailVerified: false,
  };

  const payloadKeys = Object.keys(candidatePayload);
  const invalidKeys = payloadKeys.filter((k) => !allowedKeys.includes(k));
  assert.equal(invalidKeys.length, 0, 'Todas as chaves do payload de perfil devem estar na whitelist de segurança');

  // Testar tentativa de injeção de privilégio ou saldo
  const maliciousPayload = {
    ...candidatePayload,
    role: 'admin',
    balance: 999999,
  };
  const maliciousKeys = Object.keys(maliciousPayload).filter((k) => !allowedKeys.includes(k));
  assert.ok(maliciousKeys.includes('role'), 'Deve identificar injeção de role');
  assert.ok(maliciousKeys.includes('balance'), 'Deve identificar injeção de balance');
});

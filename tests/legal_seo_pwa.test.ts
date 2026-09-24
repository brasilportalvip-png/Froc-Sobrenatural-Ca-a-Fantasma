import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { reconcileStaleReservations } from '../src/services/creditEngine';
import { adminDb } from '../src/services/firebaseAdmin';

test('Segurança Firestore Rules - Verificação estática da regra de usuários', () => {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules deve existir na raiz do projeto');

  const content = fs.readFileSync(rulesPath, 'utf8');

  // Verificar que allow write: if false está em vigor para users/{userId}
  const matchUsers = /match\s+\/users\/\{userId\}\s*\{([^}]+)\}/s.exec(content);
  assert.ok(matchUsers, 'Deve conter match /users/{userId}');
  const userRulesBody = matchUsers[1];

  assert.ok(
    userRulesBody.includes('allow write: if false;'),
    'Escrita direta no cliente em users/{userId} deve ser proibida (allow write: if false)'
  );
  assert.ok(
    userRulesBody.includes('allow read: if isOwner(userId);'),
    'Leitura deve ser restrita ao próprio dono do UID'
  );
});

test('Reconciliação Automática de Reservas Órfãs - Reconcile function executa sem quebras', async () => {
  const dummyUid = 'test_reconcile_' + Date.now();
  const res = await reconcileStaleReservations(dummyUid);
  assert.ok(typeof res.reconciledCount === 'number', 'Deve retornar contagem numérica de estornos');
  assert.equal(res.reconciledCount, 0, 'Não deve estornar nada para UID sem consultas presas');
});

test('SEO & PWA - Arquivos estáticos essenciais presentes', () => {
  const robots = path.join(process.cwd(), 'public', 'robots.txt');
  const sitemap = path.join(process.cwd(), 'public', 'sitemap.xml');
  const sw = path.join(process.cwd(), 'public', 'sw.js');
  const manifest = path.join(process.cwd(), 'public', 'manifest.webmanifest');

  assert.ok(fs.existsSync(robots), 'public/robots.txt deve existir');
  assert.ok(fs.existsSync(sitemap), 'public/sitemap.xml deve existir');
  assert.ok(fs.existsSync(sw), 'public/sw.js deve existir');
  assert.ok(fs.existsSync(manifest), 'public/manifest.webmanifest deve existir');

  const robotsContent = fs.readFileSync(robots, 'utf8');
  assert.ok(robotsContent.includes('sitemap.xml'), 'robots.txt deve referenciar sitemap.xml');
});

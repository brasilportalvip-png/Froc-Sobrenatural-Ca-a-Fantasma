import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { reconcileStaleReservations } from '../src/services/creditEngine';

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

  // Verificar que carteiras são protegidas contra escrita no cliente
  const matchWallets = /match\s+\/wallets\/\{userId\}\s*\{([^}]+)\}/s.exec(content);
  assert.ok(matchWallets, 'Deve conter match /wallets/{userId}');
  assert.ok(matchWallets[1].includes('allow write: if false;'), 'Carteira não pode sofrer escrita cliente');
});

test('Reconciliação Automática de Reservas Órfãs - Reconcile function executa sem quebras', async () => {
  const dummyUid = 'test_reconcile_' + Date.now();
  const res = await reconcileStaleReservations(dummyUid);
  assert.ok(typeof res.reconciledCount === 'number', 'Deve retornar contagem numérica de estornos');
  assert.equal(res.reconciledCount, 0, 'Não deve estornar nada para UID sem consultas presas');
});

test('SEO & PWA - Arquivos estáticos essenciais presentes e configurados', () => {
  const robots = path.join(process.cwd(), 'public', 'robots.txt');
  const sitemap = path.join(process.cwd(), 'public', 'sitemap.xml');
  const manifest = path.join(process.cwd(), 'public', 'manifest.webmanifest');

  assert.ok(fs.existsSync(robots), 'public/robots.txt deve existir');
  assert.ok(fs.existsSync(sitemap), 'public/sitemap.xml deve existir');
  assert.ok(fs.existsSync(manifest), 'public/manifest.webmanifest deve existir');

  const robotsContent = fs.readFileSync(robots, 'utf8');
  assert.ok(robotsContent.includes('sitemap.xml'), 'robots.txt deve referenciar sitemap.xml');
  assert.ok(robotsContent.includes('Allow: /politica-de-privacidade'), 'robots.txt deve permitir política de privacidade');
  assert.ok(robotsContent.includes('Allow: /termos-de-uso'), 'robots.txt deve permitir termos de uso');
  assert.ok(robotsContent.includes('Disallow: /admin'), 'robots.txt deve bloquear /admin');

  const sitemapContent = fs.readFileSync(sitemap, 'utf8');
  assert.ok(sitemapContent.includes('/politica-de-privacidade'), 'sitemap deve incluir politica-de-privacidade');
  assert.ok(sitemapContent.includes('/termos-de-uso'), 'sitemap deve incluir termos-de-uso');
  assert.ok(!sitemapContent.includes('/admin'), 'sitemap NÃO deve incluir /admin');
  assert.ok(!sitemapContent.includes('/api/'), 'sitemap NÃO deve incluir /api/');
});

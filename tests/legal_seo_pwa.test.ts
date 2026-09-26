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
  const ogImage = path.join(process.cwd(), 'public', 'og-image.png');
  const indexHtml = path.join(process.cwd(), 'index.html');

  assert.ok(fs.existsSync(robots), 'public/robots.txt deve existir');
  assert.ok(fs.existsSync(sitemap), 'public/sitemap.xml deve existir');
  assert.ok(fs.existsSync(manifest), 'public/manifest.webmanifest deve existir');
  assert.ok(fs.existsSync(ogImage), 'public/og-image.png (1200x630) deve existir');
  assert.ok(fs.statSync(ogImage).size > 1000, 'public/og-image.png deve ser um arquivo PNG válido não-vazio');

  const robotsContent = fs.readFileSync(robots, 'utf8');
  assert.ok(robotsContent.includes('sitemap.xml'), 'robots.txt deve referenciar sitemap.xml');
  assert.ok(robotsContent.includes('Allow: /politica-de-privacidade'), 'robots.txt deve permitir política de privacidade');
  assert.ok(robotsContent.includes('Allow: /termos-de-uso'), 'robots.txt deve permitir termos de uso');
  assert.ok(robotsContent.includes('Disallow: /admin'), 'robots.txt deve bloquear /admin');
  assert.ok(robotsContent.includes('Disallow: /painel'), 'robots.txt deve bloquear /painel');

  const sitemapContent = fs.readFileSync(sitemap, 'utf8');
  assert.ok(sitemapContent.includes('/politica-de-privacidade'), 'sitemap deve incluir politica-de-privacidade');
  assert.ok(sitemapContent.includes('/termos-de-uso'), 'sitemap deve incluir termos-de-uso');
  assert.ok(!sitemapContent.includes('/admin'), 'sitemap NÃO deve incluir /admin');
  assert.ok(!sitemapContent.includes('/api/'), 'sitemap NÃO deve incluir /api/');

  const htmlContent = fs.readFileSync(indexHtml, 'utf8');
  assert.ok(htmlContent.includes('og:image'), 'index.html deve conter og:image');
  assert.ok(htmlContent.includes('/og-image.png'), 'index.html deve referenciar /og-image.png');
  assert.ok(htmlContent.includes('og:image:width'), 'index.html deve definir og:image:width');
  assert.ok(htmlContent.includes('og:image:height'), 'index.html deve definir og:image:height');
  assert.ok(htmlContent.includes('twitter:image'), 'index.html deve conter twitter:image');
  assert.ok(!htmlContent.includes('user-scalable=no'), 'index.html não deve bloquear zoom (acessibilidade)');
});

test('Termos Legais e Privacidade - Verificação de integridade sem placeholders pendentes', () => {
  const privacyPath = path.join(process.cwd(), 'src', 'components', 'PrivacyPolicy.tsx');
  const termsPath = path.join(process.cwd(), 'src', 'components', 'TermsOfUse.tsx');

  assert.ok(fs.existsSync(privacyPath), 'PrivacyPolicy.tsx deve existir');
  assert.ok(fs.existsSync(termsPath), 'TermsOfUse.tsx deve existir');

  const privacyContent = fs.readFileSync(privacyPath, 'utf8');
  const termsContent = fs.readFileSync(termsPath, 'utf8');

  assert.ok(!privacyContent.includes('[INSERIR'), 'PrivacyPolicy não pode conter placeholders [INSERIR]');
  assert.ok(!termsContent.includes('[INSERIR'), 'TermsOfUse não pode conter placeholders [INSERIR]');
  assert.ok(privacyContent.includes('brasilportalvip@gmail.com'), 'PrivacyPolicy deve conter o e-mail de contato oficial');
  assert.ok(termsContent.includes('brasilportalvip@gmail.com'), 'TermsOfUse deve conter o e-mail de suporte oficial');
});


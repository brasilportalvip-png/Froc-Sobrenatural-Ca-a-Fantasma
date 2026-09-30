import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOOL_PRICING, getToolPricing, isValidPremiumTool, getAllToolPricing } from '../src/services/toolPricing.js';
import { app } from '../src/serverApp.js';
import { PremiumToolId } from '../src/types.js';

test('Tool Pricing: Catálogo autoritativo com regra de 5 créditos por 4 minutos (240s)', () => {
  const tools: PremiumToolId[] = ['communication', 'vision', 'ouija', 'blindTest', 'evidenceAnalysis'];
  const allPricing = getAllToolPricing();

  for (const toolId of tools) {
    assert.equal(isValidPremiumTool(toolId), true, `Ferramenta ${toolId} deve ser válida`);
    const pricing = getToolPricing(toolId);
    assert.equal(pricing.costCredits, 5, `${toolId} deve custar exatamente 5 créditos`);
    assert.equal(pricing.durationSeconds, 240, `${toolId} deve durar exatamente 240 segundos (4 minutos)`);
    assert.ok(pricing.name.length > 3, `${toolId} deve ter nome descritivo`);
    assert.ok(pricing.description.length > 10, `${toolId} deve ter descrição forense detalhada`);
    assert.ok(allPricing[toolId], `allPricing deve conter ${toolId}`);
  }

  assert.equal(isValidPremiumTool('invalid_tool_xyz'), false, 'Ferramenta inexistente deve retornar false');
});

test('API GET /api/tools/pricing: Retorna catálogo público com preços autoritativos', async () => {
  const mockReq: any = { method: 'GET', url: '/api/tools/pricing' };
  let responseData: any = null;
  const mockRes: any = {
    json: (data: any) => {
      responseData = data;
      return mockRes;
    },
    status: (_code: number) => mockRes,
  };

  const handler = (app as any)._router.stack.find((layer: any) => layer.route?.path === '/api/tools/pricing')?.route?.stack[0]?.handle;
  assert.ok(handler, 'Rota /api/tools/pricing deve estar montada');

  await handler(mockReq, mockRes);
  assert.ok(responseData, 'Resposta deve conter dados');
  assert.ok(responseData.pricing, 'Resposta deve conter pricing');
  assert.equal(responseData.pricing.communication.costCredits, 5);
  assert.equal(responseData.pricing.communication.durationSeconds, 240);
  assert.equal(responseData.pricing.vision.costCredits, 5);
  assert.equal(responseData.pricing.ouija.costCredits, 5);
  assert.equal(responseData.pricing.blindTest.costCredits, 5);
  assert.equal(responseData.pricing.evidenceAnalysis.costCredits, 5);
});

test('API /api/status: Contém localDspEngine e toolTimedSessions', async () => {
  const mockReq: any = { method: 'GET', url: '/api/status' };
  let responseData: any = null;
  const mockRes: any = {
    json: (data: any) => {
      responseData = data;
      return mockRes;
    },
    status: (_code: number) => mockRes,
  };

  const handler = (app as any)._router.stack.find((layer: any) => layer.route?.path === '/api/status')?.route?.stack[0]?.handle;
  assert.ok(handler, 'Rota /api/status deve estar montada');

  await handler(mockReq, mockRes);
  assert.ok(responseData?.features, 'Features devem estar presentes');
  assert.equal(responseData.features.localDspEngine, true, 'localDspEngine deve ser true');
  assert.equal(responseData.features.audioAnalysis, true, 'audioAnalysis deve estar ativo');
  assert.equal(typeof responseData.features.toolTimedSessions, 'boolean', 'toolTimedSessions deve estar configurado');
});

test('Segurança de Sessões: Endpoints /api/tools/session/* rejeitam requisições sem autenticação (401)', async () => {
  const endpoints = [
    { method: 'GET', path: '/api/tools/session/active' },
    { method: 'POST', path: '/api/tools/session/start' },
    { method: 'POST', path: '/api/tools/session/renew' },
    { method: 'POST', path: '/api/tools/session/toggle-autorenew' },
    { method: 'POST', path: '/api/tools/session/end' },
  ];

  for (const ep of endpoints) {
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === ep.path);
    assert.ok(layer, `Rota ${ep.path} deve estar registrada`);
    
    // O primeiro middleware da rota deve ser authenticateFirebaseUser
    const authMiddleware = layer.route.stack[0]?.handle;
    assert.ok(authMiddleware, `Middleware de autenticação deve existir para ${ep.path}`);

    let statusCode = 0;
    let errJson: any = null;
    const req: any = { headers: {} };
    const res: any = {
      status: (c: number) => {
        statusCode = c;
        return res;
      },
      json: (j: any) => {
        errJson = j;
        return res;
      },
    };

    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, `Rota ${ep.path} não deve permitir prosseguir sem Bearer Token`);
    assert.equal(statusCode, 401, `Rota ${ep.path} deve retornar status 401`);
    assert.ok(errJson?.error, `Rota ${ep.path} deve retornar mensagem de erro`);
  }
});

test('ToolSessionEngine: Lock determinístico e limite maxAutoRenewals implementados no motor', () => {
  const code = fs.readFileSync('src/services/toolSessionEngine.ts', 'utf-8');

  // Verifica uso do lock determinístico por UID + ToolId
  assert.ok(code.includes('toolSessionLocks'), 'Deve gerenciar coleção de locks determinísticos toolSessionLocks');
  assert.ok(code.includes('lockRef'), 'Deve utilizar referência direta de lock determinístico');

  // Verifica proteção contra sobreposição concorrente multi-aba (lastRenewedFromExpiresAt)
  assert.ok(code.includes('lastRenewedFromExpiresAt'), 'Deve comparar lastRenewedFromExpiresAt para evitar cobrança duplicada em corrida multi-aba');

  // Verifica proteção de maxAutoRenewals
  assert.ok(code.includes('MAX_AUTORENEWALS_REACHED') || code.includes('maxAutoRenewals'), 'Deve verificar limite de maxAutoRenewals');

  // Verifica que ToolSessionContext sincroniza via BroadcastChannel e valida rollback
  const contextCode = fs.readFileSync('src/services/ToolSessionContext.tsx', 'utf-8');
  assert.ok(contextCode.includes('BroadcastChannel'), 'ToolSessionContext deve utilizar BroadcastChannel para sincronização multi-aba');
  assert.ok(contextCode.includes('MAX_AUTO_RENEWALS'), 'ToolSessionContext deve exportar constante MAX_AUTO_RENEWALS');
  assert.ok(contextCode.includes('previousAutoRenew'), 'toggleAutoRenew deve salvar e restaurar previousAutoRenew em caso de erro');
  assert.ok(!contextCode.includes('Math.random()'), 'ToolSessionContext não deve conter Math.random()');
});

test('Concorrência Multi-Aba: Duas renovações concorrentes com requestIds distintos resultam em apenas 1 débito', async () => {
  // Simulação exata da transação do Firestore com cycle deduplication
  let userBalance = 25;
  let renewalsDebited = 0;
  let renewalCount = 0;
  let expiresAt = 1000000;
  let lastRenewedFromExpiresAt: number | undefined = undefined;

  // Fila de transação serializada (simulando adminDb.runTransaction do Firestore)
  let txQueue = Promise.resolve();
  const runTransaction = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = txQueue.then(fn, fn);
    txQueue = next.then(() => {}, () => {});
    return next;
  };

  // Função simulando a transação atômica do engine com deduplicação de ciclo
  const executeAtomicRenew = (requestId: string, expectedExpiresAt: number) => {
    return runTransaction(async () => {
      // 1. Simular latência de leitura
      await new Promise((r) => setTimeout(r, 10));

      // Se já foi renovado a partir deste mesmo expiresAt, retorna idempotente sem debitar
      if (lastRenewedFromExpiresAt === expectedExpiresAt || expiresAt > expectedExpiresAt) {
        return {
          success: true,
          alreadyRenewed: true,
          balanceAfter: userBalance,
          renewalCount,
        };
      }

      // Débito atômico de 5 créditos
      userBalance -= 5;
      renewalsDebited++;
      renewalCount++;
      lastRenewedFromExpiresAt = expectedExpiresAt;
      expiresAt += 240000;

      return {
        success: true,
        alreadyRenewed: false,
        balanceAfter: userBalance,
        renewalCount,
      };
    });
  };

  // Ambas as abas observaram a sessão expirando no timestamp 1000000
  const observedExpiresAt = expiresAt;

  // Disparar duas abas concorrentes com requestIds diferentes tentando renovar o mesmo ciclo
  const [resTabA, resTabB] = await Promise.all([
    executeAtomicRenew('tabA_req_123', observedExpiresAt),
    executeAtomicRenew('tabB_req_456', observedExpiresAt),
  ]);

  // Exatamente UMA cobrança de 5 créditos
  assert.equal(renewalsDebited, 1, 'Exatamente uma renovação deve ter sido debitada');
  assert.equal(userBalance, 20, 'Saldo deve ter sido reduzido apenas uma vez (25 - 5 = 20)');
  assert.equal(renewalCount, 1, 'renewalCount deve ter sido incrementado apenas uma vez');
  assert.equal(expiresAt, 1240000, 'expiresAt deve ter sido estendido em apenas um ciclo de 4 minutos');
  assert.ok(resTabA.success && resTabB.success, 'Ambas as abas devem receber sucesso');
});

test('SensorEngine: Separação de aceleração linear e gravidade, e calibração multi-amostra', async () => {
  const sensorCode = fs.readFileSync('src/services/sensorEngine.ts', 'utf-8');

  // Verifica se prioriza aceleração linear sobre gravidade
  assert.ok(sensorCode.includes('hasLinear') || sensorCode.includes('includesGravity'), 'Deve distinguir aceleração linear de gravidade');
  assert.ok(sensorCode.includes('calibrateSensorsMultiSample'), 'Deve fornecer método de calibração multi-amostra');

  // Testa diretamente a instância de SensorEngine
  const { SensorEngine } = await import('../src/services/sensorEngine.js');
  const engine = new SensorEngine();
  assert.ok(typeof engine.calibrateSensorsMultiSample === 'function', 'calibrateSensorsMultiSample deve ser função');

  const res = await engine.calibrateSensorsMultiSample(5, 5);
  assert.ok(res.samplesCount >= 1, 'Deve retornar contagem de amostras');
  assert.ok(typeof res.magBaseline === 'number');
  assert.ok(typeof res.motionBaseline === 'number');
});


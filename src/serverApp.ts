import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { AggregateField } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isFirebaseAdminConfigured } from './services/firebaseAdmin';
import {
  getOrCreateWallet,
  claimFreeGrant,
  reserveConsultationCredits,
  commitConsultationCredits,
  releaseConsultationCredits,
  adminAdjustCredits,
  reconcileStaleReservations,
} from './services/creditEngine';
import {
  getCatalogPackages,
  createMercadoPagoOrder,
  processMercadoPagoWebhook,
  verifyMercadoPagoWebhookSignature,
} from './services/mercadoPagoEngine';
import { executeGeminiWithFallback } from './services/aiOrchestrator';
import { enforceUserRateLimit } from './services/rateLimit';
import { ensureUserProfileServer, getUserProfileServer } from './services/userProfileAdmin';
import { getAllToolPricing, getToolPricing, isValidPremiumTool } from './services/toolPricing';
import {
  startToolSession,
  renewToolSession,
  toggleAutoRenew,
  endToolSession,
  getActiveToolSession,
  validateToolAccess,
} from './services/toolSessionEngine';
import { PremiumToolId } from './types';

dotenv.config();

export const app = express();

// Body parsers com limites rigorosos
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para verificar autenticação Firebase via Bearer Token
export async function authenticateFirebaseUser(req: any, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido ou cabeçalho inválido.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err: any) {
    console.warn('[Auth Middleware] Token inválido ou expirado:', err.message);
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}

// Helper para verificar se um UID é administrador reconhecido pelo servidor
export function isUserAdmin(uid: string, tokenClaims?: any): boolean {
  if (!uid) return false;
  // 1. Custom Claims do Firebase Auth
  if (tokenClaims && (tokenClaims.admin === true || tokenClaims.role === 'admin')) {
    return true;
  }
  // 2. Allowlist de UIDs configurada em variável de ambiente do servidor (ADMIN_UIDS)
  const envAdminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (envAdminUids.includes(uid)) {
    return true;
  }

  return false;
}

// Middleware para autorização de Administrador (401 se não autenticado, 403 se não autorizado)
export async function requireAdmin(req: any, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação necessária.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    // Exigir verificação estrita e verificação de revogação
    const decodedToken = await adminAuth.verifyIdToken(token, true);
    req.user = decodedToken;

    if (!isUserAdmin(decodedToken.uid, decodedToken)) {
      return res.status(403).json({
        error: 'Acesso negado. Esta rota é restrita a administradores reconhecidos.',
      });
    }

    next();
  } catch (err: any) {
    console.warn('[Admin Middleware] Token inválido ou expirado:', err.message);
    return res.status(401).json({ error: 'Sessão administrativa expirada ou inválida.' });
  }
}

// Inicializar Google Gen AI se chave estiver presente
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Falha ao inicializar GoogleGenAI:', err);
  }
}

// Helper centralizado para tratar erros do Firestore/DB com mensagens acionáveis
export function handleDbError(err: any, res: Response, fallbackMessage: string) {
  const isAuthError =
    err?.code === 16 ||
    err?.message?.includes('UNAUTHENTICATED') ||
    err?.details?.includes('UNAUTHENTICATED') ||
    err?.message?.includes('invalid authentication credentials');

  if (isAuthError) {
    console.error(
      '[Firestore Auth] ERRO 16 UNAUTHENTICATED: O backend na Vercel não possui credenciais válidas da Service Account do Firebase.',
      'Configure a variável FIREBASE_SERVICE_ACCOUNT_KEY no painel da Vercel (Settings -> Environment Variables).'
    );
    return res.status(503).json({
      error: 'Autenticação com o banco de dados pendente de configuração (FIREBASE_SERVICE_ACCOUNT_KEY).',
      code: 'FIRESTORE_UNAUTHENTICATED',
      details: 'Configure a variável FIREBASE_SERVICE_ACCOUNT_KEY no dashboard da Vercel para habilitar Firestore e Carteira.',
    });
  }

  console.error(`[API Error] ${fallbackMessage}:`, err);
  return res.status(500).json({ error: fallbackMessage });
}

// 1. Health & Status endpoint (seguro, informativo e sem expor segredos internos)
app.get('/api/status', (_req: Request, res: Response) => {
  const firebaseReady = isFirebaseAdminConfigured();
  const geminiReady = !!apiKey && !!ai;
  const mpReady = !!process.env.MERCADO_PAGO_ACCESS_TOKEN;

  // Status global honesto: 'ready' se os serviços centrais estiverem operacionais
  const isReady = firebaseReady && geminiReady;

  res.json({
    status: isReady ? 'ready' : 'degraded',
    service: 'froc-sobrenatural-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      geminiAi: geminiReady ? 'operational' : 'unavailable',
      firestoreAdmin: firebaseReady ? 'operational' : 'unauthenticated',
      mercadoPago: mpReady ? 'operational' : 'unconfigured',
    },
    features: {
      audioAnalysis: true, // Disponível via Gemini AI ou Motor Espectral Local (DSP)
      localDspEngine: true,
      investigationChat: geminiReady,
      blindTestVerification: geminiReady,
      evidenceLogging: true,
      walletAndCredits: firebaseReady,
      toolTimedSessions: firebaseReady,
      mercadoPagoCheckoutPro: mpReady,
    },
  });
});

// 2. Carteira e Créditos: Obter saldo e extrato (Requer Autenticação)
app.get('/api/wallet', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;

    // Sincronizar e assegurar documento users/{uid} no Firestore de forma não-bloqueante
    ensureUserProfileServer(req.user).catch((syncErr) => {
      console.warn('[Wallet] Aviso na sincronização do perfil do usuário:', syncErr?.message);
    });

    // Auto-reconciliação de eventuais reservas órfãs presas se a carteira apresentar créditos retidos
    let wallet = await getOrCreateWallet(uid);
    if (wallet.reserved && wallet.reserved > 0) {
      try {
        const { reconciledCount } = await reconcileStaleReservations(uid);
        if (reconciledCount > 0) {
          wallet = await getOrCreateWallet(uid);
        }
      } catch (recErr) {
        console.warn('[Wallet] Aviso na reconciliação de reservas órfãs:', recErr);
      }
    }

    const ledgerSnap = await adminDb
      .collection('wallets')
      .doc(uid)
      .collection('ledger')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    const ledger = ledgerSnap.docs.map((d: any) => d.data());

    res.json({
      wallet,
      ledger,
    });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao carregar carteira no servidor.');
  }
});

// 3. Resgate do Bônus de Boas-Vindas (25 créditos, requer e-mail verificado)
app.post('/api/wallet/claim-free', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email;
    const emailVerified = !!req.user.email_verified;

    const result = await claimFreeGrant(uid, email, emailVerified);
    res.json(result);
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao processar bônus gratuito.');
  }
});

// 4. Catálogo oficial de pacotes (preços configurados no servidor)
app.get('/api/packages', (_req: Request, res: Response) => {
  res.json(getCatalogPackages());
});

// 5. Criar Pedido Mercado Pago (Requer Autenticação)
app.post('/api/orders/create', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email || 'investigador@froc.app';
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({ error: 'packageId é obrigatório.' });
    }
    if (!await enforceUserRateLimit(uid, 'order', 5)) return res.status(429).json({ error: 'Aguarde antes de criar outro pedido.' });

    const order = await createMercadoPagoOrder(uid, packageId, email);
    res.json(order);
  } catch (err: any) {
    console.error('[API /api/orders/create] Erro:', err);
    res.status(400).json({ error: err.message || 'Falha ao criar pedido.' });
  }
});

// 6. Webhook Mercado Pago com Verificação de Assinatura
app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  try {
    const xSignature = req.headers['x-signature'] as string | undefined;
    const xRequestId = req.headers['x-request-id'] as string | undefined;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    if (!webhookSecret) return res.status(503).json({ error: 'Webhook não configurado.' });
    const dataId = req.query['data.id']?.toString();
    if (!verifyMercadoPagoWebhookSignature(xSignature, xRequestId, dataId, webhookSecret)) {
      console.warn('[Webhook MP] Rejeitado por assinatura inválida ou ausente');
      return res.status(401).json({ error: 'Assinatura inválida do webhook' });
    }

    const topic = req.query.topic || req.body?.type || req.query.type;
    const paymentId = dataId;

    if ((topic === 'payment' || req.body?.action === 'payment.created' || req.body?.action === 'payment.updated') && paymentId) {
      const result = await processMercadoPagoWebhook(paymentId.toString());
      return res.status(200).json(result);
    }

    res.status(200).send('OK');
  } catch (err: any) {
    console.error('[API Webhook MP] Erro:', err);
    res.status(500).json({ error: 'Erro interno no processamento do webhook' });
  }
});

// =========================================================================
// 7. SISTEMA CENTRAL DE SESSÕES TEMPORIZADAS POR FERRAMENTA (/api/tools/*)
// =========================================================================

// Catálogo autoritativo de preços e durações das ferramentas (5 créditos = 4 min)
app.get('/api/tools/pricing', (_req: Request, res: Response) => {
  res.json({
    pricing: getAllToolPricing(),
    standardRule: '5 créditos = 4 minutos de utilização contínua',
  });
});

// Obter sessão ativa do usuário para uma ferramenta específica
app.get('/api/tools/session/active', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const toolId = req.query.toolId as PremiumToolId;
    if (!isValidPremiumTool(toolId)) {
      return res.status(400).json({ error: 'Identificador de ferramenta inválido.' });
    }

    const session = await getActiveToolSession(uid, toolId);
    res.json({
      active: !!session,
      session: session || null,
    });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao verificar sessão ativa da ferramenta.');
  }
});

// Iniciar sessão de ferramenta premium (Reserva/Débito atômico de 5 créditos por 4 min)
app.post('/api/tools/session/start', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const { toolId, autoRenew } = req.body || {};
    const requestId = req.headers['x-request-id']?.toString() || req.body?.requestId || crypto.randomUUID();

    if (!isValidPremiumTool(toolId)) {
      return res.status(400).json({ error: 'Identificador de ferramenta inválido.' });
    }

    if (!await enforceUserRateLimit(uid, 'tool_session_start', 10)) {
      return res.status(429).json({ error: 'Aguarde antes de iniciar uma nova sessão.' });
    }

    const result = await startToolSession(uid, toolId, !!autoRenew, requestId);
    res.json({
      success: true,
      session: result.session,
      balance: result.balanceAfter,
    });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({
        error: 'Saldo insuficiente. Esta ferramenta requer 5 créditos disponíveis para 4 minutos de sessão.',
        code: 'INSUFFICIENT_CREDITS',
      });
    }
    if (err.message === 'REQUEST_UID_MISMATCH') {
      return res.status(403).json({ error: 'Chave de requisição inconsistente.' });
    }
    console.error('[Tools Session Start] Erro:', err);
    return handleDbError(err, res, 'Erro ao iniciar sessão da ferramenta.');
  }
});

// Renovar sessão de ferramenta premium (+4 min por 5 créditos)
app.post('/api/tools/session/renew', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const { toolSessionId } = req.body || {};
    const requestId = req.headers['x-request-id']?.toString() || req.body?.requestId || crypto.randomUUID();

    if (!toolSessionId || typeof toolSessionId !== 'string') {
      return res.status(400).json({ error: 'toolSessionId é obrigatório.' });
    }

    if (!await enforceUserRateLimit(uid, 'tool_session_renew', 15)) {
      return res.status(429).json({ error: 'Aguarde antes de renovar novamente.' });
    }

    const result = await renewToolSession(uid, toolSessionId, requestId);
    res.json({
      success: true,
      session: result.session,
      balance: result.balanceAfter,
    });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({
        error: 'Saldo insuficiente para renovação. Adquira créditos para continuar utilizando a ferramenta.',
        code: 'INSUFFICIENT_CREDITS',
      });
    }
    if (err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'Sessão não encontrada.' });
    }
    if (err.message === 'SESSION_UID_MISMATCH') {
      return res.status(403).json({ error: 'Acesso negado à sessão.' });
    }
    console.error('[Tools Session Renew] Erro:', err);
    return handleDbError(err, res, 'Erro ao renovar sessão da ferramenta.');
  }
});

// Alternar configuração de auto-renovação
app.post('/api/tools/session/toggle-autorenew', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const { toolSessionId, autoRenew } = req.body || {};

    if (!toolSessionId || typeof toolSessionId !== 'string') {
      return res.status(400).json({ error: 'toolSessionId é obrigatório.' });
    }

    const updated = await toggleAutoRenew(uid, toolSessionId, !!autoRenew);
    res.json({
      success: true,
      session: updated,
    });
  } catch (err: any) {
    if (err.message === 'SESSION_NOT_FOUND') return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (err.message === 'SESSION_UID_MISMATCH') return res.status(403).json({ error: 'Acesso negado à sessão.' });
    return handleDbError(err, res, 'Erro ao alternar auto-renovação.');
  }
});

// Encerrar sessão ativa
app.post('/api/tools/session/end', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const { toolSessionId } = req.body || {};

    if (!toolSessionId || typeof toolSessionId !== 'string') {
      return res.status(400).json({ error: 'toolSessionId é obrigatório.' });
    }

    const updated = await endToolSession(uid, toolSessionId);
    res.json({
      success: true,
      session: updated,
    });
  } catch (err: any) {
    if (err.message === 'SESSION_NOT_FOUND') return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (err.message === 'SESSION_UID_MISMATCH') return res.status(403).json({ error: 'Acesso negado à sessão.' });
    return handleDbError(err, res, 'Erro ao encerrar sessão.');
  }
});

// =========================================================================
// 8. Audio & Signal Analysis endpoint (Integração com Sessão e Fallback DSP Local)
// =========================================================================
app.post('/api/analyze', authenticateFirebaseUser, async (req: any, res: Response) => {
  const uid = req.user.uid;
  const requestId = req.headers['x-request-id']?.toString() || crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) {
    return res.status(400).json({ error: 'ID da consulta inválido.' });
  }

  const { question, audioBase64, mimeType, sensorContext, audioMetrics, toolSessionId } = req.body || {};

  // Validação de entrada
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Pergunta da consulta é obrigatória.' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'Pergunta excede limite de 500 caracteres.' });
  }

  // Validação de áudio se fornecido
  if (audioBase64 !== undefined && (typeof audioBase64 !== 'string' || !/^data:audio\/(webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-z0-9-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(audioBase64))) {
    return res.status(400).json({ error: 'Formato de áudio inválido.' });
  }
  const hasAudioData = typeof audioBase64 === 'string' && audioBase64.length > 100;
  if (hasAudioData && audioBase64.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'Áudio excede o limite máximo permitido de 8MB.' });
  }

  try {
    if (!await enforceUserRateLimit(uid, 'analyze', 15)) return res.status(429).json({ error: 'Limite temporário de consultas atingido.' });
  } catch {
    return res.status(503).json({ error: 'Controle de uso indisponível.' });
  }

  // Verificar se o usuário está dentro de uma Sessão Temporizada Paga ativa da ferramenta 'communication'
  const clientSessionId = req.headers['x-tool-session-id']?.toString() || toolSessionId;
  let inPaidToolSession = false;
  try {
    const access = await validateToolAccess(uid, 'communication', clientSessionId);
    if (access.allowed) {
      inPaidToolSession = true;
    }
  } catch (sessErr) {
    console.warn('[Analyze] Aviso ao validar sessão da ferramenta:', sessErr);
  }

  // Hash da requisição para idempotência estrita
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ question: question.trim(), audioBase64, mimeType, sensorContext, audioMetrics })).digest('hex');

  let creditReserved = false;

  // Se o usuário NÃO estiver em uma sessão paga ativa, cobrar/reservar os 5 créditos da consulta avulsa
  if (!inPaidToolSession) {
    try {
      const reservation = await reserveConsultationCredits(uid, requestId, payloadHash);
      creditReserved = reservation.success;

      // Se já havia sido completada com a mesma chave (idempotência perfeita)
      if (reservation.cachedResult) {
        return res.json(reservation.cachedResult);
      }
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({
          error: 'Saldo insuficiente. Inicie uma sessão de 4 minutos (5 créditos) ou adquira mais créditos.',
          code: 'INSUFFICIENT_CREDITS',
        });
      }
      if (err.message === 'CONSULTATION_IN_PROGRESS') {
        return res.status(409).json({
          error: 'Esta consulta já está sendo processada no momento.',
          code: 'IN_PROGRESS',
        });
      }
      if (err.message === 'REQUEST_PAYLOAD_MISMATCH' || err.message === 'REQUEST_UID_MISMATCH') {
        return res.status(403).json({
          error: 'Chave de requisição inconsistente ou pertencente a outra operação.',
        });
      }
      console.error('[Analyze] Falha ao reservar créditos:', err);
      return res.status(500).json({ error: 'Falha no controle transacional de créditos da carteira.' });
    }
  }

  // Se o Gemini não estiver configurado/disponível, executar imediatamente o Motor Espectral Local (Froc DSP v1.0)
  if (!ai) {
    const dbfs = typeof audioMetrics?.dbfs === 'number' ? audioMetrics.dbfs : -60;
    const peakHz = typeof audioMetrics?.peakFrequencyHz === 'number' ? audioMetrics.peakFrequencyHz : 0;
    const isVoiceBand = peakHz >= 250 && peakHz <= 3500;
    const hasSignificantVolume = dbfs > -38;

    let candidateTranscription: string | null = null;
    let conclusion = hasAudioData
      ? 'Áudio analisado pelo motor espectral local (Froc DSP). Nenhuma resposta ou fonema inteligível identificado.'
      : 'Consulta registrada sem amostra de áudio anexada. Nenhuma emissão acústica examinada.';
    let confidence = 0.05;
    const alternativeHypotheses = [
      'Ruído térmico do transdutor do microfone',
      'Variação normal do ruído de fundo ambiente',
      'Ausência de modulação harmônica de fala',
    ];

    if (hasAudioData && hasSignificantVolume && isVoiceBand) {
      conclusion = 'Sinal com energia na faixa vocal (250Hz–3.5kHz), porém sem inteligibilidade para transcrição fonética segura.';
      confidence = 0.35;
      alternativeHypotheses.unshift('Voz distante de pessoa no local ou vazamento acústico externo');
    }

    const localResult = {
      candidateTranscription,
      conclusion,
      confidence,
      voiceDetected: hasAudioData && hasSignificantVolume && isVoiceBand,
      acousticAnalysis: hasAudioData
        ? `[Medição Real DSP] dBFS: ${dbfs.toFixed(1)} | Frequência de pico: ${peakHz}Hz | Banda de fala: ${isVoiceBand ? 'Sim' : 'Não'}`
        : 'Nenhum arquivo de áudio enviado para análise espectral.',
      alternativeHypotheses,
      possibleName: null,
      controlQuestionSuggestion: 'Sugestão de pergunta de controle: "Pode repetir com clareza em voz audível?"',
      provider: 'Motor Espectral Local (Froc DSP v1.0)',
      isLocalOffline: true,
      inToolSession: inPaidToolSession,
    };

    if (creditReserved) {
      await commitConsultationCredits(uid, requestId, 'Motor Espectral Local (Froc DSP v1.0)', 50, localResult);
    }

    return res.json(localResult);
  }

  // Executar Gemini com fallback em cascata e timeout realista
  try {
    const prompt = `
Você é o analisador pericial da estação "Froc Sobrenatural Caça Fantasma".
Sua função é avaliar com ceticismo metodológico, análise espectral e física uma amostra de áudio e telemetria.

DIRETRIZES FUNDAMENTAIS DE RIGOR FORENSE:
1. NUNCA invente palavras, respostas, nomes ou identidades onde há apenas ruído, clique, sussurro inaudível ou estática.
2. Se o áudio for ausente, inaudível ou ruído aleatório, a conclusão DEVE ser: "Nenhuma resposta identificada." e candidateTranscription DEVE ser null.
3. Se a pergunta for "Quem está aí?" ou similar, e for audível um nome claro:
   - possibleName: {"name": "Nome", "segmentTime": "mm:ss-mm:ss", "verified": false}
   - conclusion: "Possível nome: [Nome] · fonte: áudio · trecho: [mm:ss–mm:ss] · ainda não verificado"
   - NUNCA declare "espírito identificado" ou "entidade respondeu".
4. Indique sempre a hipótese nula e causas físicas (fiação, pareidolia, ruído de vento, compressão digital).
5. O score de confiança deve ser estritamente entre 0.00 e 1.00.

DADOS DA AMOSTRA:
- Pergunta: "${question}"
- Telemetria de Sensores: ${JSON.stringify(sensorContext || {})}
- Métricas Autodeclaradas pelo Dispositivo: ${JSON.stringify(audioMetrics || {})}

FORMATO JSON OBRIGATÓRIO:
{
  "candidateTranscription": null ou string,
  "possibleName": null ou {"name": string, "segmentTime": string, "verified": false},
  "controlQuestionSuggestion": string,
  "voiceDetected": boolean,
  "confidence": number,
  "conclusion": string,
  "acousticAnalysis": string,
  "alternativeHypotheses": string[]
}
`;

    const parts: any[] = [{ text: prompt }];
    if (hasAudioData) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: audioBase64.replace(/^data:audio\/[a-z0-9-+.]+(?:;codecs=[a-z0-9-]+)?;base64,/i, ''),
        },
      });
    }

    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents: parts,
        config: { responseMimeType: 'application/json' },
      },
      { operationType: 'audio_analysis' }
    );

    const parsed: any = JSON.parse(cascadeResult.text || '{}');
    if (!parsed || typeof parsed !== 'object' || typeof parsed.conclusion !== 'string' ||
        typeof parsed.voiceDetected !== 'boolean' || typeof parsed.confidence !== 'number' ||
        !Number.isFinite(parsed.confidence) || !Array.isArray(parsed.alternativeHypotheses)) {
      throw new Error('Resposta de análise inválida.');
    }

    // Normalização e validação de schema rigorosa
    if (!parsed.voiceDetected || typeof parsed.confidence !== 'number' || parsed.confidence < 0.4 || !hasAudioData) {
      parsed.candidateTranscription = null;
      if (!hasAudioData) {
        parsed.voiceDetected = false;
      }
    }
    if (parsed.possibleName && typeof parsed.possibleName === 'object') {
      parsed.possibleName.verified = false;
    } else {
      parsed.possibleName = null;
    }
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    const finalResponse = {
      ...parsed,
      provider: `${cascadeResult.modelUsed} (Análise Forense)`,
      modelUsed: cascadeResult.modelUsed,
      executionTimeMs: cascadeResult.executionTimeMs,
      inToolSession: inPaidToolSession,
    };

    // Efetivar débito definitivo se houve reserva individual
    if (creditReserved) {
      await commitConsultationCredits(uid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs, finalResponse);
    }

    return res.json(finalResponse);
  } catch (err: any) {
    console.warn('[Analyze] Falha na IA neural, acionando fallback local com estorno:', err?.message);

    // Se houve reserva individual de créditos e a IA falhou, liberar imediatamente os créditos
    if (creditReserved) {
      try { await releaseConsultationCredits(uid, requestId, err?.message || 'Falha técnica'); }
      catch (releaseError) { console.error('[Analyze] Estorno pendente de conciliação:', releaseError); }
    }

    // Fornecer a avaliação do Motor Espectral Local para que o usuário não fique sem resposta pericial
    const dbfs = typeof audioMetrics?.dbfs === 'number' ? audioMetrics.dbfs : -60;
    const peakHz = typeof audioMetrics?.peakFrequencyHz === 'number' ? audioMetrics.peakFrequencyHz : 0;
    const isVoiceBand = peakHz >= 250 && peakHz <= 3500;
    const hasSignificantVolume = dbfs > -38;

    return res.status(200).json({
      candidateTranscription: null,
      voiceDetected: hasAudioData && hasSignificantVolume && isVoiceBand,
      confidence: hasAudioData && hasSignificantVolume && isVoiceBand ? 0.35 : 0.05,
      conclusion: hasAudioData && hasSignificantVolume && isVoiceBand
        ? 'Sinal com energia na faixa vocal (250Hz–3.5kHz), porém sem inteligibilidade para transcrição fonética segura.'
        : hasAudioData
        ? 'Áudio analisado pelo motor espectral local (Froc DSP). Nenhuma emissão fonética identificada.'
        : 'Consulta registrada sem amostra de áudio anexada.',
      acousticAnalysis: hasAudioData
        ? `[Medição Real DSP] dBFS: ${dbfs.toFixed(1)} | Frequência de pico: ${peakHz}Hz | Banda de fala: ${isVoiceBand ? 'Sim' : 'Não'}`
        : 'Nenhum arquivo de áudio enviado para análise espectral.',
      alternativeHypotheses: [
        'Ruído térmico do transdutor do microfone',
        'Variação normal do ruído de fundo ambiente',
        'Processamento fornecido via Motor Espectral Local após indisponibilidade da IA neural',
      ],
      possibleName: null,
      controlQuestionSuggestion: 'Sugestão de pergunta de controle: "Pode repetir com clareza em voz audível?"',
      provider: 'Motor Espectral Local (Froc DSP v1.0 - Fallback)',
      isFallback: true,
      creditsRefunded: creditReserved,
      inToolSession: inPaidToolSession,
    });
  }
});

// 8. Multi-turn Session Investigation Chat endpoint (AUTENTICAÇÃO OBRIGATÓRIA & QUOTA/COBRANÇA)
app.post('/api/chat', authenticateFirebaseUser, async (req: any, res: Response) => {
  const uid = req.user.uid;
  const requestId = req.headers['x-request-id']?.toString() || crypto.randomUUID();
  let reserved = false;
  try {
    const { messages, sessionContext } = req.body || {};
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) return res.status(400).json({ error: 'ID da consulta inválido.' });

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Histórico de mensagens é obrigatório.' });
    }

    // Limite de mensagens para prevenir abuso de tokens
    const recentMessages = messages.slice(-10);
    const lastUserMsg = recentMessages[recentMessages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user' || typeof lastUserMsg.content !== 'string' || lastUserMsg.content.length > 800 ||
        recentMessages.some((msg: any) => !['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string' || msg.content.length > 1000)) {
      return res.status(400).json({ error: 'Mensagem inválida ou excede limite de 800 caracteres.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Assistente indisponível. Nenhum crédito foi reservado.' });
    }

    if (!await enforceUserRateLimit(uid, 'chat', 20)) return res.status(429).json({ error: 'Limite temporário do chat atingido.' });

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ messages: recentMessages, sessionContext })).digest('hex');
    const reservation = await reserveConsultationCredits(uid, requestId, payloadHash);
    if (reservation.cachedResult) return res.json(reservation.cachedResult);
    reserved = true;

    const systemInstruction = `
Você é o assistente técnico de metodologia e análise da estação "Froc Sobrenatural Caça Fantasma".
Seu papel é orientar o pesquisador sobre método científico, calibração de sensores, hipótese nula, descarte de interferências rotineiras e duplo-cego.
REGRAS:
1. NUNCA finja ser um espírito, fantasma ou entidade. Você é um analista de laboratório.
2. Responda em Português do Brasil com clareza, concisão e foco científico.
`;

    const contents = recentMessages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content).slice(0, 1000) }],
    }));

    if (sessionContext) {
      contents.unshift({
        role: 'user',
        parts: [{ text: `[CONTEXTO DA SESSÃO]:\n${JSON.stringify(sessionContext).slice(0, 1000)}` }],
      });
      contents.splice(1, 0, {
        role: 'model',
        parts: [{ text: 'Entendido. Contexto metodológico da sessão registrado.' }],
      });
    }

    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents,
        config: { systemInstruction },
      },
      { operationType: 'chat' }
    );

    const result = {
      reply: cascadeResult.text || 'Nenhuma análise gerada.',
      provider: cascadeResult.modelUsed,
      costCredits: 5,
    };
    if (!cascadeResult.text) throw new Error('Assistente retornou resposta vazia.');
    await commitConsultationCredits(uid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs, result);
    res.json(result);
  } catch (err: any) {
    console.error('Chat error:', err);
    if (reserved) {
      try { await releaseConsultationCredits(uid, requestId, 'Falha técnica'); }
      catch (releaseError) { console.error('[Chat] Estorno pendente de conciliação:', releaseError); }
    }
    if (err.message === 'INSUFFICIENT_BALANCE') return res.status(402).json({ error: 'Saldo insuficiente: chat custa 5 créditos.' });
    if (err.message === 'CONSULTATION_IN_PROGRESS') return res.status(409).json({ error: 'Consulta em processamento.' });
    if (err.message === 'REQUEST_PAYLOAD_MISMATCH' || err.message === 'REQUEST_UID_MISMATCH') return res.status(409).json({ error: 'ID da consulta pertence a outra solicitação.' });
    res.status(500).json({
      reply: 'Erro ao processar consulta com o assistente.',
      error: 'Falha técnica na consulta.',
    });
  }
});

// =========================================================================
// 9. PAINEL DO USUÁRIO & COMPRAS (/api/user/*)
// =========================================================================

// Listar compras e pedidos do usuário autenticado
app.get('/api/user/orders', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const ordersSnap = await adminDb
      .collection('orders')
      .where('uid', '==', uid)
      .limit(50)
      .get();

    const orders = ordersSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json(orders);
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao buscar histórico de pedidos.');
  }
});

// Status de Administrador para o usuário atual (retorna boolean sem expor regras internas)
app.get('/api/user/role', authenticateFirebaseUser, async (req: any, res: Response) => {
  const isAdmin = isUserAdmin(req.user.uid, req.user);
  res.json({
    uid: req.user.uid,
    isAdmin,
    email: req.user.email,
    emailVerified: !!req.user.email_verified,
  });
});

// Sincronizar ou criar documento users/{uid} com identidade validada por token Bearer
app.post('/api/user/sync-profile', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const profile = await ensureUserProfileServer(req.user);
    res.json({ success: true, profile });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao sincronizar perfil de usuário no servidor.');
  }
});

// Obter documento users/{uid} do usuário autenticado
app.get('/api/user/profile', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const profile = (await getUserProfileServer(req.user.uid)) || (await ensureUserProfileServer(req.user));
    res.json(profile);
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao recuperar perfil de usuário.');
  }
});

// =========================================================================
// 10. PAINEL DO ADMINISTRADOR (/api/admin/*)
// =========================================================================

// Visão Geral e Métricas Consolidadas do Admin (com agregações autoritativas Firestore)
app.get('/api/admin/overview', requireAdmin, async (_req: any, res: Response) => {
  try {
    let totalRegisteredUsers = 0;
    let totalWalletsCount = 0;
    let totalOrdersCount = 0;
    let totalConsultationsCount = 0;
    let isPartial = false;

    // 1. Contagens autoritativas via Firestore aggregation count()
    try {
      const [uCountSnap, wCountSnap, oCountSnap, cCountSnap] = await Promise.all([
        adminDb.collection('users').count().get(),
        adminDb.collection('wallets').count().get(),
        adminDb.collection('orders').count().get(),
        adminDb.collection('consultations').count().get(),
      ]);
      totalRegisteredUsers = uCountSnap.data().count;
      totalWalletsCount = wCountSnap.data().count;
      totalOrdersCount = oCountSnap.data().count;
      totalConsultationsCount = cCountSnap.data().count;
    } catch (countErr) {
      console.warn('[Admin Overview] Agregação count() falhou ou não suportada no ambiente, usando fallback:', countErr);
      const [uSnap, wSnap, oSnap, cSnap] = await Promise.all([
        adminDb.collection('users').limit(500).get(),
        adminDb.collection('wallets').limit(500).get(),
        adminDb.collection('orders').limit(500).get(),
        adminDb.collection('consultations').limit(500).get(),
      ]);
      totalRegisteredUsers = uSnap.size;
      totalWalletsCount = wSnap.size;
      totalOrdersCount = oSnap.size;
      totalConsultationsCount = cSnap.size;
      isPartial = uSnap.size >= 500 || wSnap.size >= 500 || oSnap.size >= 500 || cSnap.size >= 500;
    }

    // 2. Métricas financeiras e agregações de carteira
    let totalCreditsInCirculation = 0;
    let totalPurchasedCredits = 0;
    let totalSpentCredits = 0;
    let totalReservedCredits = 0;

    try {
      const walletAggSnap = await adminDb.collection('wallets').aggregate({
        circulation: AggregateField.sum('balance'),
        purchased: AggregateField.sum('purchasedTotal'),
        spent: AggregateField.sum('spentTotal'),
        reserved: AggregateField.sum('reserved'),
      }).get();

      const aggData = walletAggSnap.data();
      totalCreditsInCirculation = aggData.circulation || 0;
      totalPurchasedCredits = aggData.purchased || 0;
      totalSpentCredits = aggData.spent || 0;
      totalReservedCredits = aggData.reserved || 0;
    } catch (aggErr) {
      console.warn('[Admin Overview] AggregateField.sum não disponível no ambiente, somando via amostragem:', aggErr);
      const walletsSampleSnap = await adminDb.collection('wallets').limit(500).get();
      walletsSampleSnap.forEach((doc: any) => {
        const data = doc.data();
        totalCreditsInCirculation += data.balance || 0;
        totalPurchasedCredits += data.purchasedTotal || 0;
        totalSpentCredits += data.spentTotal || 0;
        totalReservedCredits += data.reserved || 0;
      });
      if (walletsSampleSnap.size >= 500) {
        isPartial = true;
      }
    }

    // 3. Pedidos agrupados por status
    const ordersCountByStatus: Record<string, number> = {
      created: 0,
      pending: 0,
      approved: 0,
      declined: 0,
      refunded: 0,
    };

    try {
      const [appSnap, pendSnap, refSnap, decSnap, creSnap] = await Promise.all([
        adminDb.collection('orders').where('status', '==', 'approved').count().get(),
        adminDb.collection('orders').where('status', '==', 'pending').count().get(),
        adminDb.collection('orders').where('status', '==', 'refunded').count().get(),
        adminDb.collection('orders').where('status', '==', 'declined').count().get(),
        adminDb.collection('orders').where('status', '==', 'created').count().get(),
      ]);
      ordersCountByStatus.approved = appSnap.data().count;
      ordersCountByStatus.pending = pendSnap.data().count;
      ordersCountByStatus.refunded = refSnap.data().count;
      ordersCountByStatus.declined = decSnap.data().count;
      ordersCountByStatus.created = creSnap.data().count;
    } catch {
      const ordersSnap = await adminDb.collection('orders').limit(500).get();
      ordersSnap.forEach((doc: any) => {
        const d = doc.data();
        const status = d.status || 'created';
        ordersCountByStatus[status] = (ordersCountByStatus[status] || 0) + 1;
      });
      if (ordersSnap.size >= 500) isPartial = true;
    }

    // 4. Consultas
    let totalConsultationsCompleted = 0;
    let totalConsultationsFailed = 0;
    try {
      const [compSnap, failSnap] = await Promise.all([
        adminDb.collection('consultations').where('status', '==', 'completed').count().get(),
        adminDb.collection('consultations').where('status', '==', 'failed_released').count().get(),
      ]);
      totalConsultationsCompleted = compSnap.data().count;
      totalConsultationsFailed = failSnap.data().count;
    } catch {
      const consultationsSnap = await adminDb.collection('consultations').limit(500).get();
      consultationsSnap.forEach((doc: any) => {
        const d = doc.data();
        if (d.status === 'completed') totalConsultationsCompleted++;
        if (d.status === 'failed_released') totalConsultationsFailed++;
      });
      if (consultationsSnap.size >= 500) isPartial = true;
    }

    const envAdminUids = (process.env.ADMIN_UIDS || '').split(',').filter(Boolean);

    res.json({
      totalUsers: Math.max(totalRegisteredUsers, totalWalletsCount),
      walletsCount: totalWalletsCount,
      registeredUsersCount: totalRegisteredUsers,
      totalOrdersCount,
      totalConsultationsCount,
      metricsPartial: isPartial,
      totalCreditsInCirculation,
      totalPurchasedCredits,
      totalSpentCredits,
      totalReservedCredits,
      totalConsultationsCompleted,
      totalConsultationsFailed,
      ordersCountByStatus,
      apiHealth: {
        status: 'online',
        geminiOnline: !!apiKey,
        mercadoPagoOnline: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
        adminConfigured: envAdminUids.length > 0,
      },
    });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao compilar visão geral do sistema.');
  }
});

// Listar Usuários e Carteiras (Admin - Usuários como entidade primária com busca global indexada e paginação consistente)
app.get('/api/admin/users', requireAdmin, async (req: any, res: Response) => {
  try {
    const rawSearch = (req.query.search as string || '').trim();
    const search = rawSearch.toLowerCase();
    const requestedLimit = Number(req.query.limit || 25);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 25;
    const startAfterUid = (req.query.startAfter as string || '').trim();

    // SE HOUVER TERMO DE BUSCA: Executa busca global indexada por UID, E-mail ou Nome
    if (rawSearch) {
      const matchedUserMap = new Map<string, any>();

      // 1. Busca direta por UID exato
      if (/^[a-zA-Z0-9:_-]{1,128}$/.test(rawSearch)) {
        try {
          const directUserSnap = await adminDb.collection('users').doc(rawSearch).get();
          if (directUserSnap.exists) {
            matchedUserMap.set(directUserSnap.id, directUserSnap.data());
          }
        } catch {}
      }

      // 2. Busca indexada por E-mail (exato, minúsculo e prefixo)
      try {
        const [emailExactSnap, emailLowerSnap] = await Promise.all([
          adminDb.collection('users').where('email', '==', rawSearch).limit(limit).get(),
          adminDb.collection('users').where('emailLower', '==', search).limit(limit).get(),
        ]);
        emailExactSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));
        emailLowerSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));

        if (matchedUserMap.size < limit) {
          const emailPrefixSnap = await adminDb
            .collection('users')
            .where('email', '>=', rawSearch)
            .where('email', '<=', rawSearch + '\uf8ff')
            .limit(limit)
            .get();
          emailPrefixSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));
        }
      } catch (e) {
        console.warn('[Admin Search] Erro ao buscar por e-mail:', e);
      }

      // 3. Busca indexada por Nome de Exibição (displayName exato, capitalizado e normalizado em minúsculo)
      try {
        const capitalizedSearch = rawSearch.charAt(0).toUpperCase() + rawSearch.slice(1);
        const [nameExactSnap, nameCapSnap, nameLowerSnap] = await Promise.all([
          adminDb.collection('users').where('displayName', '>=', rawSearch).where('displayName', '<=', rawSearch + '\uf8ff').limit(limit).get(),
          adminDb.collection('users').where('displayName', '>=', capitalizedSearch).where('displayName', '<=', capitalizedSearch + '\uf8ff').limit(limit).get(),
          adminDb.collection('users').where('displayNameLower', '>=', search).where('displayNameLower', '<=', search + '\uf8ff').limit(limit).get(),
        ]);
        nameExactSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));
        nameCapSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));
        nameLowerSnap.docs.forEach((doc: any) => matchedUserMap.set(doc.id, doc.data()));
      } catch (e) {
        console.warn('[Admin Search] Erro ao buscar por displayName:', e);
      }

      // 4. Se nada foi encontrado em users, verificar se existe na coleção wallets
      if (matchedUserMap.size === 0 && /^[a-zA-Z0-9:_-]{1,128}$/.test(rawSearch)) {
        try {
          const directWalletSnap = await adminDb.collection('wallets').doc(rawSearch).get();
          if (directWalletSnap.exists) {
            matchedUserMap.set(rawSearch, { uid: rawSearch });
          }
        } catch {}
      }

      const matchedUids = Array.from(matchedUserMap.keys()).slice(0, limit);
      const walletSnaps = await Promise.all(
        matchedUids.map((uid) => adminDb.collection('wallets').doc(uid).get())
      );
      const walletMap = new Map<string, any>();
      walletSnaps.forEach((ws: any) => {
        if (ws.exists) walletMap.set(ws.id, ws.data());
      });

      const users = matchedUids.map((uid) => {
        const prof = matchedUserMap.get(uid) || {};
        const wData = walletMap.get(uid) || {};
        return {
          uid,
          email: prof.email || null,
          displayName: prof.displayName || null,
          photoURL: prof.photoURL || null,
          authProvider: prof.authProvider || 'password',
          emailVerified: !!prof.emailVerified,
          balance: wData.balance || 0,
          reserved: wData.reserved || 0,
          promotionalGranted: wData.promotionalGranted || 0,
          purchasedTotal: wData.purchasedTotal || 0,
          manualGrantedTotal: wData.manualGrantedTotal || 0,
          spentTotal: wData.spentTotal || 0,
          debtAmount: wData.debtAmount || 0,
          updatedAt: wData.updatedAt || prof.updatedAt || null,
          hasWallet: walletMap.has(uid),
          hasProfile: !!prof.createdAt || !!prof.email,
        };
      });

      return res.json({
        users,
        hasMore: false,
        nextCursor: null,
      });
    }

    // SEM BUSCA: Paginação Pura Ordenada por UID (__name__)
    let usersQuery: any = adminDb.collection('users').orderBy('__name__');
    if (startAfterUid) {
      usersQuery = usersQuery.startAfter(startAfterUid);
    }
    // Fetch limit + 1 para saber com certeza se há próxima página
    const usersSnap = await usersQuery.limit(limit + 1).get();

    const hasMoreUsers = usersSnap.docs.length > limit;
    const pageDocs = hasMoreUsers ? usersSnap.docs.slice(0, limit) : usersSnap.docs;
    const nextCursor = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

    const userUids = pageDocs.map((d: any) => d.id);
    const walletSnaps = await Promise.all(
      userUids.map((uid: string) => adminDb.collection('wallets').doc(uid).get())
    );

    const walletMap = new Map<string, any>();
    walletSnaps.forEach((ws: any) => {
      if (ws.exists) walletMap.set(ws.id, ws.data());
    });

    const userMap = new Map<string, any>();
    pageDocs.forEach((doc: any) => {
      userMap.set(doc.id, doc.data());
    });

    let mergedList: any[] = [];
    userUids.forEach((uid: string) => {
      const prof = userMap.get(uid) || {};
      const wData = walletMap.get(uid) || {};
      mergedList.push({
        uid,
        email: prof.email || null,
        displayName: prof.displayName || null,
        photoURL: prof.photoURL || null,
        authProvider: prof.authProvider || 'password',
        emailVerified: !!prof.emailVerified,
        balance: wData.balance || 0,
        reserved: wData.reserved || 0,
        promotionalGranted: wData.promotionalGranted || 0,
        purchasedTotal: wData.purchasedTotal || 0,
        manualGrantedTotal: wData.manualGrantedTotal || 0,
        spentTotal: wData.spentTotal || 0,
        debtAmount: wData.debtAmount || 0,
        updatedAt: wData.updatedAt || prof.updatedAt || null,
        hasWallet: walletMap.has(uid),
        hasProfile: true,
      });
    });

    // Se a coleção users estiver vazia e for primeira página, buscar diretamente em wallets
    if (mergedList.length === 0 && !startAfterUid) {
      const walletsSnap = await adminDb.collection('wallets').orderBy('__name__').limit(limit).get();
      walletsSnap.forEach((doc: any) => {
        const wData = doc.data();
        mergedList.push({
          uid: doc.id,
          email: null,
          displayName: null,
          photoURL: null,
          authProvider: 'password',
          emailVerified: false,
          balance: wData.balance || 0,
          reserved: wData.reserved || 0,
          promotionalGranted: wData.promotionalGranted || 0,
          purchasedTotal: wData.purchasedTotal || 0,
          manualGrantedTotal: wData.manualGrantedTotal || 0,
          spentTotal: wData.spentTotal || 0,
          debtAmount: wData.debtAmount || 0,
          updatedAt: wData.updatedAt || null,
          hasWallet: true,
          hasProfile: false,
        });
      });
    }

    res.json({
      users: mergedList,
      hasMore: hasMoreUsers,
      nextCursor: hasMoreUsers ? nextCursor : null,
    });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao listar usuários.');
  }
});

// Detalhes da Carteira e Extrato de um Usuário Específico (Admin)
app.get('/api/admin/users/:uid/wallet', requireAdmin, async (req: any, res: Response) => {
  try {
    const targetUid = req.params.uid;
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) return res.status(400).json({ error: 'UID inválido.' });
    await adminAuth.getUser(targetUid);
    const wallet = await getOrCreateWallet(targetUid);

    const ledgerSnap = await adminDb
      .collection('wallets')
      .doc(targetUid)
      .collection('ledger')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const ledger = ledgerSnap.docs.map((d: any) => d.data());

    res.json({
      wallet,
      ledger,
    });
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao carregar carteira do usuário alvo.');
  }
});

// Ajuste Manual de Créditos (Concessão ou Retirada) com Idempotência Estrita (Admin)
app.post('/api/admin/credits/adjust', requireAdmin, async (req: any, res: Response) => {
  try {
    const adminUid = req.user.uid;
    const { targetUid, action, amount, reason, category, idempotencyKey, referenceId } = req.body || {};

    if (!targetUid || !action || !amount || !reason || !idempotencyKey) {
      return res.status(400).json({
        error: 'Campos obrigatórios ausentes: targetUid, action, amount, reason, idempotencyKey.',
      });
    }

    if (action !== 'grant' && action !== 'revoke') {
      return res.status(400).json({ error: 'Ação deve ser "grant" (conceder) ou "revoke" (retirar).' });
    }

    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000) {
      return res.status(400).json({ error: 'Quantidade deve ser um inteiro entre 1 e 1000.' });
    }
    if (typeof targetUid !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(targetUid)) {
      return res.status(400).json({ error: 'UID inválido.' });
    }
    await adminAuth.getUser(targetUid);

    const result = await adminAdjustCredits({
      adminUid,
      targetUid,
      action,
      amount,
      reason,
      category: category || 'support',
      idempotencyKey,
      referenceId,
    });

    res.json(result);
  } catch (err: any) {
    if (err?.code === 16 || err?.message?.includes('UNAUTHENTICATED')) {
      return handleDbError(err, res, 'Erro ao processar ajuste de créditos.');
    }
    console.error('[Admin Adjust Credits] Erro:', err);
    if (err.statusCode === 409 || err.message?.includes('Conflito de Idempotência')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || 'Erro ao processar ajuste de créditos.' });
  }
});

// Listar Pedidos Globais com Auditoria (Admin)
app.get('/api/admin/orders', requireAdmin, async (_req: any, res: Response) => {
  try {
    const ordersSnap = await adminDb
      .collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const orders = ordersSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json(orders);
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao buscar pedidos no servidor.');
  }
});

// Auditoria e Logs de Ajustes Administrativos (Admin)
app.get('/api/admin/audit-logs', requireAdmin, async (_req: any, res: Response) => {
  try {
    const logsSnap = await adminDb
      .collection('auditLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const logs = logsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json(logs);
  } catch (err: any) {
    return handleDbError(err, res, 'Erro ao buscar logs de auditoria.');
  }
});

// Fallback JSON explícito para qualquer rota /api/* inexistente
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint da API não encontrado.',
    code: 'NOT_FOUND',
  });
});


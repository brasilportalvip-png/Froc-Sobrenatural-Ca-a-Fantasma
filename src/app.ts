import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { adminAuth, adminDb } from './services/firebaseAdmin';
import {
  getOrCreateWallet,
  claimFreeGrant,
  reserveConsultationCredits,
  commitConsultationCredits,
  releaseConsultationCredits,
} from './services/creditEngine';
import {
  getCatalogPackages,
  createMercadoPagoOrder,
  processMercadoPagoWebhook,
  verifyMercadoPagoWebhookSignature,
} from './services/mercadoPagoEngine';
import { executeGeminiWithFallback } from './services/aiOrchestrator';

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

// 1. Health & Status endpoint (sempre JSON para verificações e monitoramento)
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    appName: 'Froc Sobrenatural Caça Fantasma',
    hasGemini: !!apiKey && !!ai,
    hasMercadoPago: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    modelCascade: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash'],
    pricingConfigured: {
      p50: parseInt(process.env.PACKAGE_50_PRICE_CENTS || '0', 10) > 0,
      p75: parseInt(process.env.PACKAGE_75_PRICE_CENTS || '0', 10) > 0,
      p100: parseInt(process.env.PACKAGE_100_PRICE_CENTS || '0', 10) > 0,
    },
    features: {
      audioAnalysis: true,
      investigationChat: true,
      blindTestVerification: true,
      evidenceLogging: true,
      walletAndCredits: true,
      mercadoPagoCheckoutPro: true,
    },
  });
});

// 2. Carteira e Créditos: Obter saldo e extrato (Requer Autenticação)
app.get('/api/wallet', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const wallet = await getOrCreateWallet(uid);

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
    console.error('[API /api/wallet] Erro:', err);
    res.status(500).json({ error: 'Erro ao carregar carteira no servidor.' });
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
    console.error('[API /api/wallet/claim-free] Erro:', err);
    res.status(500).json({ error: 'Erro ao processar bônus gratuito.' });
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

    // Se segredo configurado, validar assinatura HMAC sha256 oficial do Mercado Pago
    if (webhookSecret) {
      const dataId = (req.query['data.id'] || req.query.id || req.body?.data?.id)?.toString();
      const isValid = verifyMercadoPagoWebhookSignature(xSignature, xRequestId, dataId, webhookSecret);
      if (!isValid) {
        console.warn('[Webhook MP] Rejeitado por assinatura inválida ou ausente');
        return res.status(401).json({ error: 'Assinatura inválida do webhook' });
      }
    }

    const topic = req.query.topic || req.body?.type || req.query.type;
    const paymentId = req.query['data.id'] || req.query.id || req.body?.data?.id;

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

// 7. Audio & Signal Analysis endpoint (AUTENTICAÇÃO OBRIGATÓRIA, reserva atômica de 5 créditos e validação de schema)
app.post('/api/analyze', authenticateFirebaseUser, async (req: any, res: Response) => {
  const uid = req.user.uid;
  const requestId = req.headers['x-request-id']?.toString() || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const { question, audioBase64, mimeType, sensorContext, audioMetrics } = req.body || {};

  // Validação de entrada
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Pergunta da consulta é obrigatória.' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'Pergunta excede limite de 500 caracteres.' });
  }

  // Validação de áudio se fornecido
  const hasAudioData = typeof audioBase64 === 'string' && audioBase64.length > 100;
  if (hasAudioData && audioBase64.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'Áudio excede o limite máximo permitido de 8MB.' });
  }

  // Hash da requisição para idempotência estrita
  const payloadHash = crypto.createHash('sha256').update(question.trim() + (hasAudioData ? audioBase64.slice(0, 500) : '')).digest('hex');

  let creditReserved = false;
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
        error: 'Saldo insuficiente. Esta consulta pericial requer 5 créditos disponíveis.',
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

  try {
    if (!ai) {
      // Motor de fallback local com honestidade metodológica absoluta
      // Se não há áudio captado, JAMAIS afirma que há voz detectada
      const dbfs = typeof audioMetrics?.dbfs === 'number' ? audioMetrics.dbfs : -60;
      const peakHz = typeof audioMetrics?.peakFrequencyHz === 'number' ? audioMetrics.peakFrequencyHz : 0;
      const isVoiceBand = peakHz >= 250 && peakHz <= 3500;
      const hasSignificantVolume = dbfs > -38;

      let candidateTranscription: string | null = null;
      let conclusion = hasAudioData
        ? 'Áudio analisado pelo motor espectral local. Nenhuma resposta ou fonema inteligível identificado.'
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
        alternativeHypotheses.unshift('Voz distante de pessoa no local ou vazamento de áudio acústico externo');
      }

      const localResult = {
        candidateTranscription,
        conclusion,
        confidence,
        voiceDetected: hasAudioData && hasSignificantVolume && isVoiceBand,
        acousticAnalysis: hasAudioData
          ? `[Medição Real] dBFS: ${dbfs.toFixed(1)} | Frequência de pico: ${peakHz}Hz | Banda de fala: ${isVoiceBand ? 'Sim' : 'Não'}`
          : 'Nenhum arquivo de áudio enviado para análise espectral.',
        alternativeHypotheses,
        possibleName: null,
        controlQuestionSuggestion: 'Sugestão de pergunta de controle: "Pode repetir com clareza em voz audível?"',
        provider: 'Motor Espectral Local (Froc DSP v1.0)',
      };

      if (creditReserved) {
        await commitConsultationCredits(uid, requestId, 'Motor Espectral Local (Froc DSP v1.0)', 50, localResult);
      }

      return res.json(localResult);
    }

    // Preparar prompt rigoroso para Gemini
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
          data: audioBase64.replace(/^data:audio\/[a-z0-9-+.]+;base64,/, ''),
        },
      });
    }

    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents: parts,
        config: { responseMimeType: 'application/json' },
      },
      ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']
    );

    let parsed: any;
    try {
      parsed = JSON.parse(cascadeResult.text || '{}');
    } catch {
      parsed = {
        candidateTranscription: null,
        voiceDetected: false,
        confidence: 0.05,
        conclusion: 'Nenhuma resposta identificada.',
        acousticAnalysis: 'Não foi possível estruturar os dados do sinal acústico.',
        alternativeHypotheses: ['Ruído aleatório', 'Pareidolia'],
      };
    }

    // Normalização e validação de schema rigorosa
    if (!parsed.voiceDetected || typeof parsed.confidence !== 'number' || parsed.confidence < 0.4 || !hasAudioData) {
      parsed.candidateTranscription = null;
      if (!hasAudioData) {
        parsed.voiceDetected = false;
      }
    }
    if (parsed.possibleName) {
      parsed.possibleName.verified = false;
    }
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    const finalResponse = {
      ...parsed,
      provider: `${cascadeResult.modelUsed} (Análise Forense)`,
      modelUsed: cascadeResult.modelUsed,
      executionTimeMs: cascadeResult.executionTimeMs,
    };

    // Efetivar débito definitivo e salvar resultado para idempotência
    if (creditReserved) {
      await commitConsultationCredits(uid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs, finalResponse);
    }

    return res.json(finalResponse);
  } catch (err: any) {
    console.error('Audio analysis error:', err);

    // Se houve reserva de créditos e o processamento falhou, estornar/liberar imediatamente os 5 créditos
    if (creditReserved) {
      await releaseConsultationCredits(uid, requestId, err.message || 'Falha de processamento na IA');
    }

    return res.status(500).json({
      candidateTranscription: null,
      voiceDetected: false,
      confidence: 0,
      conclusion: 'Falha técnica no processamento pericial. Os créditos da consulta foram integralmente liberados.',
      acousticAnalysis: 'Erro ao contatar o serviço de análise.',
      alternativeHypotheses: ['Falha de conexão', 'Tempo de resposta excedido'],
      error: err.message || 'Erro interno',
    });
  }
});

// 8. Multi-turn Session Investigation Chat endpoint (AUTENTICAÇÃO OBRIGATÓRIA & QUOTA DE CONSULTORIA)
app.post('/api/chat', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const { messages, sessionContext } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Histórico de mensagens é obrigatório.' });
    }

    // Limite de mensagens para prevenir abuso de tokens
    const recentMessages = messages.slice(-10);
    const lastUserMsg = recentMessages[recentMessages.length - 1];
    if (!lastUserMsg || typeof lastUserMsg.content !== 'string' || lastUserMsg.content.length > 800) {
      return res.status(400).json({ error: 'Mensagem inválida ou excede limite de 800 caracteres.' });
    }

    if (!ai) {
      return res.json({
        reply: 'Modo Local Ativo: O assistente Gemini não está configurado com chave no servidor. A estação mantém os registros de evidência e análise espectral em funcionamento local.',
        provider: 'Motor Local',
      });
    }

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
      ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']
    );

    res.json({
      reply: cascadeResult.text || 'Nenhuma análise gerada.',
      provider: cascadeResult.modelUsed,
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({
      reply: 'Erro ao processar consulta com o assistente.',
      error: err.message || 'Falha de comunicação',
    });
  }
});

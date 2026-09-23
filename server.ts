import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { adminAuth, adminDb } from './src/services/firebaseAdmin';
import {
  getOrCreateWallet,
  claimFreeGrant,
  reserveConsultationCredits,
  commitConsultationCredits,
  releaseConsultationCredits,
} from './src/services/creditEngine';
import {
  getCatalogPackages,
  createMercadoPagoOrder,
  processMercadoPagoWebhook,
} from './src/services/mercadoPagoEngine';
import { executeGeminiWithFallback } from './src/services/aiOrchestrator';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Middleware para verificar autenticação Firebase via Bearer Token
async function authenticateFirebaseUser(req: any, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err: any) {
    console.warn('[Auth Middleware] Token inválido:', err.message);
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}

// Initialize Google Gen AI if key is present
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Failed to initialize GoogleGenAI:', err);
  }
}

// 1. Health & Status endpoint
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

// 2. Carteira e Créditos: Obter saldo e extrato
app.get('/api/wallet', authenticateFirebaseUser, async (req: any, res: Response) => {
  try {
    const uid = req.user.uid;
    const wallet = await getOrCreateWallet(uid);

    // Buscar últimos lançamentos do ledger
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
    res.status(500).json({ error: 'Erro ao carregar carteira.' });
  }
});

// 3. Resgate do Bônus de Boas-Vindas (25 créditos)
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

// 4. Catálogo oficial de pacotes (preços configurados pelo servidor)
app.get('/api/packages', (_req: Request, res: Response) => {
  res.json(getCatalogPackages());
});

// 5. Criar Pedido Mercado Pago
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

// 6. Webhook Mercado Pago
app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  try {
    const topic = req.query.topic || req.body?.type;
    const paymentId = req.query.id || req.body?.data?.id;

    if (topic === 'payment' && paymentId) {
      await processMercadoPagoWebhook(paymentId.toString());
    }

    res.status(200).send('OK');
  } catch (err: any) {
    console.error('[API Webhook MP] Erro:', err);
    res.status(500).send('Erro interno');
  }
});


// 7. Audio & Signal Analysis endpoint (com cobrança atômica de 5 créditos e failover de IA)
app.post('/api/analyze', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let authenticatedUid: string | null = null;
  const requestId = req.headers['x-request-id']?.toString() || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Verificar se usuário está autenticado para débito de créditos
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
      authenticatedUid = decoded.uid;
    } catch {
      // Token inválido ou expirado
    }
  }

  // Se autenticado, executar reserva de 5 créditos
  let creditReserved = false;
  if (authenticatedUid) {
    try {
      await reserveConsultationCredits(authenticatedUid, requestId);
      creditReserved = true;
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({
          error: 'Saldo insuficiente. Esta consulta pericial requer 5 créditos disponíveis.',
          code: 'INSUFFICIENT_CREDITS',
        });
      }
      console.warn('[Analyze] Aviso de reserva de crédito:', err.message);
    }
  }

  try {
    const { question, audioBase64, mimeType, sensorContext, audioMetrics } = req.body;

    if (!ai) {
      // Local fallback analysis when Gemini API is not configured
      const dbfs = audioMetrics?.dbfs ?? -60;
      const peakHz = audioMetrics?.peakFrequencyHz ?? 0;
      const isVoiceBand = peakHz >= 250 && peakHz <= 3500;
      const hasSignificantVolume = dbfs > -38;

      let candidateTranscription: string | null = null;
      let conclusion = 'Nenhuma resposta identificada.';
      let confidence = 0.05;
      const alternativeHypotheses = [
        'Ruído térmico do microfone do dispositivo',
        'Artefato de compressão digital do codec de áudio',
        'Variação normal do ruído de fundo ambiente',
      ];

      if (hasSignificantVolume && isVoiceBand) {
        conclusion = 'Sinal detectado na faixa de voz humana, porém sem inteligibilidade suficiente para transcrição sem chave de IA ativa.';
        confidence = 0.35;
        alternativeHypotheses.unshift('Voz distante de pessoa no local ou vazamento de áudio externo');
      }

      let possibleName = null;
      let controlQuestionSuggestion = 'Sugestão de pergunta de controle: "Pode repetir com clareza em voz audível?"';

      // Se reservou crédito, efetivar o gasto da consulta local concluída com sucesso
      if (authenticatedUid && creditReserved) {
        await commitConsultationCredits(authenticatedUid, requestId, 'Motor Espectral Local (Froc DSP v1.0)', 50);
      }

      return res.json({
        candidateTranscription,
        conclusion,
        confidence,
        voiceDetected: hasSignificantVolume && isVoiceBand,
        acousticAnalysis: `dBFS: ${dbfs.toFixed(1)} | Frequência de pico: ${peakHz}Hz | Banda de voz: ${isVoiceBand ? 'Sim' : 'Não'}`,
        alternativeHypotheses,
        possibleName,
        controlQuestionSuggestion,
        provider: 'Motor Espectral Local (Froc DSP v1.0)',
      });
    }

    // Call Gemini with strict forensic signal processing instructions
    const prompt = `
Você é o analisador forense acústico e físico da estação "Froc Sobrenatural Caça Fantasma".
Sua tarefa é analisar uma amostra de áudio e dados de telemetria coletados durante uma pergunta de investigação.

DIRETRIZES FUNDAMENTAIS DE RIGOR E CADEIA DE EVIDÊNCIA:
1. NUNCA assuma nem declare que um ruído é uma entidade, fantasma ou espírito.
2. JAMAIS invente palavras onde há apenas estática, ruído branco, clique ou sussurro inaudível.
3. Se o sinal acústico for confuso, inaudível, ruído de fundo ou estática de rádio/ambiente, responda estritamente: "Nenhuma resposta identificada."
4. Avalie hipóteses alternativas naturais: pareidolia auditiva, ruído de fiação (50/60Hz), estalos de dilatação térmica, vento no diafragma do microfone, vazamento de conversa humana próxima, rádio pirata ou reflexão acústica.
5. Indique uma confiança calibrada de 0.00 a 1.00 para a presença de fala humana genuína.
6. Apenas forneça transcrição candidata se houver fonemas claros e inteligíveis. Caso contrário, candidateTranscription DEVE ser null.
7. SE A PERGUNTA FOR "Quem se apresenta?", "Qual espírito está aí?" ou similar:
   - Se for captada uma palavra candidata que pareça um nome próprio (ex: "Ana"), reporte estritamente no campo possibleName:
     {"name": "Ana", "segmentTime": "00:01–00:03", "verified": false}
   - No campo conclusion, escreva estritamente: "Possível nome: [Nome] · fonte: áudio · trecho: [mm:ss–mm:ss] · ainda não verificado"
   - NUNCA escreva "Ana está aqui", "sua mãe respondeu" ou "espírito identificado".
   - Se for áudio ambíguo/inconclusivo, escreva estritamente: "Som ambíguo; nenhuma palavra confirmada." e candidateTranscription null.
8. Sugira sempre uma pergunta de controle forense ("Pode repetir?", "Qual palavra entre estas opções?") no campo controlQuestionSuggestion.

DADOS DA AMOSTRA:
- Pergunta feita pelo investigador: "${question || 'Nenhuma pergunta explícita'}"
- Nível de áudio em dBFS: ${audioMetrics?.dbfs ?? 'Não medido'}
- Frequência de pico: ${audioMetrics?.peakFrequencyHz ?? 'Não medida'} Hz
- Leituras de sensores no momento: ${JSON.stringify(sensorContext || {})}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON estrito):
{
  "candidateTranscription": null ou "texto transcrito se audível",
  "possibleName": null ou {"name": "Nome", "segmentTime": "mm:ss-mm:ss", "verified": false},
  "controlQuestionSuggestion": "Pergunta de controle sugerida pela IA para testar a hipótese",
  "voiceDetected": true ou false,
  "confidence": número entre 0 e 1,
  "conclusion": "Resumo honesto e cético do sinal",
  "acousticAnalysis": "Avaliação técnica das frequências, harmônicos e envelope sonoro",
  "alternativeHypotheses": ["Hipótese 1", "Hipótese 2", "Hipótese 3"]
}
`;

    const parts: any[] = [{ text: prompt }];

    if (audioBase64 && mimeType) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: audioBase64.replace(/^data:audio\/[a-z0-9-+.]+;base64,/, ''),
        },
      });
    }

    // Executar com orquestrador de cascata de modelos (3.8 -> 3.7 -> 2.5) com 2s failover
    const cascadeResult = await executeGeminiWithFallback(
      ai,
      {
        contents: parts,
        config: {
          responseMimeType: 'application/json',
        },
      },
      ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']
    );

    const responseText = cascadeResult.text || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        candidateTranscription: null,
        voiceDetected: false,
        confidence: 0.1,
        conclusion: 'Nenhuma resposta identificada.',
        acousticAnalysis: 'Não foi possível estruturar a resposta acústica.',
        alternativeHypotheses: ['Ruído aleatório', 'Pareidolia'],
      };
    }

    // Rigor científico: se não houver voz detectada ou confiança < 0.4, transcrição DEVE ser null
    if (!parsed.voiceDetected || parsed.confidence < 0.4) {
      parsed.candidateTranscription = null;
      if (!parsed.conclusion || parsed.conclusion.toLowerCase().includes('espírito')) {
        parsed.conclusion = 'Nenhuma resposta identificada.';
      }
    }

    // Efetivar débito definitivo de 5 créditos na carteira (mesmo que "Nenhuma resposta identificada")
    if (authenticatedUid && creditReserved) {
      await commitConsultationCredits(authenticatedUid, requestId, cascadeResult.modelUsed, cascadeResult.executionTimeMs);
    }

    return res.json({
      ...parsed,
      provider: `${cascadeResult.modelUsed} (Análise Forense)`,
      modelUsed: cascadeResult.modelUsed,
      executionTimeMs: cascadeResult.executionTimeMs,
      failoverHistory: cascadeResult.failoverHistory,
    });
  } catch (err: any) {
    console.error('Audio analysis error:', err);

    // Se houve reserva de créditos e o processamento falhou tecnicamente, estornar/liberar imediatamente os 5 créditos
    if (authenticatedUid && creditReserved) {
      await releaseConsultationCredits(authenticatedUid, requestId, err.message || 'Falha de processamento na IA');
    }

    return res.status(500).json({
      candidateTranscription: null,
      voiceDetected: false,
      confidence: 0,
      conclusion: 'Falha técnica no processamento do áudio. Os créditos da consulta foram liberados.',
      acousticAnalysis: 'Erro ao contatar serviço de análise.',
      alternativeHypotheses: ['Falha de conexão', 'Formato de áudio não decodificado'],
      error: err.message,
    });
  }
});

// 3. Multi-turn Session Investigation Chat endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, sessionContext } = req.body;

    if (!ai) {
      return res.json({
        reply: 'Modo Local Ativo: O assistente de IA Gemini não está configurado no servidor (GEMINI_API_KEY ausente). O sistema continua operando com registro de evidências locais, medição de sensores e análise espectral no dispositivo.',
        provider: 'Motor Local',
      });
    }

    const systemInstruction = `
Você é o assistente técnico de metodologia e análise de sinais da estação "Froc Sobrenatural Caça Fantasma".
Seu papel é auxiliar pesquisadores e entusiastas na condução de investigações com ceticismo metodológico, análise forense de dados e controle de evidências.

REGRAS RÍGIDAS:
1. Você JAMAIS age como um fantasma, entidade ou morto. Você é uma IA de laboratório de pesquisa e análise física.
2. Promova o método científico: hipótese nula, duplo-cego, calibração de sensores, descarte de interferências rotineiras (como fios elétricos, sinais de celular, correntes de ar).
3. Seja respeitoso, analítico, objetivo e direto.
4. Responda em Português do Brasil.
`;

    // Map incoming messages to Gemini format
    const contents = (messages || []).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    if (sessionContext) {
      contents.unshift({
        role: 'user',
        parts: [{ text: `[CONTEXTO DA SESSÃO ATUAL]:\n${JSON.stringify(sessionContext, null, 2)}` }],
      });
      contents.splice(1, 0, {
        role: 'model',
        parts: [{ text: 'Entendido. Tenho o contexto da sessão e dos dados medidos para orientar a análise técnica.' }],
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply: response.text || 'Nenhuma análise gerada.',
      provider: 'Gemini 3.8 Flash',
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({
      reply: 'Erro ao processar consulta com o assistente.',
      error: err.message,
    });
  }
});

// Mount Vite or serve static assets
async function setupApp() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Froc Sobrenatural] Servidor rodando em http://localhost:${PORT} (Modo: ${isProd ? 'produção' : 'desenvolvimento'})`);
  });
}

setupApp();

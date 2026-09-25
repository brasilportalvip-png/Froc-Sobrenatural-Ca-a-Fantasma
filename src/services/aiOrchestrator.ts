import { GoogleGenAI } from '@google/genai';

export type GeminiErrorCategory =
  | 'AUTH_ERROR'
  | 'PERMISSION_ERROR'
  | 'QUOTA_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR';

export interface ClassifiedGeminiError {
  category: GeminiErrorCategory;
  message: string;
  isPermanent: boolean;
  httpStatus: number;
}

export function classifyGeminiError(err: any): ClassifiedGeminiError {
  const msg = err?.message || String(err || '');
  const status = Number(err?.status || err?.statusCode || 0);

  if (/API key not valid|API_KEY_INVALID|UNAUTHENTICATED/i.test(msg) || status === 401) {
    return { category: 'AUTH_ERROR', message: 'Credencial da API Gemini inválida ou não autenticada.', isPermanent: true, httpStatus: 401 };
  }
  if (/PERMISSION_DENIED|access denied/i.test(msg) || status === 403) {
    return { category: 'PERMISSION_ERROR', message: 'Permissão negada para acessar o modelo Gemini.', isPermanent: true, httpStatus: 403 };
  }
  if (/RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota/i.test(msg) || status === 429) {
    return { category: 'QUOTA_ERROR', message: 'Cota de uso da API Gemini temporariamente esgotada.', isPermanent: false, httpStatus: 429 };
  }
  if (/rate limit|too many requests/i.test(msg)) {
    return { category: 'RATE_LIMIT', message: 'Limite de requisições por minuto atingido no Gemini.', isPermanent: false, httpStatus: 429 };
  }
  if (/abort|timeout|timed out|deadline exceeded/i.test(msg) || err?.name === 'AbortError') {
    return { category: 'TIMEOUT', message: 'Tempo limite de resposta do modelo Gemini excedido.', isPermanent: false, httpStatus: 504 };
  }
  if (/not found|model unavailable|unsupported model|503/i.test(msg) || status === 404 || status === 503) {
    return { category: 'MODEL_UNAVAILABLE', message: 'Modelo Gemini temporariamente indisponível.', isPermanent: false, httpStatus: 503 };
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network error/i.test(msg)) {
    return { category: 'NETWORK_ERROR', message: 'Falha de conexão com os servidores da API Gemini.', isPermanent: false, httpStatus: 502 };
  }
  return { category: 'SERVER_ERROR', message: `Erro no processamento do modelo: ${msg.slice(0, 150)}`, isPermanent: false, httpStatus: 500 };
}

const DEFAULT_CASCADE = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

export function getModelCascade(): string[] {
  if (process.env.GEMINI_MODELS_CASCADE) {
    const list = process.env.GEMINI_MODELS_CASCADE.split(',').map((m) => m.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return DEFAULT_CASCADE;
}

interface FallbackResult {
  text: string;
  modelUsed: string;
  executionTimeMs: number;
  failoverHistory: string[];
}

export interface GeminiExecutionOptions {
  timeoutMs?: number;
  operationType?: 'chat' | 'audio_analysis';
  customCascade?: string[];
}

export async function executeGeminiWithFallback(
  ai: GoogleGenAI,
  promptParams: {
    contents: any[];
    config?: any;
  },
  options: GeminiExecutionOptions = {}
): Promise<FallbackResult> {
  const startTime = Date.now();
  const failoverHistory: string[] = [];

  const operationType = options.operationType || 'chat';
  // Timeouts realistas por tipo de operação: multimodal com áudio requer janela maior
  const defaultTimeout = operationType === 'audio_analysis' ? 28_000 : 15_000;
  const timeoutMs = options.timeoutMs || Number(process.env.GEMINI_TIMEOUT_MS) || defaultTimeout;

  const modelCascade = options.customCascade && options.customCascade.length > 0
    ? options.customCascade
    : getModelCascade();

  for (let i = 0; i < modelCascade.length; i++) {
    const currentModel = modelCascade[i];
    const attemptStart = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await ai.models.generateContent({
        model: currentModel,
        contents: promptParams.contents,
        config: { ...promptParams.config, abortSignal: controller.signal },
      });

      const elapsed = Date.now() - attemptStart;
      console.log(`[AI Cascade] [${operationType}] Modelo ${currentModel} respondeu em ${elapsed}ms`);

      return {
        text: result.text || '',
        modelUsed: currentModel,
        executionTimeMs: Date.now() - startTime,
        failoverHistory,
      };
    } catch (err: any) {
      const elapsed = Date.now() - attemptStart;
      const classified = classifyGeminiError(err);
      console.warn(`[AI Cascade] [${currentModel}] (${elapsed}ms) [${classified.category}]: ${classified.message}`);
      failoverHistory.push(`${currentModel} [${classified.category}: ${elapsed}ms]`);

      // Erros permanentes de credencial ou permissão não são resolvidos alternando o modelo
      if (classified.isPermanent) {
        const error = new Error(classified.message);
        (error as any).category = classified.category;
        (error as any).httpStatus = classified.httpStatus;
        throw error;
      }

      // Se todos os modelos da cascata falharam
      if (i === modelCascade.length - 1) {
        const error = new Error(`Todos os modelos na cascata falharam: ${failoverHistory.join(' -> ')}`);
        (error as any).category = classified.category;
        (error as any).httpStatus = classified.httpStatus;
        (error as any).failoverHistory = failoverHistory;
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Falha inesperada no orquestrador de modelos Gemini.');
}

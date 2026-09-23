import { GoogleGenAI } from '@google/genai';

interface FallbackResult {
  text: string;
  modelUsed: string;
  executionTimeMs: number;
  failoverHistory: string[];
}

export async function executeGeminiWithFallback(
  ai: GoogleGenAI,
  promptParams: {
    contents: any[];
    config?: any;
  },
  modelCascade: string[] = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']
): Promise<FallbackResult> {
  const startTime = Date.now();
  const failoverHistory: string[] = [];

  for (let i = 0; i < modelCascade.length; i++) {
    const currentModel = modelCascade[i];
    const attemptStart = Date.now();

    try {
      // 2000ms (2s) failover timeout trigger per specification
      const result = await Promise.race([
        ai.models.generateContent({
          model: currentModel,
          contents: promptParams.contents,
          config: promptParams.config,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout de 2s excedido no modelo ${currentModel}`)), 2000);
        }),
      ]);

      const elapsed = Date.now() - attemptStart;
      console.log(`[AI Cascade] Modelo ${currentModel} respondeu com sucesso em ${elapsed}ms`);

      return {
        text: result.text || '',
        modelUsed: currentModel,
        executionTimeMs: Date.now() - startTime,
        failoverHistory,
      };
    } catch (err: any) {
      const elapsed = Date.now() - attemptStart;
      const reason = err?.message || 'Falha transitória';
      console.warn(`[AI Cascade] Falha ou timeout no modelo ${currentModel} (${elapsed}ms): ${reason}`);
      failoverHistory.push(`${currentModel} (${elapsed}ms: ${reason})`);

      // If it's an unrecoverable credential error, don't cascade blindly
      if (reason.includes('API key not valid') || reason.includes('PERMISSION_DENIED')) {
        throw new Error(`Erro permanente de credencial: ${reason}`);
      }
      // If we reached the end of the cascade, throw the error
      if (i === modelCascade.length - 1) {
        throw new Error(`Todos os modelos na cascata falharam: ${failoverHistory.join(' -> ')}`);
      }
      // Otherwise continue to next model in cascade
    }
  }

  throw new Error('Falha inesperada no processador de modelos');
}

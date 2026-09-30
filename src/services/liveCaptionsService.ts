import { AudioMetrics } from './audioEngine';
import { LiveCaptionEvent, LiveCaptionStatus } from '../types';

export interface VadStateResult {
  status: LiveCaptionStatus;
  isVoiceCandidate: boolean;
  reason: string;
}

export interface ChunkRateLimiter {
  lastCallTimestamp: number;
  timestampsInWindow: number[];
  lastChunkDbfs: number;
  lastPeakHz: number;
}

export class LiveCaptionsEngine {
  private static COOLDOWN_MS = 9000; // Mínimo 9 segundos entre envios para IA
  private static MAX_CALLS_PER_MINUTE = 5; // Máximo 5 análises IA por minuto
  private static MIN_DBFS_THRESHOLD = -40; // Silêncio abaixo de -40 dBFS
  private static MIN_RMS_THRESHOLD = 0.012;

  /**
   * Avalia localmente se o sinal acústico contém energia vocal real
   * antes de qualquer chamada remota à IA.
   */
  public static evaluateVad(metrics: AudioMetrics): VadStateResult {
    const { dbfs, rms, peakFrequencyHz, isVoiceBand } = metrics;

    if (dbfs <= this.MIN_DBFS_THRESHOLD || rms < this.MIN_RMS_THRESHOLD) {
      return {
        status: 'no_speech',
        isVoiceCandidate: false,
        reason: 'Nenhuma fala detectada (silêncio ambiente)',
      };
    }

    const isInHumanSpeechRange = peakFrequencyHz >= 250 && peakFrequencyHz <= 3400;

    if (!isInHumanSpeechRange && !isVoiceBand) {
      return {
        status: 'no_speech',
        isVoiceCandidate: false,
        reason: 'Ruído ambiente contínuo fora da faixa de fala humana',
      };
    }

    if (isInHumanSpeechRange && (isVoiceBand || dbfs > -34)) {
      return {
        status: 'possible_speech',
        isVoiceCandidate: true,
        reason: 'Energia concentrada na banda vocal (250Hz–3.4kHz)',
      };
    }

    return {
      status: 'no_speech',
      isVoiceCandidate: false,
      reason: 'Sinal acústico sem características harmônicas de voz',
    };
  }

  /**
   * Verifica se o envio do chunk para a IA é permitido segundo as regras
   * de cooldown, taxa máxima por minuto e deduplicação espectral.
   */
  public static canDispatchToAi(
    limiter: ChunkRateLimiter,
    metrics: AudioMetrics,
    now: number = Date.now()
  ): { allowed: boolean; reason?: string } {
    // 1. Cooldown entre chamadas
    const elapsedSinceLast = now - limiter.lastCallTimestamp;
    if (elapsedSinceLast < this.COOLDOWN_MS) {
      const waitSec = Math.ceil((this.COOLDOWN_MS - elapsedSinceLast) / 1000);
      return { allowed: false, reason: `Em intervalo de cooldown (${waitSec}s)` };
    }

    // 2. Máximo por minuto (janela deslizante de 60 segundos)
    const windowStart = now - 60000;
    const recentCalls = limiter.timestampsInWindow.filter((ts) => ts > windowStart);
    limiter.timestampsInWindow = recentCalls;

    if (recentCalls.length >= this.MAX_CALLS_PER_MINUTE) {
      return { allowed: false, reason: `Limite de ${this.MAX_CALLS_PER_MINUTE} análises/minuto atingido` };
    }

    // 3. Deduplicação de trechos idênticos (mesmo pico e mesmo dbfs dentro de 1.5 dB)
    const dbfsDiff = Math.abs(metrics.dbfs - limiter.lastChunkDbfs);
    const hzDiff = Math.abs(metrics.peakFrequencyHz - limiter.lastPeakHz);
    if (dbfsDiff < 1.0 && hzDiff < 20 && elapsedSinceLast < 20000) {
      return { allowed: false, reason: 'Trecho sonoro repetitivo descartado por deduplicação' };
    }

    return { allowed: true };
  }

  /**
   * Registra o consumo de uma quota de análise no limitador
   */
  public static recordAiCall(limiter: ChunkRateLimiter, metrics: AudioMetrics, now: number = Date.now()): void {
    limiter.lastCallTimestamp = now;
    limiter.timestampsInWindow.push(now);
    limiter.lastChunkDbfs = metrics.dbfs;
    limiter.lastPeakHz = metrics.peakFrequencyHz;
  }

  /**
   * Classifica rigorosamente o candidato de transcrição de acordo com o nível de confiança
   * evitando que ruído de fundo ou silêncio produza texto inventado.
   */
  public static classifyConfidence(
    confidence: number,
    rawCandidate?: string | null,
    voiceDetected: boolean = true
  ): {
    status: LiveCaptionStatus;
    label: string;
    displayText: string;
    candidateTranscription: string | null;
    isSpeech: boolean;
  } {
    const cleanCandidate = (rawCandidate || '').trim();

    // 1. Silêncio ou nenhuma voz detectada
    if (!voiceDetected || !cleanCandidate) {
      return {
        status: 'no_speech',
        label: 'SEM FALA INTELIGÍVEL',
        displayText: '[sem fala inteligível]',
        candidateTranscription: null,
        isSpeech: false,
      };
    }

    // 2. Confiança Alta (>= 0.75): Apresenta normalmente como fala de alta inteligibilidade
    if (confidence >= 0.75) {
      return {
        status: 'probable_transcription',
        label: 'TRANSCRIÇÃO DE ALTA INTELIGIBILIDADE',
        displayText: `"${cleanCandidate}"`,
        candidateTranscription: cleanCandidate,
        isSpeech: true,
      };
    }

    // 3. Confiança Provável (0.50 a 0.74): Apresenta como interpretação provável
    if (confidence >= 0.50) {
      return {
        status: 'probable_transcription',
        label: 'TRANSCRIÇÃO PROVÁVEL',
        displayText: `"${cleanCandidate}"`,
        candidateTranscription: cleanCandidate,
        isSpeech: true,
      };
    }

    // 4. Confiança Intermediária (0.30 a 0.49): Mostra com indicação clara "Possível: '...'"
    if (confidence >= 0.30) {
      return {
        status: 'possible_speech',
        label: 'POSSÍVEL FALA',
        displayText: `Possível: "${cleanCandidate}"`,
        candidateTranscription: cleanCandidate,
        isSpeech: true,
      };
    }

    // 5. Baixa Confiança (< 0.30): NUNCA apresentar palavra como se tivesse sido pronunciada
    return {
      status: 'inconclusive',
      label: 'INCONCLUSIVO',
      displayText: '[emissão vocal pouco inteligível]',
      candidateTranscription: null,
      isSpeech: false,
    };
  }

  /**
   * Formata tempo relativo em MM:SS
   */
  public static formatRelativeTime(elapsedMs: number): string {
    const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  /**
   * Formata trecho temporal com intervalo (MM:SS – MM:SS)
   */
  public static formatSegmentRange(startMs: number, endMs: number): string {
    return `${this.formatRelativeTime(startMs)} – ${this.formatRelativeTime(endMs)}`;
  }

  /**
   * Combina contextualmente frases de trechos consecutivos contíguos no tempo,
   * preservando os segmentos originais para auditoria forense.
   */
  public static combineConsecutivePhrases(events: LiveCaptionEvent[]): LiveCaptionEvent[] {
    if (events.length <= 1) return [...events];

    const result: LiveCaptionEvent[] = [];
    let i = 0;

    while (i < events.length) {
      const current = events[i];
      const next = events[i + 1];

      // Se há um próximo evento com continuidade temporal (< 4.5s) e ambos possuem candidatos válidos
      if (
        next &&
        current.candidateTranscription &&
        next.candidateTranscription &&
        Math.abs(current.timestampMs - next.timestampMs) <= 4500 &&
        current.confidence >= 0.35 &&
        next.confidence >= 0.35 &&
        !current.isCombinedPhrase &&
        !next.isCombinedPhrase
      ) {
        // Ordenar cronologicamente para montar a frase (anterior + posterior)
        const [earlier, later] = current.timestampMs <= next.timestampMs ? [current, next] : [next, current];
        const combinedCandidate = `${earlier.candidateTranscription} ${later.candidateTranscription}`.trim();
        const avgConfidence = (current.confidence + next.confidence) / 2;
        const combinedClassification = this.classifyConfidence(avgConfidence, combinedCandidate, true);

        const startMs = Math.min(current.segmentStartMs || current.timestampMs, next.segmentStartMs || next.timestampMs);
        const endMs = Math.max(current.segmentEndMs || current.timestampMs + 3600, next.segmentEndMs || next.timestampMs + 3600);

        const combinedEvt: LiveCaptionEvent = {
          ...earlier,
          id: `combined_${earlier.id}_${later.id}`,
          timestampFormatted: this.formatRelativeTime(startMs),
          timestampMs: startMs,
          segmentStartMs: startMs,
          segmentEndMs: endMs,
          status: combinedClassification.status,
          text: combinedClassification.displayText,
          candidateTranscription: combinedCandidate,
          confidence: avgConfidence,
          isCombinedPhrase: true,
          alternativeTranscriptions: [
            ...(earlier.alternativeTranscriptions || []),
            ...(later.alternativeTranscriptions || []),
          ],
        };

        result.push(combinedEvt);
        // Preserva também os originais individualmente para auditoria
        result.push(current);
        result.push(next);
        i += 2;
      } else {
        result.push(current);
        i++;
      }
    }

    return result;
  }

  /**
   * Avalia divergência entre duas análises do mesmo trecho sonoro.
   * Se os resultados forem diferentes, sinaliza ambiguidadade acústica em vez de escolher arbitrariamente.
   */
  public static detectAmbiguity(
    analysis1: { text?: string | null; confidence?: number },
    analysis2: { text?: string | null; confidence?: number }
  ): { isAmbiguous: boolean; message?: string } {
    const t1 = (analysis1.text || '').trim().toLowerCase();
    const t2 = (analysis2.text || '').trim().toLowerCase();

    if (t1 && t2 && t1 !== t2 && (analysis1.confidence || 0) >= 0.30 && (analysis2.confidence || 0) >= 0.30) {
      return {
        isAmbiguous: true,
        message: 'Resultado acústico ambíguo.',
      };
    }

    return { isAmbiguous: false };
  }
}

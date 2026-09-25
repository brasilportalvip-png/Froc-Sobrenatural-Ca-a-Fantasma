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
}

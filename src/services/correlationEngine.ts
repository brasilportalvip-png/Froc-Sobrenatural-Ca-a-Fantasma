import {
  FrocMoment,
  FrocMomentType,
  FrocActivityLevel,
  TimelineMarker,
  SessionSummary,
  LiveCaptionEvent,
  SensorState,
} from '../types';
import { AudioMetrics } from './audioEngine';

export interface TelemetrySample {
  timestampMs: number;
  dbfs: number;
  peakFrequencyHz: number;
  rms: number;
  magneticDeltaUt: number;
  motionMagnitude: number;
}

export interface QuestionContext {
  id: string;
  text: string;
  timestampMs: number;
  timeFormatted: string;
}

export class CorrelationEngine {
  /**
   * Avalia a coincidência temporal (±2 a 3 segundos) entre fala captada, acústica,
   * perguntas do investigador e telemetria de sensores físicos.
   */
  static correlateEvent(params: {
    sessionId: string;
    captionEvent: LiveCaptionEvent;
    recentTelemetry: TelemetrySample[];
    recentQuestions: QuestionContext[];
    sessionStartTime: number;
    currentTimeMs?: number;
  }): FrocMoment | null {
    const {
      sessionId,
      captionEvent,
      recentTelemetry,
      recentQuestions,
      sessionStartTime,
      currentTimeMs = Date.now(),
    } = params;

    const eventTime = captionEvent.timestampMs;
    const windowStart = eventTime - 3500;
    const windowEnd = eventTime + 3500;

    // 1. Filtrar telemetria dentro da janela temporal de coincidência (±3.5s)
    const samplesInWindow = recentTelemetry.filter(
      (s) => s.timestampMs >= windowStart && s.timestampMs <= windowEnd
    );

    // Calcular variações máximas de sensores na janela
    let maxMagDelta = 0;
    let avgMotion = 0;
    let minDbfs = captionEvent.dbfs;
    let maxDbfs = captionEvent.dbfs;

    if (samplesInWindow.length > 0) {
      maxMagDelta = Math.max(...samplesInWindow.map((s) => Math.abs(s.magneticDeltaUt ?? 0)));
      avgMotion =
        samplesInWindow.reduce((acc, s) => acc + (s.motionMagnitude ?? 0), 0) /
        samplesInWindow.length;
      minDbfs = Math.min(...samplesInWindow.map((s) => s.dbfs));
      maxDbfs = Math.max(...samplesInWindow.map((s) => s.dbfs));
    }

    const audioDeltaDbfs = Math.max(0, maxDbfs - minDbfs);
    const hasSignificantMagDelta = maxMagDelta >= 2.0; // Variação magnética >= 2.0 µT
    const isDeviceStable = avgMotion <= 0.8; // Aparelho estável (descarta falso positivo por manuseio manual)
    const hasAcousticEnergyRise = audioDeltaDbfs >= 8.0 || captionEvent.dbfs > -38;

    // 2. Verificar se houve pergunta anterior feita pelo investigador (janela de 2s a 15s antes)
    const precedingQuestion = recentQuestions
      .filter(
        (q) => eventTime > q.timestampMs && eventTime - q.timestampMs <= 15000 && eventTime - q.timestampMs >= 1500
      )
      .sort((a, b) => b.timestampMs - a.timestampMs)[0];

    const hasPostQuestionCorrelation = !!precedingQuestion;
    const postQuestionElapsedSec = precedingQuestion
      ? Math.round((eventTime - precedingQuestion.timestampMs) / 1000)
      : undefined;

    // 3. Critérios de Relevância
    const hasVoiceCandidate =
      captionEvent.status === 'probable_transcription' ||
      captionEvent.status === 'possible_speech' ||
      (captionEvent.confidence >= 0.30 && !!captionEvent.candidateTranscription);

    let coincidingCount = 0;
    if (hasVoiceCandidate) coincidingCount++;
    if (hasAcousticEnergyRise) coincidingCount++;
    if (hasSignificantMagDelta && isDeviceStable) coincidingCount++;
    if (hasPostQuestionCorrelation) coincidingCount++;

    // Se não houver ao menos 1 fator real e relevante, não gera momento relevante
    if (coincidingCount === 0) {
      return null;
    }

    // 4. Determinação do Tipo e Descrição do Momento
    let type: FrocMomentType = 'instrumental_coincidence';
    let title = 'Coincidência Instrumental';
    let description = '';

    const elapsedFromSessionStart = Math.max(0, eventTime - sessionStartTime);
    const relativeTimeFormatted = this.formatRelativeTime(elapsedFromSessionStart);

    if (hasPostQuestionCorrelation && hasVoiceCandidate) {
      type = 'post_question_speech';
      title = 'Possível Fala Pós-Pergunta';
      const wordText = captionEvent.candidateTranscription
        ? `"${captionEvent.candidateTranscription}"`
        : 'emissão vocal detectada';
      description = `Possível fala ${wordText} captada ${postQuestionElapsedSec} segundos após sua pergunta ("${precedingQuestion.text}").`;
    } else if (hasSignificantMagDelta && hasVoiceCandidate && isDeviceStable) {
      type = 'instrumental_coincidence';
      title = 'Coincidência Eletromagnética e Vocal';
      description = `Variação magnética de +${maxMagDelta.toFixed(1)} µT coincidiu com detecção acústica, com aparelho estável.`;
    } else if (hasSignificantMagDelta && hasAcousticEnergyRise && isDeviceStable) {
      type = 'magnetic_anomaly';
      title = 'Variação Magnética Coincidente';
      description = `Oscilação de +${maxMagDelta.toFixed(1)} µT concomitante a elevação de +${audioDeltaDbfs.toFixed(1)} dB no áudio.`;
    } else if (hasVoiceCandidate) {
      type = 'voice_candidate';
      title = 'Emissão Vocal Relevante';
      description = `Padrão vocal identificado com ${Math.round(captionEvent.confidence * 100)}% de inteligibilidade acústica.`;
    } else {
      type = 'instrumental_coincidence';
      title = 'Atividade Instrumental Coincidente';
      description = `${coincidingCount} sinais físicos coincidiram temporalmente na estação de campo.`;
    }

    const secureIdSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);

    return {
      id: `moment_${eventTime}_${secureIdSuffix}`,
      sessionId,
      timestampMs: eventTime,
      relativeTimeFormatted,
      type,
      title,
      description,
      coincidingSignalsCount: coincidingCount,
      signalsSummary: {
        audioDeltaDbfs: typeof audioDeltaDbfs === 'number' ? audioDeltaDbfs : undefined,
        magneticDeltaUt: maxMagDelta > 0 ? maxMagDelta : undefined,
        motionMagnitude: typeof avgMotion === 'number' ? avgMotion : undefined,
        isDeviceStable: typeof avgMotion === 'number' ? isDeviceStable : undefined,
        postQuestionElapsedSec,
        peakFrequencyHz: typeof captionEvent.peakFrequencyHz === 'number' ? captionEvent.peakFrequencyHz : undefined,
      },
      rawAudioMetrics: {
        dbfs: typeof captionEvent.dbfs === 'number' ? captionEvent.dbfs : undefined,
        peakFrequencyHz: typeof captionEvent.peakFrequencyHz === 'number' ? captionEvent.peakFrequencyHz : undefined,
        rms: typeof captionEvent.telemetryAtEnd?.rms === 'number' ? captionEvent.telemetryAtEnd.rms : undefined,
        isVoiceBand: hasVoiceCandidate,
      },
      telemetryAtStart: captionEvent.telemetryAtStart,
      telemetryAtEnd: captionEvent.telemetryAtEnd,
      sensorContextSnapshot: {
        magnetometerDelta: maxMagDelta,
        motionMagnitude: avgMotion,
        isDeviceStable,
      },
      audioBlob: captionEvent.audioBlob,
      treatedAudioBlob: captionEvent.treatedAudioBlob,
      candidateTranscription: captionEvent.candidateTranscription || null,
      confidenceScore: typeof captionEvent.confidence === 'number' ? captionEvent.confidence : undefined,
      questionContext: precedingQuestion?.text,
      questionTimestampMs: precedingQuestion?.timestampMs,
      secondsAfterQuestion: postQuestionElapsedSec,
      alternativeHypotheses: captionEvent.alternativeHypotheses || [
        'Voz humana distante ou vazamento acústico',
        'Variação ferromagnética ambiente (rede elétrica ou metal próximo)',
        'Eco ou reverberação acústica natural',
      ],
      isAmbiguous: captionEvent.isAmbiguous,
      alternativeTranscriptions: captionEvent.alternativeTranscriptions,
      acousticNotes: captionEvent.acousticNotes,
      provider: captionEvent.provider,
    };
  }

  /**
   * Correlaciona uma resposta vocal captada após pergunta do investigador.
   * Não inventa nenhum número, dBFS, RMS, estabilidade ou coincidência artificial.
   * Centraliza a autoridade do cálculo de correlação temporal.
   */
  static correlateQuestionResponse(params: {
    sessionId: string;
    questionText: string;
    questionTimestampMs: number;
    responseTimestampMs: number;
    resultId: string;
    candidateTranscription?: string | null;
    confidenceScore?: number;
    signalData?: {
      dbfs?: number;
      peakFrequencyHz?: number;
      rms?: number;
      isVoiceBand?: boolean;
    } | null;
    sensorState?: SensorState | null;
    recentTelemetry?: TelemetrySample[];
    sessionStartTime: number;
    audioBlob?: Blob;
    treatedAudioBlob?: Blob;
    alternativeHypotheses?: string[];
    provider?: string;
    acousticNotes?: string;
  }): FrocMoment | null {
    const {
      sessionId,
      questionText,
      questionTimestampMs,
      responseTimestampMs,
      resultId,
      candidateTranscription,
      confidenceScore,
      signalData,
      sensorState,
      recentTelemetry = [],
      sessionStartTime,
      audioBlob,
      treatedAudioBlob,
      alternativeHypotheses,
      provider,
      acousticNotes,
    } = params;

    const hasCandidateTranscription =
      typeof candidateTranscription === 'string' && candidateTranscription.trim().length > 0;

    // Se não há nem transcrição nem áudio gravado, não fabricar momento
    if (!hasCandidateTranscription && !audioBlob) {
      return null;
    }

    const elapsedFromSession = Math.max(0, responseTimestampMs - sessionStartTime);
    const relativeTimeFormatted = this.formatRelativeTime(elapsedFromSession);
    const secondsAfterQuestion = Math.max(0, Math.round((responseTimestampMs - questionTimestampMs) / 1000));

    // Contagem rigorosa e honesta de fatores reais
    let coincidingCount = 0;

    // 1. Fala candidata real
    if (hasCandidateTranscription) {
      coincidingCount++;
    }

    // 2. Pergunta anterior na janela temporal (1s a 30s)
    const timeDeltaMs = responseTimestampMs - questionTimestampMs;
    const hasPrecedingQuestion = timeDeltaMs >= 1000 && timeDeltaMs <= 30000;
    if (hasPrecedingQuestion) {
      coincidingCount++;
    }

    // 3. Elevação acústica real medida por DSP
    const hasDbfs = typeof signalData?.dbfs === 'number';
    const isAcousticElevation = hasDbfs && (signalData.dbfs > -42 || signalData.isVoiceBand === true);
    if (isAcousticElevation) {
      coincidingCount++;
    }

    // 4. Variação magnética válida com aparelho comprovadamente estável
    const magAvailable = !!sensorState?.magnetometer?.available;
    const magDelta = magAvailable && typeof sensorState.magnetometer.delta === 'number'
      ? sensorState.magnetometer.delta
      : undefined;

    const motionAvailable = !!sensorState?.motion?.available;
    const motionMag = motionAvailable && typeof sensorState.motion.magnitude === 'number'
      ? sensorState.motion.magnitude
      : undefined;

    const isDeviceStable = typeof motionMag === 'number' ? motionMag <= 0.8 : undefined;

    if (typeof magDelta === 'number' && magDelta >= 2.0 && isDeviceStable === true) {
      coincidingCount++;
    }

    // Se nenhum sinal físico ou transcrição real existe, não gerar momento
    if (coincidingCount === 0) {
      return null;
    }

    const wordText = hasCandidateTranscription ? `"${candidateTranscription}"` : 'emissão vocal detectada';
    const description = `Possível fala ${wordText} captada ${secondsAfterQuestion} segundos após sua pergunta ("${questionText}").`;

    return {
      id: `moment_q_${resultId}`,
      sessionId,
      timestampMs: responseTimestampMs,
      relativeTimeFormatted,
      title: 'Possível Fala Pós-Pergunta',
      description,
      type: 'post_question_speech',
      coincidingSignalsCount: coincidingCount,
      signalsSummary: {
        audioDeltaDbfs: typeof signalData?.dbfs === 'number' ? signalData.dbfs : undefined,
        peakFrequencyHz: typeof signalData?.peakFrequencyHz === 'number' ? signalData.peakFrequencyHz : undefined,
        magneticDeltaUt: typeof magDelta === 'number' && magDelta > 0 ? magDelta : undefined,
        motionMagnitude: typeof motionMag === 'number' ? motionMag : undefined,
        isDeviceStable,
        postQuestionElapsedSec: secondsAfterQuestion,
      },
      rawAudioMetrics: {
        dbfs: typeof signalData?.dbfs === 'number' ? signalData.dbfs : undefined,
        peakFrequencyHz: typeof signalData?.peakFrequencyHz === 'number' ? signalData.peakFrequencyHz : undefined,
        rms: typeof signalData?.rms === 'number' ? signalData.rms : undefined,
        isVoiceBand: typeof signalData?.isVoiceBand === 'boolean' ? signalData.isVoiceBand : undefined,
      },
      sensorContextSnapshot: sensorState ? {
        magnetometerAvailable: magAvailable,
        magnetometerDelta: magDelta,
        motionAvailable,
        motionMagnitude: motionMag,
        isDeviceStable,
      } : undefined,
      audioBlob,
      treatedAudioBlob,
      candidateTranscription: hasCandidateTranscription ? candidateTranscription : null,
      confidenceScore: typeof confidenceScore === 'number' ? confidenceScore : undefined,
      questionContext: questionText,
      questionTimestampMs,
      secondsAfterQuestion,
      alternativeHypotheses: alternativeHypotheses || ['Variação acústica natural', 'Ruído de fundo'],
      acousticNotes,
      provider: provider || 'IA + DSP Correlacionado',
      reanalysisResults: [],
    };
  }

  /**
   * Calcula o Índice de Atividade FROC com base estrita nos dados dos últimos 60 segundos.
   * Não inventa atividade paranormal nem usa geradores randômicos.
   */
  static calculateActivityIndex(params: {
    momentsInLast60s: FrocMoment[];
    speechEventsInLast60s: LiveCaptionEvent[];
    sensorExcursionsCount: number;
    currentTimeMs?: number;
  }): { level: FrocActivityLevel; score: number; explanation: string } {
    const {
      momentsInLast60s,
      speechEventsInLast60s,
      sensorExcursionsCount,
    } = params;

    const speechCount = speechEventsInLast60s.filter(
      (e) => e.status === 'probable_transcription' || e.status === 'possible_speech'
    ).length;
    const momentsCount = momentsInLast60s.length;

    // Cálculo ponderado determinístico
    const score = speechCount * 2.5 + sensorExcursionsCount * 1.5 + momentsCount * 3.0;

    let level: FrocActivityLevel = 'BAIXA';
    if (score >= 10) {
      level = 'ALTA';
    } else if (score >= 6) {
      level = 'ELEVADA';
    } else if (score >= 2.5) {
      level = 'MODERADA';
    } else {
      level = 'BAIXA';
    }

    let explanation = '';
    if (level === 'ALTA') {
      explanation = `Índice de atividade instrumental alto: ${momentsCount} eventos correlacionados e ${speechCount} detecções acústicas nos últimos 60 segundos.`;
    } else if (level === 'ELEVADA') {
      explanation = `Índice de atividade instrumental elevado: ${speechCount} eventos acústicos e ${sensorExcursionsCount} variações de sensores nos últimos 60 segundos.`;
    } else if (level === 'MODERADA') {
      explanation = `Índice de atividade instrumental moderado: ${speechCount + sensorExcursionsCount} sinais instrumentais detectados no último minuto.`;
    } else {
      explanation = 'Índice de atividade instrumental baixo: ambiente estável e ruído de fundo sem desvios significativos.';
    }

    return { level, score, explanation };
  }

  /**
   * Gera o Resumo Final Inteligente e destaca os momentos mais relevantes da sessão.
   */
  static generateSessionSummary(params: {
    sessionId: string;
    sessionTitle?: string;
    startTime: number;
    endTime: number;
    questions: QuestionContext[];
    captionEvents: LiveCaptionEvent[];
    moments: FrocMoment[];
    visualCapturesCount: number;
    maxMagneticDeltaUt: number;
  }): SessionSummary {
    const {
      sessionId,
      sessionTitle = 'Sessão de Investigação',
      startTime,
      endTime,
      questions,
      captionEvents,
      moments,
      visualCapturesCount,
      maxMagneticDeltaUt,
    } = params;

    const durationMs = Math.max(0, endTime - startTime);
    const durationFormatted = this.formatDuration(durationMs);

    const speechEvents = captionEvents.filter(
      (e) => e.status === 'probable_transcription' || e.status === 'possible_speech' || !!e.candidateTranscription
    );

    // Ordenar momentos por relevância instrumental
    const sortedMoments = [...moments].sort((a, b) => {
      const scoreA = (a.coincidingSignalsCount * 3) + ((a.confidenceScore ?? 0) * 4) + (a.type === 'post_question_speech' ? 4 : 0);
      const scoreB = (b.coincidingSignalsCount * 3) + ((b.confidenceScore ?? 0) * 4) + (b.type === 'post_question_speech' ? 4 : 0);
      return scoreB - scoreA;
    });

    // Janela deslizante de maior densidade de eventos (30 a 60 segundos) calculada de fato
    let peakActivityWindow = 'Sem concentração expressiva';
    const allEventTimes: number[] = [
      ...moments.map((m) => m.timestampMs),
      ...speechEvents.map((e) => e.timestampMs),
      ...questions.map((q) => q.timestampMs),
    ].sort((a, b) => a - b);

    if (allEventTimes.length > 0) {
      const windowSizeMs = 45000; // 45 segundos
      let maxCount = 0;
      let bestStartMs = allEventTimes[0];

      for (let i = 0; i < allEventTimes.length; i++) {
        const start = allEventTimes[i];
        const end = start + windowSizeMs;
        const count = allEventTimes.filter((t) => t >= start && t <= end).length;
        if (count > maxCount) {
          maxCount = count;
          bestStartMs = start;
        }
      }

      if (maxCount >= 2) {
        const startSec = Math.max(0, Math.floor((bestStartMs - startTime) / 1000));
        const endSec = Math.min(Math.floor(durationMs / 1000), startSec + 45);
        peakActivityWindow = `${this.formatRelativeTime(startSec * 1000)}–${this.formatRelativeTime(endSec * 1000)}`;
      } else if (moments.length > 0) {
        const topMoment = sortedMoments[0];
        const startSec = Math.max(0, Math.floor((topMoment.timestampMs - startTime) / 1000));
        const endSec = Math.min(Math.floor(durationMs / 1000), startSec + 30);
        peakActivityWindow = `${this.formatRelativeTime(startSec * 1000)}–${this.formatRelativeTime(endSec * 1000)}`;
      }
    }

    const reviewCount = sortedMoments.filter(
      (m) => m.coincidingSignalsCount >= 2 || (m.confidenceScore ?? 0) >= 0.50
    ).length;

    let avgLevel: FrocActivityLevel = 'BAIXA';
    if (sortedMoments.length >= 5 || speechEvents.length >= 6) {
      avgLevel = 'ELEVADA';
    } else if (sortedMoments.length >= 2 || speechEvents.length >= 3) {
      avgLevel = 'MODERADA';
    }

    return {
      sessionId,
      sessionTitle,
      startTime,
      endTime,
      durationFormatted,
      durationMs,
      questionsCount: questions.length,
      possibleSpeechCount: speechEvents.length,
      correlatedMomentsCount: moments.length,
      visualCapturesCount,
      maxMagneticDeltaUt,
      peakActivityWindow,
      reviewMomentsCount: reviewCount,
      activityLevelAverage: avgLevel,
      topMoments: sortedMoments.slice(0, 10),
    };
  }

  /**
   * Aplica tratamento forense de áudio (filtro passa-faixa 300Hz-3400Hz para banda vocal
   * e normalização dinâmica controlada) sem sobrescrever o arquivo original.
   */
  static async applyForensicAudioTreatment(originalBlob: Blob): Promise<Blob> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return originalBlob;
    }

    try {
      const arrayBuffer = await originalBlob.arrayBuffer();
      const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await tempContext.decodeAudioData(arrayBuffer.slice(0));

      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      // Filtro passa-alta em 300 Hz (remove rumble de manuseio e 60Hz da rede)
      const highpass = offlineContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 300;

      // Filtro passa-baixa em 3400 Hz (remove hiss térmico acima da banda de fala)
      const lowpass = offlineContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3400;

      // Compressor suave para equalizar trechos sussurrados sem clipar picos
      const compressor = offlineContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, offlineContext.currentTime);
      compressor.knee.setValueAtTime(30, offlineContext.currentTime);
      compressor.ratio.setValueAtTime(4, offlineContext.currentTime);
      compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
      compressor.release.setValueAtTime(0.25, offlineContext.currentTime);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(offlineContext.destination);

      source.start(0);
      const renderedBuffer = await offlineContext.startRendering();
      await tempContext.close();

      // Codificar buffer para WAV
      const wavBlob = this.audioBufferToWavBlob(renderedBuffer);
      return wavBlob;
    } catch (err) {
      console.warn('[CorrelationEngine] Falha ao renderizar áudio tratado, mantendo original:', err);
      return originalBlob;
    }
  }

  /**
   * Converte AudioBuffer em Blob WAV estritamente compatível com navegadores.
   */
  private static audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let interleaved: Float32Array;
    if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      interleaved = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
    } else {
      interleaved = buffer.getChannelData(0);
    }

    const dataLength = interleaved.length * (bitDepth / 8);
    const wavHeaderLength = 44;
    const totalLength = wavHeaderLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Escrever amostras PCM 16-bit
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private static writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  static formatRelativeTime(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  static formatSegmentRange(startMs: number, endMs: number): string {
    return `${this.formatRelativeTime(startMs)}–${this.formatRelativeTime(endMs)}`;
  }

  static formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
}

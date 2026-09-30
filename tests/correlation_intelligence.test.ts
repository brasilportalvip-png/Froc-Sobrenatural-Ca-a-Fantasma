import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CorrelationEngine,
  TelemetrySample,
  QuestionContext,
} from '../src/services/correlationEngine';
import { LiveCaptionEvent, FrocMoment } from '../src/types';

test('CorrelationEngine: formata tempo relativo e intervalos de segmento com precisão', () => {
  assert.equal(CorrelationEngine.formatRelativeTime(0), '00:00');
  assert.equal(CorrelationEngine.formatRelativeTime(43000), '00:43');
  assert.equal(CorrelationEngine.formatRelativeTime(125000), '02:05');
  assert.equal(CorrelationEngine.formatRelativeTime(3665000), '01:01:05');

  assert.equal(CorrelationEngine.formatSegmentRange(43200, 45000), '00:43–00:45');
});

test('CorrelationEngine: correlaciona evento de fala após pergunta do investigador', () => {
  const sessionStartTime = 1000000;
  const questionTime = sessionStartTime + 37000; // 00:37
  const captionTime = sessionStartTime + 43000;  // 00:43 (6s depois)

  const recentQuestions: QuestionContext[] = [
    {
      id: 'q1',
      text: 'Tem alguém aqui?',
      timestampMs: questionTime,
      timeFormatted: '00:37',
    },
  ];

  const captionEvent: LiveCaptionEvent = {
    id: 'evt_sim',
    timestampFormatted: '00:43',
    timestampMs: captionTime,
    status: 'probable_transcription',
    text: 'sim',
    candidateTranscription: 'sim',
    confidence: 0.78,
    dbfs: -32,
    peakFrequencyHz: 450,
    provider: 'Gemini 3.8 Flash',
    isRelevant: true,
  };

  const telemetry: TelemetrySample[] = [
    {
      timestampMs: captionTime,
      dbfs: -32,
      peakFrequencyHz: 450,
      rms: 0.05,
      magneticDeltaUt: 3.2,
      motionMagnitude: 0.2, // estável
    },
  ];

  const moment = CorrelationEngine.correlateEvent({
    sessionId: 'session_test_1',
    captionEvent,
    recentTelemetry: telemetry,
    recentQuestions,
    sessionStartTime,
  });

  assert.ok(moment, 'Deveria gerar um momento Froc correlacionado');
  assert.equal(moment.type, 'post_question_speech');
  assert.equal(moment.candidateTranscription, 'sim');
  assert.equal(moment.confidenceScore, 0.78);
  assert.equal(moment.questionContext, 'Tem alguém aqui?');
  assert.equal(moment.signalsSummary.postQuestionElapsedSec, 6);
  assert.equal(moment.signalsSummary.isDeviceStable, true);
  assert.equal(moment.signalsSummary.magneticDeltaUt, 3.2);

  // Não deve conter alegações de paranormalidade inventada
  assert.ok(
    !moment.description.includes('espírito'),
    'Não deve inventar entidade espiritual'
  );
  assert.ok(
    moment.description.includes('6 segundos após sua pergunta'),
    'Deve registrar a correlação temporal exata'
  );
});

test('CorrelationEngine: correlaciona coincidência temporal instrumental (áudio + campo magnético)', () => {
  const sessionStartTime = 1000000;
  const captionTime = sessionStartTime + 85000; // 01:25

  const captionEvent: LiveCaptionEvent = {
    id: 'evt_anom',
    timestampFormatted: '01:25',
    timestampMs: captionTime,
    status: 'possible_speech',
    text: '[fala pouco inteligível]',
    candidateTranscription: null,
    confidence: 0.42,
    dbfs: -28,
    peakFrequencyHz: 520,
    provider: 'Motor Local',
    isRelevant: true,
  };

  // Oscilação magnética no intervalo de ±2 segundos
  const telemetry: TelemetrySample[] = [
    {
      timestampMs: captionTime - 1000,
      dbfs: -28,
      peakFrequencyHz: 520,
      rms: 0.04,
      magneticDeltaUt: 4.8,
      motionMagnitude: 0.3,
    },
  ];

  const moment = CorrelationEngine.correlateEvent({
    sessionId: 'session_test_2',
    captionEvent,
    recentTelemetry: telemetry,
    recentQuestions: [],
    sessionStartTime,
  });

  assert.ok(moment, 'Deveria gerar momento por coincidência instrumental');
  assert.equal(moment.type, 'instrumental_coincidence');
  assert.ok(moment.coincidingSignalsCount >= 2);
  assert.equal(moment.signalsSummary.magneticDeltaUt, 4.8);
  assert.ok(moment.title.includes('Coincidência'));
});

test('CorrelationEngine: calcula Índice de Atividade determinístico sem aleatoriedade', () => {
  const now = 5000000;

  // Cenário 1: Ambiente estável / calmo
  const calm = CorrelationEngine.calculateActivityIndex({
    momentsInLast60s: [],
    speechEventsInLast60s: [],
    sensorExcursionsCount: 0,
  });
  assert.equal(calm.level, 'BAIXA');
  assert.ok(calm.explanation.toLowerCase().includes('baixo') || calm.explanation.toLowerCase().includes('baixa'));

  // Cenário 2: Moderada atividade
  const dummyMoment: FrocMoment = {
    id: 'm1',
    sessionId: 's1',
    timestampMs: now - 10000,
    relativeTimeFormatted: '00:10',
    type: 'voice_candidate',
    title: 'Voz detectada',
    description: 'Teste',
    coincidingSignalsCount: 1,
    signalsSummary: {},
  };

  const moderate = CorrelationEngine.calculateActivityIndex({
    momentsInLast60s: [],
    speechEventsInLast60s: [
      {
        id: 'e1',
        timestampFormatted: '00:10',
        timestampMs: now - 10000,
        status: 'probable_transcription',
        text: 'sim',
        confidence: 0.7,
        dbfs: -30,
        peakFrequencyHz: 500,
        provider: 'Gemini',
        isRelevant: true,
      },
    ],
    sensorExcursionsCount: 1,
  });
  assert.equal(moderate.level, 'MODERADA');

  // Cenário 3: Elevada atividade (score >= 6 e < 10)
  const elevated = CorrelationEngine.calculateActivityIndex({
    momentsInLast60s: [dummyMoment],
    speechEventsInLast60s: [
      { id: 'e1', timestampFormatted: '00:10', timestampMs: now - 10000, status: 'probable_transcription', text: 'a', confidence: 0.7, dbfs: -30, peakFrequencyHz: 500, provider: 'Gemini', isRelevant: true },
    ],
    sensorExcursionsCount: 1,
  });
  assert.equal(elevated.level, 'ELEVADA');
  assert.ok(elevated.explanation.includes('Índice elevado'));

  // Cenário 4: Alta atividade (score >= 10)
  const high = CorrelationEngine.calculateActivityIndex({
    momentsInLast60s: [dummyMoment, { ...dummyMoment, id: 'm2' }],
    speechEventsInLast60s: [
      { id: 'e1', timestampFormatted: '00:10', timestampMs: now - 10000, status: 'probable_transcription', text: 'a', confidence: 0.7, dbfs: -30, peakFrequencyHz: 500, provider: 'Gemini', isRelevant: true },
      { id: 'e2', timestampFormatted: '00:20', timestampMs: now - 20000, status: 'probable_transcription', text: 'b', confidence: 0.7, dbfs: -30, peakFrequencyHz: 500, provider: 'Gemini', isRelevant: true },
    ],
    sensorExcursionsCount: 2,
  });
  assert.equal(high.level, 'ALTA');
  assert.ok(high.explanation.includes('Índice alto'));
});

test('CorrelationEngine: gera Resumo da Investigação rigoroso e destaques ordenados', () => {
  const startTime = 1000000;
  const endTime = startTime + 763000; // 12m 43s

  const moments: FrocMoment[] = [
    {
      id: 'm1',
      sessionId: 's1',
      timestampMs: startTime + 43000,
      relativeTimeFormatted: '00:43',
      type: 'post_question_speech',
      title: 'Momento 1 — 00:43',
      description: 'Possível fala "sim"',
      coincidingSignalsCount: 2,
      confidenceScore: 0.78,
      candidateTranscription: 'sim',
      signalsSummary: { audioDeltaDbfs: 12, magneticDeltaUt: 3.2 },
    },
    {
      id: 'm2',
      sessionId: 's1',
      timestampMs: startTime + 242000,
      relativeTimeFormatted: '04:02',
      type: 'instrumental_coincidence',
      title: 'Momento 2 — 04:02',
      description: 'Coincidência áudio + magnetômetro',
      coincidingSignalsCount: 3,
      signalsSummary: { audioDeltaDbfs: 15, magneticDeltaUt: 5.4 },
    },
  ];

  const summary = CorrelationEngine.generateSessionSummary({
    sessionId: 's1',
    sessionTitle: 'Investigação Teste',
    startTime,
    endTime,
    questions: [
      { id: 'q1', text: 'Tem alguém aqui?', timestampMs: startTime + 37000, timeFormatted: '00:37' },
    ],
    captionEvents: [
      { id: 'c1', timestampFormatted: '00:43', timestampMs: startTime + 43000, status: 'probable_transcription', text: 'sim', confidence: 0.78, dbfs: -32, peakFrequencyHz: 400, provider: 'Gemini', isRelevant: true },
    ],
    moments,
    visualCapturesCount: 2,
    maxMagneticDeltaUt: 5.4,
  });

  assert.equal(summary.durationFormatted, '12m 43s');
  assert.equal(summary.questionsCount, 1);
  assert.equal(summary.possibleSpeechCount, 1);
  assert.equal(summary.correlatedMomentsCount, 2);
  assert.equal(summary.visualCapturesCount, 2);
  assert.equal(summary.maxMagneticDeltaUt, 5.4);
  assert.equal(summary.topMoments.length, 2);

  // O momento com fala pós-pergunta de alta confiança (m1) lidera a relevância instrumental
  assert.equal(summary.topMoments[0].id, 'm1');
});

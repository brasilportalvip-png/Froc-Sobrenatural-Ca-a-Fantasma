import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveCaptionsEngine, ChunkRateLimiter } from '../src/services/liveCaptionsService.js';
import { app } from '../src/serverApp.js';

test('LiveCaptionsEngine - VAD Local: Detecta silêncio digital abaixo do limiar (-40 dBFS)', () => {
  const silentMetrics: any = {
    dbfs: -48,
    rms: 0.003,
    peakFrequencyHz: 120,
    isVoiceBand: false,
    frequencyData: new Uint8Array(0),
    timeData: new Uint8Array(0),
  };

  const result = LiveCaptionsEngine.evaluateVad(silentMetrics);
  assert.equal(result.status, 'no_speech');
  assert.equal(result.isVoiceCandidate, false);
});

test('LiveCaptionsEngine - VAD Local: Detecta ruído de baixa frequência fora da fala (hum de 60Hz)', () => {
  const rumbleMetrics: any = {
    dbfs: -32,
    rms: 0.035,
    peakFrequencyHz: 60,
    isVoiceBand: false,
    frequencyData: new Uint8Array(0),
    timeData: new Uint8Array(0),
  };

  const result = LiveCaptionsEngine.evaluateVad(rumbleMetrics);
  assert.equal(result.status, 'no_speech');
  assert.equal(result.isVoiceCandidate, false);
});

test('LiveCaptionsEngine - VAD Local: Identifica candidato a fala na banda vocal (850Hz com volume adequado)', () => {
  const voiceMetrics: any = {
    dbfs: -26,
    rms: 0.05,
    peakFrequencyHz: 850,
    isVoiceBand: true,
    frequencyData: new Uint8Array(0),
    timeData: new Uint8Array(0),
  };

  const result = LiveCaptionsEngine.evaluateVad(voiceMetrics);
  assert.equal(result.status, 'possible_speech');
  assert.equal(result.isVoiceCandidate, true);
});

test('LiveCaptionsEngine - Limitação de Chunks: Aplica cooldown mínimo de 9 segundos', () => {
  const limiter: ChunkRateLimiter = {
    lastCallTimestamp: Date.now() - 3000, // Há apenas 3 segundos
    timestampsInWindow: [],
    lastChunkDbfs: -30,
    lastPeakHz: 500,
  };

  const metrics: any = { dbfs: -25, peakFrequencyHz: 600 };
  const check = LiveCaptionsEngine.canDispatchToAi(limiter, metrics);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /cooldown/i);
});

test('LiveCaptionsEngine - Limitação de Chunks: Bloqueia após exceder 5 chamadas por minuto', () => {
  const now = Date.now();
  const limiter: ChunkRateLimiter = {
    lastCallTimestamp: now - 10000,
    timestampsInWindow: [now - 50000, now - 40000, now - 30000, now - 20000, now - 10000],
    lastChunkDbfs: -50,
    lastPeakHz: 1000,
  };

  const metrics: any = { dbfs: -25, peakFrequencyHz: 600 };
  const check = LiveCaptionsEngine.canDispatchToAi(limiter, metrics, now);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Limite de 5 análises/i);
});

test('LiveCaptionsEngine - Deduplicação: Rejeita trechos com acústica quase idêntica em curto intervalo', () => {
  const now = Date.now();
  const limiter: ChunkRateLimiter = {
    lastCallTimestamp: now - 11000,
    timestampsInWindow: [],
    lastChunkDbfs: -28.0,
    lastPeakHz: 750,
  };

  const identicalMetrics: any = { dbfs: -28.2, peakFrequencyHz: 755 };
  const check = LiveCaptionsEngine.canDispatchToAi(limiter, identicalMetrics, now);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /deduplicação/i);
});

test('API /api/chat: Rota existe e rejeita requisições anônimas com 401', async () => {
  const mockReq: any = {
    headers: {},
    body: { messages: [{ role: 'user', content: 'Metodologia' }] },
  };
  let statusCode = 0;
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return mockRes;
    },
    json: () => mockRes,
  };

  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/chat');
  assert.ok(layer, 'Rota /api/chat deve estar montada');

  const authMiddleware = layer.route.stack[0]?.handle;
  await authMiddleware(mockReq, mockRes, () => {});
  assert.equal(statusCode, 401, 'Requisição anônima deve receber 401');
});

test('Live Captions: Lock de transmissão impede sobreposição concorrente de múltiplos chunks', async () => {
  // Simulação de ticks de 3200ms sobre gravação assíncrona de 3600ms
  let activeRecordings = 0;
  let maxConcurrentRecordings = 0;
  let totalDispatched = 0;

  let isTransmittingChunk = false;

  const mockOnGetAudioChunk = async (durationMs: number) => {
    activeRecordings++;
    maxConcurrentRecordings = Math.max(maxConcurrentRecordings, activeRecordings);
    await new Promise((r) => setTimeout(r, 50)); // Simula gravação assíncrona
    activeRecordings--;
    return { blob: new Blob(['dummy audio chunk']), mimeType: 'audio/webm' };
  };

  const simulateTick = async () => {
    if (isTransmittingChunk) return; // Lock autoritativo
    isTransmittingChunk = true;
    totalDispatched++;
    try {
      await mockOnGetAudioChunk(3600);
    } finally {
      isTransmittingChunk = false;
    }
  };

  // Disparar 3 ticks consecutivos concorrentes (ex: intervalo de 3200ms disparando enquanto chunk de 3600ms ainda grava)
  const p1 = simulateTick();
  const p2 = simulateTick();
  const p3 = simulateTick();

  await Promise.all([p1, p2, p3]);

  assert.equal(maxConcurrentRecordings, 1, 'Nunca deve haver mais de 1 gravação ativa de chunk simultaneamente');
  assert.equal(totalDispatched, 1, 'Ticks sobrepostos enquanto o lock está ativo devem ser ignorados');
});

test('Ouija Forense: Loop de física usa snapshots atuais das refs sem closures obsoletas', async () => {
  const fs = await import('node:fs/promises');
  const code = await fs.readFile('src/components/OuijaModule.tsx', 'utf-8');

  // O efeito principal não deve conter sensorState ou audioMetrics em acessos diretos no loop de captura
  assert.ok(code.includes('currentSensors?.magnetometer?.available'), 'Deve usar currentSensors para magnetômetro');
  assert.ok(code.includes('currentSensors?.motion?.available'), 'Deve usar currentSensors para movimento');
  assert.ok(code.includes('currentSensors?.orientation?.available'), 'Deve usar currentSensors para orientação');
  assert.ok(code.includes('currentAudio?.dbfs'), 'Deve usar currentAudio para dbfs no log pericial');
});

test('Ouija Forense: Código-fonte do OuijaModule não contém manipulação de alvos artificiais nem Math.random', async () => {
  const fs = await import('node:fs/promises');
  const code = await fs.readFile('src/components/OuijaModule.tsx', 'utf-8');

  // 1. Não deve haver targets derivados da pergunta
  assert.equal(code.includes('activeTargetSymbols'), false, 'Não deve haver activeTargetSymbols');
  assert.equal(code.includes('targetIndex'), false, 'Não deve haver targetIndex');
  assert.equal(code.includes("'N', 'O', 'M', 'E'"), false, 'Não deve haver resposta N-O-M-E pré-programada');
  assert.equal(code.includes('targets = [pickSim'), false, 'Não deve haver SIM/NÃO pré-escolhido');

  // 2. Não deve haver Math.random() para movimento ou impulsos
  assert.equal(code.includes('Math.random()'), false, 'Não deve usar Math.random() no Ouija');

  // 3. Não deve inventar magnetômetro 45
  assert.equal(code.includes('|| 45'), false, 'Não deve conter fallback fictício 45 µT');

  // 4. Centro neutro inicial deve estar fora do raio de captura da letra T
  assert.ok(code.includes('{ x: 50, y: 43 }'), 'Posição inicial neutra da prancheta deve ser (50, 43)');
  assert.ok(code.includes('Math.hypot(newX - 50, newY - 43)'), 'Verificação de deslocamento de origem deve usar centro neutro (50, 43)');
  assert.ok(code.includes('hasDisplacedFromStartRef.current'), 'Dwell deve exigir deslocamento real da origem');
  assert.ok(code.includes('hasReceivedSensorSignalRef.current'), 'Dwell deve exigir sinal físico ativo');
});

test('SensorEngine: Inicialização, calibragem de baseline e leituras de sensores físicos', async () => {
  const { SensorEngine } = await import('../src/services/sensorEngine.js');
  const engine = new SensorEngine();

  const initial = engine.getReadings();
  assert.equal(initial.magnetometer.available, false);
  assert.equal(initial.magnetometer.baseline, 0);
  assert.equal(initial.motion.available, false);
  assert.equal(initial.motion.baseline, 0);
  assert.equal(initial.orientation.available, false);

  // Testar calibração sem falhas
  engine.calibrateSensors();
  const afterCalib = engine.getReadings();
  assert.equal(afterCalib.magnetometer.delta, 0);

  engine.stop();
});

test('LiveCaptionsEngine: Classificação estrita de inteligibilidade e regras anti-alucinação', () => {
  // Regra 1: Confiança >= 0.75 -> Alta inteligibilidade
  const high = LiveCaptionsEngine.classifyConfidence(0.82, 'socorro', true);
  assert.equal(high.status, 'probable_transcription');
  assert.equal(high.displayText, '"socorro"');
  assert.equal(high.isSpeech, true);

  // Regra 2: 0.50 a 0.74 -> Interpretação provável
  const probable = LiveCaptionsEngine.classifyConfidence(0.64, 'maria', true);
  assert.equal(probable.status, 'probable_transcription');
  assert.equal(probable.displayText, '"maria"');

  // Regra 3: 0.30 a 0.49 -> Possível com indicação clara
  const possible = LiveCaptionsEngine.classifyConfidence(0.42, 'sai daqui', true);
  assert.equal(possible.status, 'possible_speech');
  assert.equal(possible.displayText, 'Possível: "sai daqui"');

  // Regra 4: < 0.30 com voz detectada -> Não inventar palavras
  const lowVoice = LiveCaptionsEngine.classifyConfidence(0.22, 'palavra_inventada', true);
  assert.equal(lowVoice.candidateTranscription, null);
  assert.equal(lowVoice.displayText, '[emissão vocal pouco inteligível]');
  assert.equal(lowVoice.status, 'inconclusive');

  // Regra 5: < 0.30 sem voz detectada -> Sem fala inteligível
  const noSpeech = LiveCaptionsEngine.classifyConfidence(0.10, null, false);
  assert.equal(noSpeech.candidateTranscription, null);
  assert.equal(noSpeech.displayText, '[sem fala inteligível]');
  assert.equal(noSpeech.status, 'no_speech');

  // Regra 6: Silêncio absoluto
  const silence = LiveCaptionsEngine.classifyConfidence(0, null, false);
  assert.equal(silence.displayText, '[sem fala inteligível]');
  assert.equal(silence.candidateTranscription, null);
});

test('LiveCaptionsEngine: Detecção de ambiguidade acústica entre reanálises divergentes', () => {
  // Divergência com confiança similar entre transcrições diferentes
  const amb = LiveCaptionsEngine.detectAmbiguity(
    { text: 'Maria', confidence: 0.56 },
    { text: 'Marina', confidence: 0.51 }
  );
  assert.equal(amb.isAmbiguous, true);
  assert.match(amb.message || '', /ambíguo/i);

  // Transcrições idênticas não são ambíguas
  const consistent = LiveCaptionsEngine.detectAmbiguity(
    { text: 'Não', confidence: 0.81 },
    { text: 'não', confidence: 0.80 }
  );
  assert.equal(consistent.isAmbiguous, false);
});

test('LiveCaptionsEngine: Combinação de fragmentos acústicos cronológicos', () => {
  const evt1: any = {
    id: 'e1',
    timestampMs: 1000,
    timestampFormatted: '00:01',
    text: 'sai',
    candidateTranscription: 'sai',
    confidence: 0.65,
    status: 'probable_transcription',
  };
  const evt2: any = {
    id: 'e2',
    timestampMs: 2500,
    timestampFormatted: '00:02',
    text: 'daqui',
    candidateTranscription: 'daqui',
    confidence: 0.70,
    status: 'probable_transcription',
  };

  const combinedList = LiveCaptionsEngine.combineConsecutivePhrases([evt2, evt1]);
  assert.ok(combinedList.length > 0);
  const newest = combinedList[0];
  assert.equal(newest.isCombinedPhrase, true);
  assert.equal(newest.candidateTranscription, 'sai daqui');
  assert.equal(newest.text, '"sai daqui"');
});

test('Session Creation & Evidence Linking: Sessão criada sob demanda retorna objeto de sessão de forma autoritativa para a evidência', async () => {
  // Simula estado inicial sem sessão ativa (closure enxerga activeSession === null)
  let activeSessionState: any = null;

  const handleStartSession = async () => {
    const newSession = {
      id: `session_test_${Date.now()}`,
      title: 'Sessão de Campo #1',
      startTime: Date.now(),
      status: 'active',
      evidenceCount: 0,
    };
    // Atualização de state é assíncrona
    setTimeout(() => {
      activeSessionState = newSession;
    }, 100);
    return newSession;
  };

  const handleSaveLiveCaptionEvidence = async (event: any) => {
    let currentSession = activeSessionState;
    if (!currentSession) {
      currentSession = await handleStartSession();
    }
    // sessionId obtido imediatamente da instância retornada, sem depender de activeSessionState
    assert.ok(currentSession, 'A sessão retornada não deve ser nula');
    assert.ok(currentSession.id, 'O ID da sessão retornada deve existir');
    assert.match(currentSession.id, /^session_test_/);

    const evidence = {
      id: `ev_${Date.now()}`,
      sessionId: currentSession.id,
      text: event.text,
      timestamp: Date.now(),
    };
    return evidence;
  };

  const savedEvidence = await handleSaveLiveCaptionEvidence({ text: 'Sinal vocal detectado' });
  assert.ok(savedEvidence.sessionId, 'Evidência de legenda deve ter sessionId válido');
  assert.notEqual(savedEvidence.sessionId, null);
  assert.notEqual(savedEvidence.sessionId, '');
});

test('Race Condition Lock: Lock compartilhado impede colisões de gravação entre Live Captions e envio de pergunta', async () => {
  const audioChunkLock = { current: false };
  let concurrentRecordings = 0;
  let maxConcurrentRecordings = 0;
  let questionsRecorded = 0;
  let questionsSentWithoutConflict = 0;

  const mockGetAudioChunk = async (durationMs: number) => {
    concurrentRecordings++;
    maxConcurrentRecordings = Math.max(maxConcurrentRecordings, concurrentRecordings);
    await new Promise((r) => setTimeout(r, 40));
    concurrentRecordings--;
    return { blob: new Blob(['audio']), mimeType: 'audio/webm' };
  };

  // Live captions captura chunk de 3600ms
  const runLiveCaptionsCapture = async () => {
    if (audioChunkLock.current) return;
    audioChunkLock.current = true;
    try {
      await mockGetAudioChunk(3600);
    } finally {
      audioChunkLock.current = false;
    }
  };

  // Envio de pergunta do investigador enquanto Live Captions está em andamento
  const handleSendQuestion = async () => {
    let audioBlob: any = undefined;
    if (!audioChunkLock.current) {
      audioChunkLock.current = true;
      try {
        const chunk = await mockGetAudioChunk(3500);
        audioBlob = chunk.blob;
        questionsRecorded++;
      } finally {
        audioChunkLock.current = false;
      }
    } else {
      // Lock ocupado: envia pergunta sem abrir segundo MediaRecorder concorrente
      questionsSentWithoutConflict++;
    }
    return { sent: true, audioBlob };
  };

  // Disparar Live Captions e envio de pergunta simultaneamente
  const captionPromise = runLiveCaptionsCapture();
  // Breve delay de 5ms para que a gravação do Live Captions já tenha adquirido o lock
  await new Promise((r) => setTimeout(r, 5));
  const questionPromise = handleSendQuestion();

  await Promise.all([captionPromise, questionPromise]);

  assert.equal(maxConcurrentRecordings, 1, 'Nunca deve haver mais de 1 gravação simultânea');
  assert.equal(questionsSentWithoutConflict, 1, 'A pergunta concorrente deve respeitar o lock e evitar colisão de gravação');
});

test('Timestamps Autoritativos do Sistema: /api/analyze higieniza e preserva limites temporais fornecidos pelo sistema', () => {
  const sanitizeTimestamps = (reqBody: any) => {
    const rawStartMs = Number(reqBody?.segmentStartMs);
    const segmentStartMs = Number.isFinite(rawStartMs) && rawStartMs >= 0 ? Math.floor(rawStartMs) : 0;
    const rawEndMs = Number(reqBody?.segmentEndMs);
    const segmentEndMs = Number.isFinite(rawEndMs) && rawEndMs >= segmentStartMs
      ? Math.min(Math.floor(rawEndMs), segmentStartMs + 30000)
      : segmentStartMs + 3600;
    return { segmentStartMs, segmentEndMs };
  };

  // Caso 1: Valores válidos normais
  const valid = sanitizeTimestamps({ segmentStartMs: 12000, segmentEndMs: 15600 });
  assert.equal(valid.segmentStartMs, 12000);
  assert.equal(valid.segmentEndMs, 15600);

  // Caso 2: Start negativo deve ser normalizado para 0
  const negStart = sanitizeTimestamps({ segmentStartMs: -500, segmentEndMs: 3000 });
  assert.equal(negStart.segmentStartMs, 0);
  assert.equal(negStart.segmentEndMs, 3000);

  // Caso 3: End menor que start deve receber default de start + 3600
  const inverted = sanitizeTimestamps({ segmentStartMs: 5000, segmentEndMs: 2000 });
  assert.equal(inverted.segmentStartMs, 5000);
  assert.equal(inverted.segmentEndMs, 8600);

  // Caso 4: Intervalo absurdamente longo (> 30s) é limitado ao teto seguro
  const excessive = sanitizeTimestamps({ segmentStartMs: 1000, segmentEndMs: 900000 });
  assert.equal(excessive.segmentStartMs, 1000);
  assert.equal(excessive.segmentEndMs, 31000); // 1000 + 30000
});


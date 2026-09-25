import React, { useState, useEffect, useRef } from 'react';
import {
  ModuleTab,
  Session,
  EvidenceItem,
  SensorState,
  EvidenceCategory,
  LiveCaptionEvent,
} from './types';
import {
  saveSession,
  loadSessions,
  deleteSession,
  saveEvidenceItem,
  loadSessionEvidence,
} from './services/storage';
import { AudioEngine, AudioMetrics } from './services/audioEngine';
import { SensorEngine } from './services/sensorEngine';
import { CommunicationModule } from './components/CommunicationModule';
import { VisionModule } from './components/VisionModule';
import { OuijaModule } from './components/OuijaModule';
import { SensorsModule } from './components/SensorsModule';
import { EvidenceModule } from './components/EvidenceModule';
import { BlindTestModule } from './components/BlindTestModule';
import { SettingsModule } from './components/SettingsModule';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { AuthModal } from './components/AuthModal';
import { WalletModal } from './components/WalletModal';
import { UserPanel } from './components/UserPanel';
import { AdminPanel } from './components/AdminPanel';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfUse } from './components/TermsOfUse';
import { NotFoundPage } from './components/NotFoundPage';
import { AppFooter } from './components/AppFooter';
import { ToolSessionGate } from './components/ToolSessionGate';
import { useAuth } from './services/AuthContext';
import { useToolSession } from './services/ToolSessionContext';
import {
  Radio,
  Eye,
  Compass,
  Gauge,
  ShieldCheck,
  Lock,
  Settings,
  Activity,
  Layers,
  Sparkles,
  User,
  Wallet,
  LayoutDashboard,
  ShieldAlert,
  LogOut,
  CheckCircle,
} from 'lucide-react';

export default function App() {
  const { user, profile, wallet, isAdmin, getIdToken, refreshWallet, logoutUser } = useAuth();
  const { getActiveSessionId } = useToolSession();
  const [activeTab, setActiveTab] = useState<ModuleTab>('communication');

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Sessions and Evidence State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);

  // Audio Engine & Metrics
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const [hasAudioPermission, setHasAudioPermission] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    dbfs: -100,
    rms: 0,
    peakFrequencyHz: 0,
    isVoiceBand: false,
    frequencyData: new Uint8Array(0),
    timeData: new Uint8Array(0),
  });

  // Sensor Engine & Telemetry State
  const sensorEngineRef = useRef<SensorEngine | null>(null);
  const [sensorState, setSensorState] = useState<SensorState>({
    magnetometer: {
      available: false,
      x: 0,
      y: 0,
      z: 0,
      magnitude: 0,
      baseline: 0,
      delta: 0,
      unit: 'µT',
      statusText: 'Iniciando...',
    },
    motion: {
      available: false,
      x: 0,
      y: 0,
      z: 0,
      magnitude: 0,
      baseline: 0,
      delta: 0,
      unit: 'm/s²',
      statusText: 'Iniciando...',
    },
    orientation: {
      available: false,
      alpha: null,
      beta: null,
      gamma: null,
      baselineBeta: 0,
      baselineGamma: 0,
      deltaBeta: 0,
      deltaGamma: 0,
      statusText: 'Iniciando...',
    },
    audioLevel: {
      dbfs: -100,
      rms: 0,
      peakHz: 0,
      isSpeechBand: false,
    },
  });

  // Hardware Devices
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');

  // Server & AI Status
  const [hasGemini, setHasGemini] = useState(false);

  // Sincronizar metadados dinâmicos de SEO e rotas da SPA
  useEffect(() => {
    const BASE_URL = 'https://froc-sobrenatural-ca-a-fantasma.vercel.app';
    const OG_IMAGE = `${BASE_URL}/og-image.png`;
    const OG_IMAGE_ALT = 'Estação Froc Sobrenatural Caça Fantasma - Painel de Telemetria e Espectrografia';

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        if (selector.startsWith('meta[')) {
          el = document.createElement('meta');
          const match = selector.match(/meta\[([a-zA-Z:]+)="([^"]+)"\]/);
          if (match) el.setAttribute(match[1], match[2]);
          document.head.appendChild(el);
        } else if (selector.startsWith('link[')) {
          el = document.createElement('link');
          const match = selector.match(/link\[([a-zA-Z:]+)="([^"]+)"\]/);
          if (match) el.setAttribute(match[1], match[2]);
          document.head.appendChild(el);
        }
      }
      if (el) el.setAttribute(attr, value);
    };

    let title = 'Froc Sobrenatural Caça Fantasma';
    let description = 'Estação metodológica de pesquisa e investigação de campo com telemetria de sensores, espectrograma de áudio, registro de evidências e protocolo de teste cego criptografado.';
    let robots = 'index, follow';
    let canonical = BASE_URL;

    if (activeTab === 'privacy') {
      title = 'Política de Privacidade | Froc Sobrenatural';
      description = 'Diretrizes transparentes de tratamento e retenção de dados, conformidade LGPD e segurança técnica da estação Froc Sobrenatural.';
      robots = 'index, follow';
      canonical = `${BASE_URL}/politica-de-privacidade`;
    } else if (activeTab === 'terms') {
      title = 'Termos de Uso e Serviço | Froc Sobrenatural';
      description = 'Termos de serviço, modelo de créditos pré-pagos periciais, critérios de reembolso e limites da estação Froc Sobrenatural.';
      robots = 'index, follow';
      canonical = `${BASE_URL}/termos-de-uso`;
    } else if (activeTab === 'painel') {
      title = 'Painel do Investigador | Froc Sobrenatural';
      description = 'Área restrita de gestão de créditos, recargas e histórico de consultas periciais.';
      robots = 'noindex, nofollow';
      canonical = `${BASE_URL}/painel`;
    } else if (activeTab === 'admin') {
      title = 'Console de Administração | Froc Sobrenatural';
      description = 'Console restrito de governança e auditoria transacional.';
      robots = 'noindex, nofollow';
      canonical = `${BASE_URL}/admin`;
    } else if (activeTab === 'notfound') {
      title = '404 - Coordenada Não Encontrada | Froc Sobrenatural';
      description = 'A coordenada ou rota solicitada não existe nesta estação investigativa.';
      robots = 'noindex, nofollow';
      canonical = BASE_URL;
    }

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', robots);
    setMeta('link[rel="canonical"]', 'href', canonical);

    // Open Graph
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[property="og:image"]', 'content', OG_IMAGE);
    setMeta('meta[property="og:image:width"]', 'content', '1200');
    setMeta('meta[property="og:image:height"]', 'content', '630');
    setMeta('meta[property="og:image:alt"]', 'content', OG_IMAGE_ALT);

    // Twitter Cards
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', OG_IMAGE);
    setMeta('meta[name="twitter:image:alt"]', 'content', OG_IMAGE_ALT);
  }, [activeTab]);

  // Initialize Engines & Storage
  useEffect(() => {
    // Sincronizar rota da URL inicial
    const resolveTabFromPath = (pathname: string): ModuleTab => {
      const p = pathname.toLowerCase().replace(/\/+$/, '') || '/';
      if (p === '/painel' || p === '/panel') return 'painel';
      if (p === '/admin') return 'admin';
      if (p === '/politica-de-privacidade' || p === '/privacidade' || p === '/privacy') return 'privacy';
      if (p === '/termos-de-uso' || p === '/termos' || p === '/terms') return 'terms';
      if (p === '/' || p === '') return 'communication';
      return 'notfound';
    };

    setActiveTab(resolveTabFromPath(window.location.pathname));

    const handlePopState = () => {
      setActiveTab(resolveTabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);

    audioEngineRef.current = new AudioEngine();
    sensorEngineRef.current = new SensorEngine();

    // Check backend server status
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        const isGeminiAvailable = !!data.hasGemini || data.services?.geminiAi === 'operational';
        setHasGemini(isGeminiAvailable);
      })
      .catch(() => {
        setHasGemini(false);
      });

    // Load saved sessions from IndexedDB
    loadSessions().then((list) => {
      setSessions(list);
      if (list.length > 0) {
        const first = list[0];
        setSelectedSessionId(first.id);
        if (first.status === 'active') {
          setActiveSession(first);
        }
      }
    });

    // Initialize sensors
    sensorEngineRef.current.initSensors();

    // Enumerate audio devices
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mics = devices.filter((d) => d.kind === 'audioinput');
        setAvailableMics(mics);
        if (mics.length > 0 && !selectedMicId) {
          setSelectedMicId(mics[0].deviceId);
        }
      });
    }

    return () => {
      audioEngineRef.current?.stopMicrophone();
      sensorEngineRef.current?.stop();
    };
  }, []);

  // Real-time loop for audio & sensor polling throttled to ~20FPS (50ms)
  // Prevents whole-app 60FPS re-rendering while keeping instruments responsive and smooth
  useEffect(() => {
    let animId: number;
    let lastTick = 0;
    const INTERVAL_MS = 50; // 20 updates per second is ideal for telemetry without lag

    const tick = (now: number) => {
      if (now - lastTick >= INTERVAL_MS) {
        lastTick = now;
        if (audioEngineRef.current) {
          const metrics = audioEngineRef.current.getMetrics();
          setAudioMetrics(metrics);

          const sensors = sensorEngineRef.current?.getReadings();
          if (sensors) {
            setSensorState({
              magnetometer: {
                ...sensors.magnetometer,
                unit: 'µT',
              },
              motion: {
                ...sensors.motion,
                unit: 'm/s²',
              },
              orientation: {
                ...sensors.orientation,
              },
              audioLevel: {
                dbfs: metrics.dbfs,
                rms: metrics.rms,
                peakHz: metrics.peakFrequencyHz,
                isSpeechBand: metrics.isVoiceBand,
              },
            });
          }
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Load evidence whenever selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId) {
      loadSessionEvidence(selectedSessionId).then((items) => {
        setEvidenceList(items);
      });
    } else {
      setEvidenceList([]);
    }
  }, [selectedSessionId]);

  // Request Microphone Permission
  const requestMicPermission = async () => {
    if (!audioEngineRef.current) return;
    const ok = await audioEngineRef.current.startMicrophone(selectedMicId);
    setHasAudioPermission(ok);

    // Refresh devices list to get real labels
    if (ok && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableMics(devices.filter((d) => d.kind === 'audioinput'));
    }
  };

  // Start a New Session
  const handleStartSession = async () => {
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? `session_${crypto.randomUUID()}` : `session_${Date.now()}`;
    const newSession: Session = {
      id: sessionId,
      title: `Sessão de Campo #${sessions.length + 1}`,
      startTime: Date.now(),
      investigatorName: 'Investigador Principal',
      locationNotes: 'Ambiente controlado',
      status: 'active',
      evidenceCount: 0,
    };

    await saveSession(newSession);
    setActiveSession(newSession);
    setSelectedSessionId(newSession.id);
    setSessions((prev) => [newSession, ...prev]);
    setEvidenceList([]);

    // Auto connect mic if not already
    if (!hasAudioPermission) {
      await requestMicPermission();
    }
  };

  // End Current Session
  const handleEndSession = async () => {
    if (!activeSession) return;
    const finished: Session = {
      ...activeSession,
      status: 'concluded',
      endTime: Date.now(),
      evidenceCount: evidenceList.length,
    };

    if (isRecordingAudio && audioEngineRef.current) {
      await audioEngineRef.current.stopRecording();
      setIsRecordingAudio(false);
    }

    await saveSession(finished);
    setActiveSession(null);
    setSessions((prev) => prev.map((s) => (s.id === finished.id ? finished : s)));
  };

  // Toggle Audio Recording
  const handleToggleRecording = async () => {
    if (!audioEngineRef.current) return;

    if (!hasAudioPermission) {
      await requestMicPermission();
    }

    if (isRecordingAudio) {
      await audioEngineRef.current.stopRecording();
      setIsRecordingAudio(false);
    } else {
      const started = audioEngineRef.current.startRecording();
      setIsRecordingAudio(started);
    }
  };

  // Add Question & Signal Evidence (called by CommunicationModule)
  const handleAddQuestionEvidence = async (
    question: string,
    candidateBlob?: Blob
  ): Promise<EvidenceItem | null> => {
    if (!user) {
      setIsAuthModalOpen(true);
      return null;
    }

    let currentSession = activeSession;

    // Auto-create session if user submits question directly
    if (!currentSession) {
      const newSession: Session = {
        id: `froc_session_${Date.now()}`,
        title: `Sessão Rápida #${sessions.length + 1}`,
        startTime: Date.now(),
        investigatorName: 'Investigador Principal',
        locationNotes: 'Início instantâneo',
        status: 'active',
        evidenceCount: 0,
      };
      await saveSession(newSession);
      setActiveSession(newSession);
      setSelectedSessionId(newSession.id);
      setSessions((prev) => [newSession, ...prev]);
      currentSession = newSession;
    }

    const now = Date.now();
    const relativeTimeSec = Math.max(0, (now - currentSession.startTime) / 1000);
    const formattedTime = new Date(now).toLocaleTimeString();
    const evidenceId = `ev_${now}_${Math.random().toString(36).slice(2, 6)}`;

    // Prepare audio sample: use passed blob or record a 2.5s slice for forensic analysis
    let audioBlobToSave = candidateBlob;
    let base64Audio = '';
    let mimeType = 'audio/webm';

    // If microphone is active and no blob passed, let's grab the current stream segment
    if (!audioBlobToSave && audioEngineRef.current) {
      // If recorder was already running, stop or capture slice
      if (isRecordingAudio) {
        const rec = await audioEngineRef.current.stopRecording();
        audioBlobToSave = rec.blob;
        mimeType = rec.mimeType;
        // restart recording for continuous session
        audioEngineRef.current.startRecording();
      }
    }

    // Convert audio to base64 for API if present
    if (audioBlobToSave && audioBlobToSave.size > 0) {
      const reader = new FileReader();
      base64Audio = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlobToSave!);
      });
    }

    // Send to /api/analyze with strict forensic guidelines and persistent request id for idempotency
    let analysisResult: any = null;
    const persistentRequestId = `req_${now}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const token = await getIdToken();
      const activeToolSessionId = getActiveSessionId('communication');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      headers['x-request-id'] = persistentRequestId;
      if (activeToolSessionId) {
        headers['x-tool-session-id'] = activeToolSessionId;
      }

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question,
          audioBase64: base64Audio || undefined,
          mimeType,
          toolSessionId: activeToolSessionId,
          audioMetrics: {
            dbfs: audioMetrics.dbfs,
            peakFrequencyHz: audioMetrics.peakFrequencyHz,
            rms: audioMetrics.rms,
            isVoiceBand: audioMetrics.isVoiceBand,
          },
          sensorContext: {
            magnetometer: sensorState.magnetometer,
            motion: sensorState.motion,
          },
        }),
      });

      if (resp.ok) {
        analysisResult = await resp.json();
        // Sincronizar saldo de créditos da carteira imediatamente
        await refreshWallet();
      } else if (resp.status === 402) {
        const errJson = await resp.json();
        analysisResult = {
          candidateTranscription: null,
          voiceDetected: false,
          confidence: 0,
          conclusion: 'Consulta não realizada: saldo insuficiente (necessário 5 créditos disponíveis).',
          acousticAnalysis: 'Recusado pelo servidor por ausência de créditos.',
          alternativeHypotheses: ['Adquira um pacote de créditos para liberar novas análises.'],
          provider: 'Sistema de Carteira',
          failed: true,
        };
        setIsWalletModalOpen(true);
      } else {
        const errJson = await resp.json().catch(() => ({}));
        analysisResult = {
          candidateTranscription: null,
          voiceDetected: false,
          confidence: 0,
          conclusion: 'Análise pericial não realizada devido a falha técnica ou de conexão.',
          acousticAnalysis: errJson.error || 'Serviço temporariamente indisponível.',
          alternativeHypotheses: ['Tente novamente mais tarde'],
          provider: 'Não processado',
          failed: true,
        };
      }
    } catch (err: any) {
      console.warn('Erro ao processar análise de áudio:', err);
      analysisResult = {
        candidateTranscription: null,
        voiceDetected: false,
        confidence: 0,
        conclusion: 'Análise não realizada: sem conexão com o servidor.',
        acousticAnalysis: 'Falha na comunicação de rede.',
        alternativeHypotheses: ['Verifique a conexão com a internet'],
        provider: 'Sem conexão',
        failed: true,
      };
    }

    // Se a consulta falhou antes da execução comprovada ou faltou saldo, não fabrica evidência espúria de resultado
    if (analysisResult?.failed) {
      return null;
    }

    const newEvidence: EvidenceItem = {
      id: evidenceId,
      sessionId: currentSession.id,
      timestamp: now,
      formattedTime,
      relativeTimeSec,
      category: 'question',
      title: `Pergunta: "${question}"`,
      details: analysisResult.conclusion || 'Análise registrada.',
      questionText: question,
      signalData: {
        dbfs: audioMetrics.dbfs,
        peakFrequencyHz: audioMetrics.peakFrequencyHz,
        rms: audioMetrics.rms,
        magneticMagnitudeUtd: sensorState.magnetometer.available
          ? sensorState.magnetometer.magnitude
          : undefined,
        magneticDeltaUtd: sensorState.magnetometer.available
          ? sensorState.magnetometer.delta
          : undefined,
        motionMagnitude: sensorState.motion.available
          ? sensorState.motion.magnitude
          : undefined,
      },
      audioId: audioBlobToSave ? `audio_${evidenceId}` : undefined,
      hasAudio: !!audioBlobToSave && audioBlobToSave.size > 0,
      candidateTranscription: analysisResult.candidateTranscription || null,
      confidenceScore: analysisResult.confidence || 0,
      possibleName: analysisResult.possibleName || undefined,
      decisionStatus: 'pending',
      aiAnalysis: {
        conclusion: analysisResult.conclusion || 'Nenhuma resposta identificada.',
        confidence: analysisResult.confidence || 0,
        voiceDetected: analysisResult.voiceDetected || false,
        acousticAnalysis: analysisResult.acousticAnalysis || '',
        alternativeHypotheses: analysisResult.alternativeHypotheses || [],
        provider: analysisResult.provider || 'Motor Local',
      },
      verifiedStatus: analysisResult.candidateTranscription
        ? 'inconclusive'
        : 'refuted_noise',
    };

    await saveEvidenceItem(newEvidence, audioBlobToSave);
    setEvidenceList((prev) => [newEvidence, ...prev]);

    return newEvidence;
  };

  // Add Live Caption Evidence (called by CommunicationModule)
  const handleSaveLiveCaptionEvidence = async (event: LiveCaptionEvent, audioBlob?: Blob) => {
    let currentSession = activeSession;
    if (!currentSession) {
      await handleStartSession();
      currentSession = activeSession;
    }
    const sessionId = currentSession?.id || selectedSessionId;
    const now = Date.now();
    const relativeTimeSec = currentSession
      ? Math.max(0, (now - currentSession.startTime) / 1000)
      : 0;

    const evidenceId = `ev_caption_${now}`;
    const newEvidence: EvidenceItem = {
      id: evidenceId,
      sessionId,
      timestamp: now,
      formattedTime: new Date(now).toLocaleTimeString(),
      relativeTimeSec,
      category: 'candidate_transcription',
      title: event.candidateTranscription
        ? `Legenda Vocal: "${event.candidateTranscription}"`
        : `Detecção de Sinal Vocal (${event.dbfs.toFixed(0)} dBFS)`,
      details: event.text,
      signalData: {
        dbfs: event.dbfs,
        peakFrequencyHz: event.peakFrequencyHz,
        rms: audioMetrics.rms,
        magneticMagnitudeUtd: sensorState.magnetometer.available
          ? sensorState.magnetometer.magnitude
          : undefined,
      },
      hasAudio: !!audioBlob,
      audioId: audioBlob ? `audio_${evidenceId}` : undefined,
      candidateTranscription: event.candidateTranscription || null,
      confidenceScore: event.confidence,
      decisionStatus: 'pending',
      aiAnalysis: {
        conclusion: event.text,
        confidence: event.confidence,
        voiceDetected: event.status === 'possible_speech' || !!event.candidateTranscription,
        acousticAnalysis: `[VAD em Tempo Real] dBFS: ${event.dbfs.toFixed(1)} | Frequência: ${event.peakFrequencyHz} Hz | Provedor: ${event.provider}`,
        alternativeHypotheses: event.alternativeHypotheses || ['Ruído acústico do ambiente', 'Interferência do transdutor'],
        provider: event.provider,
      },
      verifiedStatus: event.candidateTranscription ? 'inconclusive' : 'refuted_noise',
    };

    await saveEvidenceItem(newEvidence, audioBlob);
    setEvidenceList((prev) => [newEvidence, ...prev]);
  };

  // Add Photo Evidence (called by VisionModule)
  const handleSavePhotoEvidence = async (
    photoDataUrl: string,
    analysisNote: string,
    visionMetadata?: any
  ) => {
    let currentSession = activeSession;
    if (!currentSession) {
      await handleStartSession();
      currentSession = activeSession;
    }
    const sessionId = currentSession?.id || selectedSessionId;
    const now = Date.now();
    const relativeTimeSec = currentSession
      ? Math.max(0, (now - currentSession.startTime) / 1000)
      : 0;

    const evidenceId = `ev_photo_${now}`;
    const newEvidence: EvidenceItem = {
      id: evidenceId,
      sessionId,
      timestamp: now,
      formattedTime: new Date(now).toLocaleTimeString(),
      relativeTimeSec,
      category: 'photo_capture',
      title: 'Fotografia Forense de Campo',
      details: analysisNote,
      photoDataUrl,
      visionMetadata,
      signalData: {
        dbfs: audioMetrics.dbfs,
        peakFrequencyHz: audioMetrics.peakFrequencyHz,
        rms: audioMetrics.rms,
        magneticMagnitudeUtd: sensorState.magnetometer.available
          ? sensorState.magnetometer.magnitude
          : undefined,
      },
      verifiedStatus: 'none',
    };

    await saveEvidenceItem(newEvidence);
    setEvidenceList((prev) => [newEvidence, ...prev]);
  };

  // Add Ouija Evidence (called by OuijaModule)
  const handleSaveOuijaEvidence = async (
    mode: 'physical' | 'digital' | 'automatic',
    letters: string,
    notes: string,
    durationSec: number,
    telemetry?: any,
    questionContext?: string
  ) => {
    const sessionId = activeSession?.id || selectedSessionId;
    const now = Date.now();
    const relativeTimeSec = activeSession
      ? Math.max(0, (now - activeSession.startTime) / 1000)
      : 0;

    const evidenceId = `ev_ouija_${now}`;
    const modeLabel = mode === 'automatic'
      ? 'Tabuleiro Automático (Dwell & Sensores)'
      : mode === 'digital'
      ? 'Tabuleiro Digital Ideomotor'
      : 'Tabuleiro Físico';
    const newEvidence: EvidenceItem = {
      id: evidenceId,
      sessionId,
      timestamp: now,
      formattedTime: new Date(now).toLocaleTimeString(),
      relativeTimeSec,
      category: 'ouija_record',
      title: `Registro Ouija (${modeLabel})`,
      details: notes,
      ouijaRecord: {
        mode,
        letters,
        operatorNote: notes,
        dwellTimeSec: durationSec,
        telemetry,
        questionContext,
      },
      verifiedStatus: 'inconclusive',
    };

    await saveEvidenceItem(newEvidence);
    setEvidenceList((prev) => [newEvidence, ...prev]);
  };

  // Log generic evidence (e.g. from BlindTest)
  const handleLogEvidence = async (
    title: string,
    details: string,
    category: EvidenceCategory
  ) => {
    const sessionId = activeSession?.id || selectedSessionId;
    const now = Date.now();
    const relativeTimeSec = activeSession
      ? Math.max(0, (now - activeSession.startTime) / 1000)
      : 0;

    const evidenceId = `ev_log_${now}`;
    const newEvidence: EvidenceItem = {
      id: evidenceId,
      sessionId,
      timestamp: now,
      formattedTime: new Date(now).toLocaleTimeString(),
      relativeTimeSec,
      category,
      title,
      details,
      verifiedStatus: 'none',
    };

    await saveEvidenceItem(newEvidence);
    setEvidenceList((prev) => [newEvidence, ...prev]);
  };

  // Jump to Evidence module and select item
  const handleNavigateToEvidence = (evidenceId: string) => {
    setHighlightedEvidenceId(evidenceId);
    setActiveTab('evidence');
  };

  // Update forensic decision classification for an evidence item
  const handleUpdateEvidenceDecision = async (
    evidenceId: string,
    status: 'interference_marked' | 'confirmed_candidate' | 'discarded'
  ) => {
    const updated = evidenceList.map((item) => {
      if (item.id === evidenceId) {
        return {
          ...item,
          decisionStatus: status,
        };
      }
      return item;
    });

    const target = updated.find((i) => i.id === evidenceId);
    if (target) {
      await saveEvidenceItem(target);
    }
    setEvidenceList(updated);
  };

  // Add independent review to an evidence item
  const handleAddIndependentReview = async (
    evidenceId: string,
    reviewerName: string,
    heardText: string
  ) => {
    const updated = evidenceList.map((item) => {
      if (item.id === evidenceId) {
        const reviews = item.independentReviews || [];
        return {
          ...item,
          independentReviews: [
            ...reviews,
            { reviewerName, heardText, timestamp: Date.now() },
          ],
        };
      }
      return item;
    });

    const target = updated.find((i) => i.id === evidenceId);
    if (target) {
      await saveEvidenceItem(target);
    }
    setEvidenceList(updated);
  };

  // Delete Session
  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    if (activeSession?.id === sessionId) setActiveSession(null);
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(updated.length > 0 ? updated[0].id : '');
    }
  };

  // Clear all data
  const handleClearAllData = async () => {
    for (const s of sessions) {
      await deleteSession(s.id);
    }
    setSessions([]);
    setActiveSession(null);
    setSelectedSessionId('');
    setEvidenceList([]);
  };

  return (
    <div className="min-h-screen bg-[#05080f] text-slate-100 flex flex-col font-sans">
      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Top Main Navigation Header */}
      <header className="border-b border-cyan-950/80 bg-[#070d18]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex justify-between items-center">
          {/* Brand & Identity */}
          <div className="flex items-center gap-3">
            {/* Custom Laboratory Signal Icon */}
            <div className="w-8 h-8 rounded bg-[#091322] border border-cyan-400/50 flex items-center justify-center p-1 shadow-[0_0_12px_rgba(0,240,255,0.25)]">
              <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
                <circle cx="50" cy="50" r="42" stroke="#00f0ff" strokeWidth="3" strokeOpacity="0.4" />
                <path d="M 15 50 Q 32 20 50 50 T 85 50" stroke="#00ffb3" strokeWidth="6" strokeLinecap="round" />
                <polygon points="50,38 60,50 50,62 40,50" fill="#00f0ff" stroke="#00f0ff" strokeWidth="2" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs sm:text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 uppercase font-mono">
                  FROC SOBRENATURAL
                </h1>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  CAÇA FANTASMA
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                Estação Forense de Cadeia de Evidência &amp; Análise Espectral
              </p>
            </div>
          </div>

          {/* Quick Status Badges, Wallet, Auth & PWA Install */}
          <div className="flex items-center gap-2">
            {activeSession && (
              <div className="hidden md:flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/50 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>SESSÃO ATIVA</span>
              </div>
            )}

            {/* Wallet Button */}
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#091528] hover:bg-[#0d1e38] border border-cyan-500/50 px-2.5 py-1 rounded text-xs font-mono text-cyan-300 cursor-pointer transition shadow"
              title="Abrir Carteira & Créditos"
            >
              <Wallet className="w-3.5 h-3.5 text-cyan-400" />
              <span>{wallet ? wallet.balance : 0}</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">CRÉDITOS</span>
            </button>

            {/* Painel do Usuário */}
            <button
              onClick={() => {
                setActiveTab('painel');
                window.history.pushState({}, '', '/painel');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition cursor-pointer ${
                activeTab === 'painel'
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500'
              }`}
              title="Abrir Painel do Investigador"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">PAINEL</span>
            </button>

            {/* Painel Admin (visível quando reconhecido ou sob acesso direto /admin) */}
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('admin');
                  window.history.pushState({}, '', '/admin');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-emerald-950 border-emerald-400 text-emerald-200 shadow'
                    : 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:border-emerald-400'
                }`}
                title="Painel de Administração do Sistema"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">ADMIN</span>
              </button>
            )}

            {/* User Account / Identity Display */}
            {user ? (
              <div className="flex items-center gap-1 bg-slate-900/90 border border-cyan-500/40 rounded px-1.5 py-0.5">
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 text-xs font-mono text-slate-200 hover:text-cyan-300 transition cursor-pointer"
                  title={`Usuário conectado: ${profile?.displayName || user.displayName || user.email}`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Sessão Ativa / Conectado" />
                  <span className="max-w-[120px] truncate text-[11px] font-semibold">
                    {profile?.displayName || user.displayName || user.email?.split('@')[0]}
                  </span>
                </button>
                <button
                  onClick={logoutUser}
                  className="p-1 text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition cursor-pointer"
                  title="Encerrar Sessão (Sair)"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-900 to-blue-900 hover:from-cyan-800 hover:to-blue-800 border border-cyan-400/60 text-cyan-200 px-3 py-1 rounded text-xs font-mono font-bold cursor-pointer transition shadow"
              >
                <User className="w-3.5 h-3.5 text-cyan-300" />
                <span>Entrar / Cadastrar</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </div>

        {/* Modular Navigation Tabs Bar */}
        <nav className="max-w-7xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar border-t border-slate-900 pt-1">
          {[
            { id: 'communication' as const, label: 'Comunicação', icon: Radio },
            { id: 'vision' as const, label: 'Visão', icon: Eye },
            { id: 'ouija' as const, label: 'Ouija', icon: Compass },
            { id: 'sensors' as const, label: 'Sensores', icon: Gauge },
            {
              id: 'evidence' as const,
              label: `Evidências (${evidenceList.length})`,
              icon: ShieldCheck,
            },
            { id: 'blindtest' as const, label: 'Teste Cego', icon: Lock },
            { id: 'settings' as const, label: 'Configurações', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-950/40 shadow-[0_2px_8px_rgba(0,240,255,0.2)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Module Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4">
        {activeTab === 'communication' && (
          <ToolSessionGate
            toolId="communication"
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          >
            <CommunicationModule
              activeSession={activeSession}
              onStartSession={handleStartSession}
              onEndSession={handleEndSession}
              isRecording={isRecordingAudio}
              onToggleRecording={handleToggleRecording}
              audioMetrics={audioMetrics}
              sensorState={sensorState}
              evidenceList={evidenceList}
              onAddQuestionEvidence={handleAddQuestionEvidence}
              onSaveLiveCaptionEvidence={handleSaveLiveCaptionEvidence}
              onGetAudioChunk={(durationMs) => audioEngineRef.current?.recordChunk(durationMs) ?? Promise.resolve(null)}
              onNavigateToEvidence={handleNavigateToEvidence}
              onUpdateEvidenceDecision={handleUpdateEvidenceDecision}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenWallet={() => setIsWalletModalOpen(true)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              hasAudioPermission={hasAudioPermission}
              onRequestMicPermission={requestMicPermission}
              hasGemini={hasGemini}
            />
          </ToolSessionGate>
        )}

        {activeTab === 'vision' && (
          <ToolSessionGate
            toolId="vision"
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          >
            <VisionModule
              activeSession={activeSession}
              onSavePhotoEvidence={handleSavePhotoEvidence}
              evidenceList={evidenceList}
            />
          </ToolSessionGate>
        )}

        {activeTab === 'ouija' && (
          <ToolSessionGate
            toolId="ouija"
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          >
            <OuijaModule
              activeSession={activeSession}
              onSaveOuijaEvidence={handleSaveOuijaEvidence}
              evidenceList={evidenceList}
              sensorState={sensorState}
              audioMetrics={audioMetrics}
              onRequestSensorPermissions={() =>
                sensorEngineRef.current?.requestMotionPermission() ?? Promise.resolve(false)
              }
              onCalibrateSensors={() =>
                sensorEngineRef.current?.calibrateSensors()
              }
            />
          </ToolSessionGate>
        )}

        {activeTab === 'sensors' && (
          <SensorsModule
            sensorState={sensorState}
            onCalibrateMagneticBaseline={() =>
              sensorEngineRef.current?.calibrateMagneticBaseline()
            }
            onRequestMotionPermission={() =>
              sensorEngineRef.current?.requestMotionPermission() ?? Promise.resolve(false)
            }
          />
        )}

        {activeTab === 'evidence' && (
          <ToolSessionGate
            toolId="evidenceAnalysis"
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          >
            <EvidenceModule
              activeSession={activeSession}
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelectSession={(id) => setSelectedSessionId(id)}
              evidenceList={evidenceList}
              highlightedEvidenceId={highlightedEvidenceId}
              onDeleteSession={handleDeleteSession}
              onAddIndependentReview={handleAddIndependentReview}
            />
          </ToolSessionGate>
        )}

        {activeTab === 'blindtest' && (
          <ToolSessionGate
            toolId="blindTest"
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          >
            <BlindTestModule
              activeSession={activeSession}
              onLogEvidence={handleLogEvidence}
            />
          </ToolSessionGate>
        )}

        {activeTab === 'settings' && (
          <SettingsModule
            hasAudioPermission={hasAudioPermission}
            onRequestMicPermission={requestMicPermission}
            hasGemini={hasGemini}
            onClearAllData={handleClearAllData}
            availableMics={availableMics}
            selectedMicId={selectedMicId}
            onSelectMic={(id) => {
              setSelectedMicId(id);
              audioEngineRef.current?.startMicrophone(id);
            }}
          />
        )}

        {activeTab === 'painel' && (
          <UserPanel
            onBackToApp={() => {
              setActiveTab('communication');
              window.history.pushState({}, '', '/');
            }}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            onBackToApp={() => {
              setActiveTab('communication');
              window.history.pushState({}, '', '/');
            }}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'privacy' && (
          <PrivacyPolicy
            onBackToApp={() => {
              setActiveTab('communication');
              window.history.pushState({}, '', '/');
            }}
          />
        )}

        {activeTab === 'terms' && (
          <TermsOfUse
            onBackToApp={() => {
              setActiveTab('communication');
              window.history.pushState({}, '', '/');
            }}
          />
        )}

        {activeTab === 'notfound' && (
          <NotFoundPage
            onBackToApp={() => {
              setActiveTab('communication');
              window.history.pushState({}, '', '/');
            }}
          />
        )}
      </main>

      {/* Footer Legal e Institucional */}
      <AppFooter
        onNavigate={(route) => {
          if (route === 'communication') {
            setActiveTab('communication');
            window.history.pushState({}, '', '/');
          } else if (route === 'painel') {
            setActiveTab('painel');
            window.history.pushState({}, '', '/painel');
          } else if (route === 'privacy') {
            setActiveTab('privacy');
            window.history.pushState({}, '', '/politica-de-privacidade');
          } else if (route === 'terms') {
            setActiveTab('terms');
            window.history.pushState({}, '', '/termos-de-uso');
          }
        }}
      />

      {/* Footer / Status bar */}
      <footer className="border-t border-slate-900 bg-[#060a13] py-2 px-4 text-center text-[10px] font-mono text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-1">
        <div>
          <span>FROC SOBRENATURAL CAÇA FANTASMA v1.0</span> — Protocolo Científico de Investigação
        </div>
        <div className="flex items-center gap-3">
          <span>Armazenamento: IndexedDB Seguro</span>
          <span>IA: {hasGemini ? 'Gemini 3.8 Flash' : 'Motor Local'}</span>
        </div>
      </footer>

      {/* Modals for Auth and Wallet */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Session, EvidenceItem, SensorState, LiveCaptionEvent, LiveCaptionStatus } from '../types';
import { AudioMetrics } from '../services/audioEngine';
import { useAuth } from '../services/AuthContext';
import { useToolSession } from '../services/ToolSessionContext';
import { LiveCaptionsEngine, ChunkRateLimiter } from '../services/liveCaptionsService';
import {
  Mic,
  MicOff,
  Send,
  Radio,
  Play,
  Square,
  AlertCircle,
  ExternalLink,
  Bot,
  HelpCircle,
  Volume2,
  Activity,
  Compass,
  FileCheck,
  CheckCircle2,
  Sparkles,
  Wallet,
  Clock,
  Info,
  Check,
  RotateCcw,
  Shield,
  Zap,
} from 'lucide-react';
import { AudioOscilloscope } from './AudioOscilloscope';

interface Props {
  activeSession: Session | null;
  onStartSession: () => void;
  onEndSession: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  audioMetrics: AudioMetrics;
  sensorState: SensorState;
  evidenceList: EvidenceItem[];
  onAddQuestionEvidence: (
    question: string,
    audioCandidateBlob?: Blob
  ) => Promise<EvidenceItem | null>;
  onSaveLiveCaptionEvidence?: (item: LiveCaptionEvent, audioBlob?: Blob) => Promise<void>;
  onGetAudioChunk?: (durationMs?: number) => Promise<{ blob: Blob; mimeType: string } | null>;
  onNavigateToEvidence: (evidenceId: string) => void;
  onUpdateEvidenceDecision?: (evidenceId: string, status: 'interference_marked' | 'confirmed_candidate' | 'discarded') => Promise<void>;
  onNavigateTab?: (tab: any) => void;
  onOpenWallet?: () => void;
  onOpenAuth?: () => void;
  hasAudioPermission: boolean;
  onRequestMicPermission: () => Promise<void>;
  hasGemini: boolean;
}

export const CommunicationModule: React.FC<Props> = ({
  activeSession,
  onStartSession,
  onEndSession,
  isRecording,
  onToggleRecording,
  audioMetrics,
  sensorState,
  evidenceList,
  onAddQuestionEvidence,
  onSaveLiveCaptionEvidence,
  onGetAudioChunk,
  onNavigateToEvidence,
  onUpdateEvidenceDecision,
  onNavigateTab,
  onOpenWallet,
  onOpenAuth,
  hasAudioPermission,
  onRequestMicPermission,
  hasGemini,
}) => {
  const { user, wallet, getIdToken, refreshWallet } = useAuth();
  const { getActiveSessionId, isSessionActive, remainingSeconds } = useToolSession();
  const activeToolSessionId = getActiveSessionId('communication');
  const isToolSessionActive = isSessionActive('communication');
  const remainingSec = remainingSeconds['communication'] || 0;

  const [questionText, setQuestionText] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechRecognitionInstance, setSpeechRecognitionInstance] = useState<any>(null);

  // Live Captions & VAD State
  const [liveCaptionEvents, setLiveCaptionEvents] = useState<LiveCaptionEvent[]>([]);
  const [liveCaptionStatus, setLiveCaptionStatus] = useState<LiveCaptionStatus>('listening');
  const [isLiveCaptionsActive, setIsLiveCaptionsActive] = useState(true);
  const [isTransmittingChunk, setIsTransmittingChunk] = useState(false);
  const [savedCaptionIds, setSavedCaptionIds] = useState<Record<string, boolean>>({});
  const rateLimiterRef = useRef<ChunkRateLimiter>({
    lastCallTimestamp: 0,
    timestampsInWindow: [],
    lastChunkDbfs: -100,
    lastPeakHz: 0,
  });

  // Painel Imediato da IA (Análise de Pergunta)
  const [latestDirectAnalysis, setLatestDirectAnalysis] = useState<{
    id: string;
    question: string;
    candidateTranscription?: string | null;
    hasAudio?: boolean;
    confidence: number;
    conclusion: string;
    alternativeHypotheses: string[];
    metrics?: any;
    model: string;
    possibleName?: any;
    timestamp: string;
  } | null>(null);

  // Collapsible Instruments Strip state
  const [instrumentsExpanded, setInstrumentsExpanded] = useState(true);
  const [audioSilentMode, setAudioSilentMode] = useState(false);
  const [showPreparationModal, setShowPreparationModal] = useState(false);

  // Investigation assistant multi-turn chat tab or drawer
  const [showAssistantModal, setShowAssistantModal] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<
    { role: 'user' | 'assistant'; content: string; provider?: string }[]
  >([
    {
      role: 'assistant',
      content:
        'Estação de análise pronta. Posso esclarecer dúvidas metodológicas sobre a cadeia de evidências, calibração espectral, hipótese nula ou avaliar hipóteses alternativas físicas para eventos registrados.',
    },
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Speech Recognition initialization
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      setSpeechSupported(true);
      const recog = new SpeechRecognitionClass();
      recog.lang = 'pt-BR';
      recog.continuous = false;
      recog.interimResults = false;

      recog.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setQuestionText((prev) => (prev ? `${prev} ${text}` : text));
        setIsListeningSpeech(false);
      };

      recog.onerror = () => {
        setIsListeningSpeech(false);
      };

      recog.onend = () => {
        setIsListeningSpeech(false);
      };

      setSpeechRecognitionInstance(recog);
    }
  }, []);

  // Monitoramento contínuo de fala (VAD + Envio Seletivo para IA)
  useEffect(() => {
    if (!hasAudioPermission || !isLiveCaptionsActive) {
      setLiveCaptionStatus('paused');
      return;
    }

    let isDisposed = false;
    const vadInterval = setInterval(async () => {
      if (isDisposed || isTransmittingChunk) return;

      const vadResult = LiveCaptionsEngine.evaluateVad(audioMetrics);

      if (!vadResult.isVoiceCandidate) {
        setLiveCaptionStatus('no_speech');
        return;
      }

      setLiveCaptionStatus('possible_speech');

      // Verificar se atende ao limite de requisições e cooldown
      const check = LiveCaptionsEngine.canDispatchToAi(rateLimiterRef.current, audioMetrics);
      if (!check.allowed) {
        return;
      }

      // Se temos motor de chunks, IA disponível e sessão ativa de comunicação
      if (onGetAudioChunk && hasGemini && isToolSessionActive) {
        try {
          setIsTransmittingChunk(true);
          setLiveCaptionStatus('analyzing');

          const chunk = await onGetAudioChunk(3600);
          if (isDisposed) return;

          if (chunk && chunk.blob.size > 2000) {
            LiveCaptionsEngine.recordAiCall(rateLimiterRef.current, audioMetrics);
            const token = await getIdToken();
            const secureSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
            const persistentReqId = `chunk_${activeToolSessionId || 'comm'}_${Date.now()}_${secureSuffix}`;
            const base64Audio = await new Promise<string>((res) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const b64 = (reader.result as string)?.split(',')[1] || '';
                res(b64);
              };
              reader.readAsDataURL(chunk.blob);
            });

            const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
            if (activeToolSessionId) reqHeaders['x-tool-session-id'] = activeToolSessionId;
            reqHeaders['x-request-id'] = persistentReqId;

            const resp = await fetch('/api/analyze', {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify({
                question: 'Monitoramento contínuo: análise de fonemas vocais detectados por VAD',
                audioBase64: base64Audio,
                mimeType: chunk.mimeType,
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
              const data = await resp.json();
              const now = Date.now();
              const elapsedSec = activeSession ? Math.max(0, Math.floor((now - activeSession.startTime) / 1000)) : 0;
              const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
              const secs = String(elapsedSec % 60).padStart(2, '0');
              const timeFormatted = `${mins}:${secs}`;

              let displayText = '';
              let candidate = data.candidateTranscription || null;
              const conf = typeof data.confidence === 'number' ? data.confidence : 0;

              if (candidate && conf >= 0.40) {
                displayText = `possível fala: "${candidate}" — confiança ${Math.round(conf * 100)}%`;
              } else if (data.voiceDetected || conf >= 0.25) {
                displayText = 'Trecho vocal detectado, mas sem inteligibilidade suficiente.';
                candidate = null;
              } else {
                displayText = 'Nenhuma fala inteligível identificada no trecho.';
                candidate = null;
              }

              const evtSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
              const newEvt: LiveCaptionEvent = {
                id: `evt_${now}_${evtSuffix}`,
                timestampFormatted: timeFormatted,
                timestampMs: now,
                status: candidate ? 'possible_speech' : 'no_speech',
                text: displayText,
                candidateTranscription: candidate,
                confidence: conf,
                dbfs: audioMetrics.dbfs,
                peakFrequencyHz: audioMetrics.peakFrequencyHz,
                provider: data.provider || 'Gemini 3.8 Flash',
                executionTimeMs: data.executionTimeMs,
                toolSessionId: activeToolSessionId,
                isRelevant: !!candidate || conf >= 0.25 || audioMetrics.isVoiceBand,
                audioBlob: chunk.blob,
                alternativeHypotheses: data.alternativeHypotheses,
              };

              setLiveCaptionEvents((prev) => [newEvt, ...prev.slice(0, 49)]);
            }
          }
        } catch (chunkErr) {
          console.warn('[LiveCaptions] Falha no processamento de chunk:', chunkErr);
          setLiveCaptionStatus('error');
        } finally {
          setIsTransmittingChunk(false);
          setLiveCaptionStatus('listening');
        }
      }
    }, 3200);

    return () => {
      isDisposed = true;
      clearInterval(vadInterval);
    };
  }, [hasAudioPermission, isLiveCaptionsActive, hasGemini, isToolSessionActive, activeToolSessionId, audioMetrics, activeSession, sensorState, onGetAudioChunk, getIdToken]);

  const toggleSpeechRecognition = () => {
    if (!speechRecognitionInstance) return;
    if (isListeningSpeech) {
      speechRecognitionInstance.stop();
      setIsListeningSpeech(false);
    } else {
      try {
        speechRecognitionInstance.start();
        setIsListeningSpeech(true);
      } catch (err) {
        console.warn('SpeechRecognition erro:', err);
      }
    }
  };

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || isProcessing) return;

    const q = questionText.trim();
    setQuestionText('');
    setQuestionError('');
    setIsProcessing(true);

    try {
      let audioBlob: Blob | undefined;
      if (onGetAudioChunk && hasAudioPermission) {
        try {
          const chunk = await onGetAudioChunk(3500);
          if (chunk?.blob && chunk.blob.size > 0) {
            audioBlob = chunk.blob;
          }
        } catch (audioErr) {
          console.warn('Não foi possível obter áudio para a pergunta:', audioErr);
        }
      }

      const result = await onAddQuestionEvidence(q, audioBlob);
      if (!result) {
        setQuestionText(q);
        setQuestionError('Consulta não concluída. Verifique a conexão, o saldo ou a disponibilidade da IA; sua pergunta foi mantida.');
      } else {
        setLatestDirectAnalysis({
          id: result.id,
          question: q,
          candidateTranscription: result.candidateTranscription,
          hasAudio: result.hasAudio,
          confidence: result.confidenceScore || 0,
          conclusion: result.details || result.aiAnalysis?.conclusion || 'Análise pericial concluída.',
          alternativeHypotheses: result.aiAnalysis?.alternativeHypotheses || ['Variação acústica natural', 'Ruído de fundo'],
          metrics: result.signalData,
          model: result.aiAnalysis?.provider || 'Motor Forense',
          possibleName: result.possibleName,
          timestamp: result.formattedTime,
        });
      }
    } catch {
      setQuestionText(q);
      setQuestionError('Falha ao enviar consulta. Sua pergunta foi mantida.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveCaptionItem = async (evt: LiveCaptionEvent) => {
    if (!onSaveLiveCaptionEvidence) return;
    try {
      await onSaveLiveCaptionEvidence(evt, evt.audioBlob);
      setSavedCaptionIds((prev) => ({ ...prev, [evt.id]: true }));
    } catch (err) {
      console.error('Falha ao salvar evidência de legenda:', err);
    }
  };

  // Assistant query
  const handleSendAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantInput.trim() || isAssistantThinking) return;

    if (!user) {
      if (onOpenAuth) {
        onOpenAuth();
      } else if (onOpenWallet) {
        onOpenWallet();
      }
      return;
    }

    const userMsg = assistantInput.trim();
    setAssistantInput('');
    const newMessages = [...assistantMessages, { role: 'user' as const, content: userMsg }];
    setAssistantMessages(newMessages);
    setIsAssistantThinking(true);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (activeToolSessionId) {
        headers['x-tool-session-id'] = activeToolSessionId;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: newMessages,
          sessionContext: {
            sessionTitle: activeSession?.title,
            sessionDurationSec: activeSession
              ? Math.floor((Date.now() - activeSession.startTime) / 1000)
              : 0,
            evidenceCount: evidenceList.length,
            recentTelemetry: {
              audioDbfs: audioMetrics.dbfs,
              peakHz: audioMetrics.peakFrequencyHz,
              magnetometer: sensorState.magnetometer,
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || 'Falha ao consultar o assistente de IA.',
          },
        ]);
        return;
      }

      setAssistantMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || 'Sem resposta técnica disponível.',
          provider: data.provider,
        },
      ]);

      // Se consumiu créditos pagos, atualizar a carteira
      await refreshWallet();
    } catch {
      setAssistantMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Erro de comunicação com o assistente do servidor.',
        },
      ]);
    } finally {
      setIsAssistantThinking(false);
    }
  };

  // Format session duration
  const getDurationString = () => {
    if (!activeSession) return '00:00:00';
    const totalSec = Math.floor((Date.now() - activeSession.startTime) / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Compacto de Sessão & Controles */}
      <div className="bg-[#0b121e] border border-cyan-950/90 rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]" />
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                FROC SOBRENATURAL — SESSÃO DE COMUNICAÇÃO
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Protocolo de Cadeia de Evidência e Análise Espectral Rigorosa
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {activeSession ? (
              <div className="flex items-center gap-2">
                <div className="bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded text-xs font-mono text-cyan-300">
                  <span className="text-slate-500 mr-1.5">TEMPO:</span>
                  <span className="font-semibold">{getDurationString()}</span>
                </div>

                <button
                  onClick={onToggleRecording}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold font-mono transition cursor-pointer ${
                    isRecording
                      ? 'bg-rose-950/80 border border-rose-500 text-rose-300 animate-pulse'
                      : 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/60'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-rose-400" />
                      <span>PARAR ÁUDIO</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-emerald-400" />
                      <span>GRAVAR ÁUDIO</span>
                    </>
                  )}
                </button>

                <button
                  onClick={onEndSession}
                  className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-slate-300 transition cursor-pointer"
                >
                  ENCERRAR SESSÃO
                </button>
              </div>
            ) : (
              <button
                onClick={onStartSession}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/80 text-cyan-200 text-xs font-mono font-bold tracking-wider transition cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.2)]"
              >
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>INICIAR NOVA SESSÃO</span>
              </button>
            )}
          </div>
        </div>

        {/* Status flags */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasAudioPermission ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
              />
              <span>Mic: {hasAudioPermission ? 'Conectado' : 'Sem Permissão'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasGemini ? 'bg-cyan-400' : 'bg-slate-500'
                }`}
              />
              <span>IA: {hasGemini ? 'Gemini 3.8 Flash Ativo' : 'Motor Local (Offline)'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sensorState.magnetometer.available ? 'bg-purple-400' : 'bg-slate-600'
                }`}
              />
              <span>Mag: {sensorState.magnetometer.available ? `${sensorState.magnetometer.magnitude} µT` : 'Indisponível'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreparationModal(true)}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[11px] underline cursor-pointer"
            >
              <span>Diagnóstico Rápido</span>
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => setShowAssistantModal(!showAssistantModal)}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] underline cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Consultoria Metodológica</span>
            </button>
          </div>
        </div>
      </div>

      {/* Faixa de Instrumentos Recolhível (Áudio, Campo Magnético, Movimento, Câmera, Ouija, Rádio) */}
      <div className="bg-[#080d16] border border-cyan-950/80 rounded-lg p-2.5">
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-slate-300 uppercase tracking-wide">
              FAIXA UNIFICADA DE INSTRUMENTOS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioSilentMode(!audioSilentMode)}
              className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition ${
                audioSilentMode
                  ? 'bg-amber-950 text-amber-300 border border-amber-600/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {audioSilentMode ? 'Modo Silencioso Ativo (Sem chiado)' : 'Modo Silencioso: Off'}
            </button>
            <button
              onClick={() => setInstrumentsExpanded(!instrumentsExpanded)}
              className="text-cyan-400 hover:text-cyan-300 text-[11px] underline cursor-pointer"
            >
              {instrumentsExpanded ? 'Recolher' : 'Expandir'}
            </button>
          </div>
        </div>

        {instrumentsExpanded && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
            {/* 1. Áudio */}
            <div className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">1. Nível dBFS</span>
              <strong className="text-emerald-400 block text-sm">{audioMetrics.dbfs.toFixed(1)}</strong>
              <span className="text-[9px] text-slate-400">Pico: {audioMetrics.peakFrequencyHz} Hz</span>
            </div>

            {/* 2. Campo Magnético */}
            <div
              onClick={() => onNavigateTab && onNavigateTab('sensors')}
              className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1 cursor-pointer hover:border-cyan-800"
            >
              <span className="text-[10px] text-slate-500 uppercase block">2. Magnetômetro</span>
              <strong className="text-purple-300 block text-sm">
                {sensorState.magnetometer.available ? `${sensorState.magnetometer.magnitude} µT` : 'N/D'}
              </strong>
              <span className="text-[9px] text-slate-400">
                Δ: {sensorState.magnetometer.available ? `±${sensorState.magnetometer.delta} µT` : 'Sem sensor'}
              </span>
            </div>

            {/* 3. Movimento Celular */}
            <div
              onClick={() => onNavigateTab && onNavigateTab('sensors')}
              className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1 cursor-pointer hover:border-cyan-800"
            >
              <span className="text-[10px] text-slate-500 uppercase block">3. Movimento</span>
              <strong className="text-amber-300 block text-sm">
                {sensorState.motion.available ? `${sensorState.motion.magnitude} m/s²` : 'N/D'}
              </strong>
              <span className="text-[9px] text-slate-400">
                {sensorState.motion.magnitude > 2 ? 'Em tremor' : 'Estável'}
              </span>
            </div>

            {/* 4. Câmera / Óptica */}
            <div
              onClick={() => onNavigateTab && onNavigateTab('vision')}
              className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1 cursor-pointer hover:border-cyan-800"
            >
              <span className="text-[10px] text-slate-500 uppercase block">4. Visão Óptica</span>
              <strong className="text-cyan-300 block text-xs">Acessível</strong>
              <span className="text-[9px] text-slate-400">Sem raio X / térmica</span>
            </div>

            {/* 5. Ouija */}
            <div
              onClick={() => onNavigateTab && onNavigateTab('ouija')}
              className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1 cursor-pointer hover:border-cyan-800"
            >
              <span className="text-[10px] text-slate-500 uppercase block">5. Tabuleiro Ouija</span>
              <strong className="text-cyan-300 block text-xs">Físico &amp; Digital</strong>
              <span className="text-[9px] text-slate-400">Registro humano</span>
            </div>

            {/* 6. Rádio AM/FM & Acessórios */}
            <div className="bg-[#0b121e] p-2 rounded border border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">6. Rádio AM/FM</span>
              <strong className="text-slate-400 block text-xs">Sem Receptor</strong>
              <span className="text-[9px] text-slate-500">Acessório externo off</span>
            </div>
          </div>
        )}
      </div>

      {/* Permission alert if mic denied */}
      {!hasAudioPermission && (
        <div className="bg-rose-950/60 border border-rose-500/60 rounded-lg p-3 text-xs text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Microfone Desconectado ou Permissão Pendente</p>
            <p className="text-slate-300 text-[11px] mt-0.5">
              Para analisar espectro sonoro, nível dBFS e registrar áudio para cadeia de evidência, o navegador precisa de acesso ao microfone.
            </p>
          </div>
          <button
            onClick={onRequestMicPermission}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs rounded transition cursor-pointer shrink-0"
          >
            Autorizar Mic
          </button>
        </div>
      )}

      {/* 2. Osciloscópio & Espectrograma em Tempo Real */}
      <AudioOscilloscope metrics={audioMetrics} isRecording={isRecording} />

      {/* 2.5 Painel de Legenda em Tempo Real (VAD + IA) */}
      <div className="bg-[#080d16] border border-cyan-950/90 rounded-lg p-3 sm:p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#00f0ff]" />
            <h3 className="text-xs sm:text-sm font-bold text-white font-mono uppercase tracking-wider">
              MONITORAMENTO DE VOZ EM TEMPO REAL (VAD + IA)
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Badges */}
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              {liveCaptionStatus === 'listening' && (
                <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  OUVINDO
                </span>
              )}
              {liveCaptionStatus === 'analyzing' && (
                <span className="flex items-center gap-1.5 text-cyan-300 bg-cyan-950/80 border border-cyan-500/50 px-2 py-0.5 rounded animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  ANALISANDO
                </span>
              )}
              {liveCaptionStatus === 'no_speech' && (
                <span className="flex items-center gap-1.5 text-slate-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  SEM FALA
                </span>
              )}
              {liveCaptionStatus === 'possible_speech' && (
                <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/80 border border-amber-500/50 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                  POSSÍVEL FALA
                </span>
              )}
              {liveCaptionStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-rose-300 bg-rose-950/80 border border-rose-500/50 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  ERRO
                </span>
              )}
              {liveCaptionStatus === 'paused' && (
                <span className="flex items-center gap-1.5 text-slate-500 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                  PAUSADO
                </span>
              )}
            </div>

            <button
              onClick={() => setIsLiveCaptionsActive(!isLiveCaptionsActive)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition cursor-pointer ${
                isLiveCaptionsActive
                  ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isLiveCaptionsActive ? 'Pausar Legenda' : 'Ativar Legenda'}
            </button>
          </div>
        </div>

        {/* Privacy Banner */}
        {isTransmittingChunk && (
          <div className="p-2 rounded bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-between text-xs font-mono text-cyan-200 animate-pulse">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>[AVISO DE PRIVACIDADE]</strong> Trecho de áudio selecionado sendo enviado para análise forense neural (Gemini)...
              </span>
            </div>
            <span className="text-[10px] text-cyan-400 uppercase hidden sm:inline">Tráfego Protegido via TLS 1.3</span>
          </div>
        )}

        {/* Captions feed */}
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
          {liveCaptionEvents.length === 0 ? (
            <div className="text-center py-5 text-slate-500 font-mono text-xs border border-dashed border-slate-800/80 rounded">
              <p>Nenhuma ocorrência vocal capturada até o momento.</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                O motor local (VAD) analisa energia vocal (250Hz–3.4kHz) e silêncio antes de acionar a IA.
              </p>
            </div>
          ) : (
            liveCaptionEvents.map((evt) => (
              <div
                key={evt.id}
                className="bg-[#0b121e] border border-slate-800/80 hover:border-cyan-900/60 rounded p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono transition"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-cyan-400 font-bold">{evt.timestampFormatted}</span>
                    <span className="text-slate-600">—</span>
                    <span className={evt.candidateTranscription ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>
                      {evt.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
                    <span>dBFS: <strong className="text-slate-300">{evt.dbfs.toFixed(1)}</strong></span>
                    <span>Pico: <strong className="text-slate-300">{evt.peakFrequencyHz} Hz</strong></span>
                    {evt.confidence > 0 && (
                      <span>Confiança: <strong className="text-cyan-400">{Math.round(evt.confidence * 100)}%</strong></span>
                    )}
                    <span>Provedor: <strong className="text-slate-400">{evt.provider}</strong></span>
                  </div>
                </div>

                {evt.isRelevant && (
                  <button
                    onClick={() => handleSaveCaptionItem(evt)}
                    disabled={savedCaptionIds[evt.id]}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition shrink-0 ${
                      savedCaptionIds[evt.id]
                        ? 'bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 cursor-default'
                        : 'bg-cyan-600/30 hover:bg-cyan-600/60 border border-cyan-500/60 text-cyan-200'
                    }`}
                  >
                    {savedCaptionIds[evt.id] ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>SALVO NA CADEIA</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-3 h-3 text-cyan-400" />
                        <span>SALVAR COMO EVIDÊNCIA</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Área de Entrada de Pergunta do Investigador */}
      <div className="bg-[#090f1a] border border-cyan-950/80 rounded-lg p-3 sm:p-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-mono font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FORMULAR PERGUNTA AO AMBIENTE</span>
          </label>
          <span className="text-[10px] font-mono text-slate-500">
            Cada pergunta gera marcador temporal exato no áudio
          </span>
        </div>

        {/* Informações de Custo e Saldo de Créditos em tempo real */}
        <div className="mb-2 flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-2">
            {isToolSessionActive ? (
              <span className="text-emerald-300 font-bold bg-emerald-950/80 border border-emerald-500/60 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Sessão Paga Ativa: Consultas incluídas (restam {remainingSec}s)
              </span>
            ) : (
              <span className="text-amber-400 font-bold bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 rounded">
                Custo: 5 créditos por consulta (ou inicie sessão de 4 min)
              </span>
            )}
            <span className="text-slate-400 hidden sm:inline">
              (Análise espectral + motor de IA)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <button
                type="button"
                onClick={onOpenWallet}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 hover:text-white cursor-pointer transition"
              >
                <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                <span>Saldo: <strong>{wallet ? wallet.balance : 0}</strong> créditos</span>
                {!isToolSessionActive && wallet && wallet.balance < 5 && (
                  <span className="text-[10px] text-rose-400 font-bold ml-1">(Insuficiente)</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenWallet}
                className="text-cyan-400 hover:underline text-[11px] cursor-pointer"
              >
                Conecte-se para usar créditos
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSendQuestion} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Digite a pergunta do investigador (ex: 'Há alguém presente nesta sala?')..."
              disabled={isProcessing}
              className="w-full bg-[#050912] border border-slate-700/80 rounded px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans disabled:opacity-50"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                title={isListeningSpeech ? 'Parar reconhecimento de voz' : 'Falar pergunta via microfone'}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition cursor-pointer ${
                  isListeningSpeech
                    ? 'text-rose-400 bg-rose-950/80 animate-pulse'
                    : 'text-slate-400 hover:text-cyan-300'
                }`}
              >
                {isListeningSpeech ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!questionText.trim() || isProcessing || (!isToolSessionActive && !!user && !!wallet && wallet.balance < 5)}
            className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-mono text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
          >
            {isProcessing ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">REGISTRAR</span>
              </>
            )}
          </button>
        </form>

        {questionError && <p role="alert" className="mt-2 text-xs text-rose-300">{questionError}</p>}

        {!isToolSessionActive && user && wallet && wallet.balance < 5 && (
          <div className="mt-2 p-2 rounded bg-rose-950/60 border border-rose-600/50 flex justify-between items-center text-[11px] font-mono text-rose-200">
            <span>Saldo insuficiente (5 créditos necessários para consulta avulsa, ou inicie uma sessão de 4 minutos).</span>
            <button
              type="button"
              onClick={onOpenWallet}
              className="px-2 py-0.5 bg-rose-800 hover:bg-rose-700 text-white rounded text-[10px] cursor-pointer"
            >
              Recarregar Carteira
            </button>
          </div>
        )}

        {isListeningSpeech && (
          <p className="text-[11px] text-rose-300 font-mono mt-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>Ouvindo voz do investigador via SpeechRecognition... Fale claramente.</span>
          </p>
        )}

        {/* Sugestões de Perguntas de Controle e Investigação */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-slate-500 uppercase">Sugestões de Controle:</span>
          {[
            'Qual espírito se apresenta?',
            'Pode dizer uma palavra entre: água, fogo ou terra?',
            'Há alguém presente neste cômodo?',
            'Pode repetir o que acabou de emitir?',
          ].map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setQuestionText(prompt)}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-800 transition cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* 3.5 Painel Imediato da IA (Resultado da Pergunta Formulada) */}
      {latestDirectAnalysis && (
        <div className="bg-[#07111e] border-2 border-cyan-500/80 rounded-lg p-3 sm:p-4 shadow-[0_0_20px_rgba(0,240,255,0.15)] space-y-3 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-cyan-900/60 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs sm:text-sm font-bold text-cyan-300 uppercase tracking-wider">
                ANÁLISE DA IA — RESULTADO IMEDIATO
              </h4>
            </div>
            <span className="text-[10px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/40">
              Registrado na Cadeia de Evidência #{latestDirectAnalysis.id}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1 bg-[#050b14] p-2.5 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Pergunta Formulada:</span>
              <p className="text-slate-100 font-semibold font-sans">"{latestDirectAnalysis.question}"</p>
            </div>

            <div className="space-y-1 bg-[#050b14] p-2.5 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Possível Transcrição:</span>
              <p className={`font-semibold ${latestDirectAnalysis.candidateTranscription ? 'text-emerald-400 font-mono text-sm' : 'text-slate-400'}`}>
                {!latestDirectAnalysis.hasAudio
                  ? 'Consulta registrada sem amostra de áudio anexada.'
                  : latestDirectAnalysis.candidateTranscription
                  ? `"${latestDirectAnalysis.candidateTranscription}"`
                  : 'Nenhum padrão vocal detectado no áudio analisado (silêncio ou ruído ambiente).'}
              </p>
            </div>
          </div>

          <div className="bg-[#050b14] p-3 rounded border border-slate-800 space-y-1 text-xs">
            <span className="text-[10px] text-slate-500 uppercase block">Conclusão Metodológica:</span>
            <p className="text-slate-200 font-sans leading-relaxed">{latestDirectAnalysis.conclusion}</p>
          </div>

          {latestDirectAnalysis.alternativeHypotheses && latestDirectAnalysis.alternativeHypotheses.length > 0 && (
            <div className="bg-[#050b14] p-2.5 rounded border border-slate-800 space-y-1 text-xs">
              <span className="text-[10px] text-slate-500 uppercase block">Hipóteses Alternativas Físicas:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[11px] font-sans">
                {latestDirectAnalysis.alternativeHypotheses.map((hypo: string, idx: number) => (
                  <li key={idx}>{hypo}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
              <span className="text-[9px] text-slate-500 block uppercase">Confiança:</span>
              <strong className="text-cyan-300">{Math.round(latestDirectAnalysis.confidence * 100)}%</strong>
            </div>

            <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
              <span className="text-[9px] text-slate-500 block uppercase">Modelo Utilizado:</span>
              <strong className="text-slate-300 truncate block">{latestDirectAnalysis.model}</strong>
            </div>

            <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
              <span className="text-[9px] text-slate-500 block uppercase">Horário:</span>
              <strong className="text-slate-300">{latestDirectAnalysis.timestamp}</strong>
            </div>

            <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
              <span className="text-[9px] text-slate-500 block uppercase">Status da Sessão:</span>
              <strong className={isToolSessionActive ? 'text-emerald-400' : 'text-amber-400'}>
                {isToolSessionActive ? `Ativa (${remainingSec}s)` : 'Consulta Avulsa'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 4. Chat de Perguntas & Respostas com Categorias Estritas */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-mono font-bold text-slate-300 tracking-wider flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>FLUXO DE COMUNICAÇÃO &amp; SINAIS MEDIDOS ({evidenceList.length})</span>
          </h3>
          <span className="text-[10px] font-mono text-slate-500">
            Cadeia de Evidência Auditável
          </span>
        </div>

        {evidenceList.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800/80 rounded-lg text-slate-500 text-xs font-mono space-y-2">
            <Radio className="w-8 h-8 text-slate-600 mx-auto opacity-60" />
            <p className="font-semibold text-slate-400">Nenhum registro na sessão atual.</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Inicie a gravação e formule perguntas. Cada ocorrência registrará o nível em dBFS, harmônicos, hipóteses alternativas e transcrição candidata caso haja fala verificável.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
            {evidenceList.map((item) => (
              <div
                key={item.id}
                className="bg-[#0b121e] border border-slate-800/90 rounded-lg p-3 space-y-2.5 hover:border-cyan-900/60 transition"
              >
                {/* Cabeçalho do Cartão com Timestamp e Marcador relativo */}
                <div className="flex justify-between items-center text-[11px] font-mono border-b border-slate-800/60 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-semibold">{item.formattedTime}</span>
                    <span className="text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded text-[10px]">
                      Offset: {Math.floor(item.relativeTimeSec / 60)}:
                      {String(Math.floor(item.relativeTimeSec % 60)).padStart(2, '0')}s
                    </span>
                  </div>

                  <button
                    onClick={() => onNavigateToEvidence(item.id)}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-200 underline font-mono cursor-pointer"
                  >
                    <span>Ver evidência</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Categorias Explícitas — Nunca Misturadas */}

                {/* Categoria 1: Pergunta do Usuário */}
                {item.questionText && (
                  <div className="bg-blue-950/30 border-l-2 border-blue-400 px-2.5 py-1.5 rounded-r">
                    <span className="text-[10px] font-mono font-bold text-blue-300 uppercase tracking-wider block">
                      [1] PERGUNTA DO INVESTIGADOR
                    </span>
                    <p className="text-xs text-slate-200 font-medium mt-0.5">
                      "{item.questionText}"
                    </p>
                  </div>
                )}

                {/* Categoria 2: Sinal Medido */}
                {item.signalData && (
                  <div className="bg-emerald-950/20 border-l-2 border-emerald-400 px-2.5 py-1.5 rounded-r">
                    <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wider block">
                      [2] SINAL MEDIDO NO INSTANTE
                    </span>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-300 mt-1">
                      <span>
                        Nível: <strong className="text-emerald-400">{item.signalData.dbfs.toFixed(1)} dBFS</strong>
                      </span>
                      <span>
                        Pico: <strong className="text-cyan-400">{item.signalData.peakFrequencyHz} Hz</strong>
                      </span>
                      {item.signalData.magneticMagnitudeUtd !== undefined && (
                        <span>
                          Magnetômetro: <strong className="text-purple-300">{item.signalData.magneticMagnitudeUtd} µT</strong>
                        </span>
                      )}
                      {item.signalData.motionMagnitude !== undefined && (
                        <span>
                          Movimento celular: <strong className="text-amber-300">{item.signalData.motionMagnitude} m/s²</strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Categoria 3: Transcrição Candidata */}
                <div className="bg-slate-900/60 border-l-2 border-slate-400 px-2.5 py-1.5 rounded-r">
                  <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider block">
                    [3] TRANSCRIÇÃO CANDIDATA
                  </span>
                  {item.possibleName ? (
                    <div className="mt-1 space-y-1">
                      <div className="p-2 rounded bg-cyan-950/70 border border-cyan-500/60 text-xs font-mono space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-cyan-900 text-cyan-200 text-[10px] font-bold rounded">
                            CANDIDATO
                          </span>
                          <strong className="text-cyan-300 text-sm">
                            Possível nome: "{item.possibleName.name}"
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>Fonte: <strong>Áudio original</strong></span>
                          <span>Trecho: <strong>{item.possibleName.segmentTime}</strong></span>
                          <span className="text-amber-300">Status: <strong>Ainda não verificado</strong></span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 italic">
                        * O nome declarado no sinal jamais equivale à identidade comprovada de uma entidade.
                      </p>
                    </div>
                  ) : item.candidateTranscription && item.hasAudio ? (
                    <div className="mt-1">
                      <p className="text-xs font-mono font-bold text-cyan-300">
                        "{item.candidateTranscription}"
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                        Confiança fonética calibrada: {Math.round((item.confidenceScore || 0) * 100)}%
                      </p>
                    </div>
                  ) : !item.hasAudio ? (
                    <p className="text-xs font-mono text-slate-400 italic mt-0.5">
                      Consulta registrada sem amostra de áudio anexada. Pergunta formulada exclusivamente em texto.
                    </p>
                  ) : (
                    <p className="text-xs font-mono text-slate-400 italic mt-0.5">
                      Nenhuma resposta identificada no áudio (silêncio medido ou ruído ambiente sem estrutura de fala humana).
                    </p>
                  )}
                </div>

                {/* Categoria 4: Análise da IA */}
                {item.aiAnalysis && (
                  <div className="bg-cyan-950/20 border-l-2 border-cyan-400 px-2.5 py-1.5 rounded-r space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider">
                        [4] ANÁLISE DE SINAIS &amp; HIPÓTESES ALTERNATIVAS
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">{item.aiAnalysis.provider}</span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {item.aiAnalysis.conclusion}
                    </p>

                    {item.aiAnalysis.alternativeHypotheses &&
                      item.aiAnalysis.alternativeHypotheses.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                          <span className="text-amber-400/90 text-[10px] font-bold uppercase block">
                            Hipóteses Físicas Alternativas:
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-slate-300">
                            {item.aiAnalysis.alternativeHypotheses.map((hyp, i) => (
                              <li key={i}>{hyp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}

                {/* Categoria 5: Informação Verificada & Triagem Forense */}
                <div className="bg-slate-900/40 border-l-2 border-purple-400 px-2.5 py-1.5 rounded-r space-y-2 text-[11px] font-mono">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
                        [5] INFORMAÇÃO VERIFICADA
                      </span>
                      <span className="text-slate-400">
                        {item.decisionStatus === 'interference_marked' && 'Marcado pelo investigador como Interferência/Ruído'}
                        {item.decisionStatus === 'confirmed_candidate' && 'Aceito pelo investigador como Candidato Válido'}
                        {item.decisionStatus === 'discarded' && 'Descartado da análise'}
                        {(!item.decisionStatus || item.decisionStatus === 'pending') && (
                          item.verifiedStatus === 'refuted_noise'
                            ? 'Classificado como Ruído/Artefato'
                            : item.verifiedStatus === 'verified_speech'
                            ? 'Confirmado como fala acústica genuína'
                            : 'Aguardando verificação ou repetição'
                        )}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      {item.hasAudio && (
                        <span className="flex items-center gap-1 text-[10px] text-cyan-300 bg-slate-800 px-1.5 py-0.5 rounded">
                          <Volume2 className="w-3 h-3 text-cyan-400" />
                          <span>Áudio salvo</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações de Triagem Forense: Marcar Interferência / Confirmar Candidato / Descartar */}
                  <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] text-slate-500 uppercase">Classificação do Investigador:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateEvidenceDecision && onUpdateEvidenceDecision(item.id, 'interference_marked')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                          item.decisionStatus === 'interference_marked'
                            ? 'bg-amber-950 text-amber-300 border border-amber-500'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Marcar Interferência
                      </button>
                      <button
                        onClick={() => onUpdateEvidenceDecision && onUpdateEvidenceDecision(item.id, 'confirmed_candidate')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                          item.decisionStatus === 'confirmed_candidate'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Confirmar Candidato
                      </button>
                      <button
                        onClick={() => onUpdateEvidenceDecision && onUpdateEvidenceDecision(item.id, 'discarded')}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                          item.decisionStatus === 'discarded'
                            ? 'bg-rose-950 text-rose-300 border border-rose-500'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* 5. Painel / Modal de Consultoria Metodológica com Gemini */}
      {showAssistantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-[#090f1a] border border-cyan-500/60 rounded-xl shadow-2xl flex flex-col h-[600px] overflow-hidden text-slate-100">
            {/* Header */}
            <div className="p-3.5 bg-[#0b1322] border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white font-mono">
                    ASSISTENTE DE ANÁLISE FORENSE &amp; SINAIS
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {hasGemini ? 'Gemini 3.8 Flash (Raciocínio Metodológico)' : 'Modo Offline Local'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAssistantModal(false)}
                className="text-slate-400 hover:text-white px-2 py-1 font-mono text-sm"
              >
                ✕
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs">
              {assistantMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <span className="text-[9px] font-mono text-slate-500 mb-0.5">
                    {msg.role === 'user' ? 'INVESTIGADOR' : 'ASSISTENTE FROC (CIÊNCIA & SINAIS)'}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-lg p-3 leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-cyan-900/60 border border-cyan-500/40 text-cyan-100'
                        : 'bg-slate-900 border border-slate-800 text-slate-200'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAssistantThinking && (
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs p-2">
                  <span className="animate-spin">⚙️</span>
                  <span>Analisando espectro e premissas forenses...</span>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSendAssistant}
              className="p-3 bg-[#0b1322] border-t border-slate-800 flex gap-2"
            >
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                placeholder="Pergunte sobre calibração, pareidolia, ruído térmico, etc..."
                disabled={isAssistantThinking}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
              />
              <button
                type="submit"
                disabled={!assistantInput.trim() || isAssistantThinking}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-mono text-xs rounded transition font-bold"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal de Diagnóstico Rápido e Preparação de Investigação */}
      {showPreparationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#090f1a] border border-cyan-500/60 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white font-mono uppercase text-cyan-400">
                  DIAGNÓSTICO RÁPIDO &amp; CHECKLIST DE INVESTIGAÇÃO
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Validação prévia de sensores, interferências e protocolo científico
                </p>
              </div>
              <button
                onClick={() => setShowPreparationModal(false)}
                className="text-slate-400 hover:text-white px-2 py-1 font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              {/* Item 1 */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-300">Microfone &amp; Áudio Digital:</span>
                <span className={hasAudioPermission ? 'text-emerald-400' : 'text-rose-400'}>
                  {hasAudioPermission ? 'OK (Capturando dBFS)' : 'Pendente de Permissão'}
                </span>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-300">Sensor Magnético:</span>
                <span className={sensorState.magnetometer.available ? 'text-emerald-400' : 'text-amber-400'}>
                  {sensorState.magnetometer.available ? `Ativo (${sensorState.magnetometer.magnitude} µT)` : 'Hardware não exposto'}
                </span>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-300">Acelerômetro / Inércia:</span>
                <span className={sensorState.motion.available ? 'text-emerald-400' : 'text-slate-400'}>
                  {sensorState.motion.available ? 'Ativo' : 'Aguardando movimento'}
                </span>
              </div>

              {/* Item 4 */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-300">Receptor AM/FM:</span>
                <span className="text-slate-500">Ausente no hardware móvel (Normal)</span>
              </div>
            </div>

            <div className="p-3 rounded bg-[#0b1322] border border-cyan-950 text-[11px] text-slate-300 font-sans space-y-1.5 leading-relaxed">
              <span className="font-bold text-cyan-300 font-mono block">REGRAS DE CONDUTA INVESTIGATIVA:</span>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[10px] font-mono">
                <li>Manter o smartphone sobre superfície fixa ou tripé para não induzir falso vetor magnético.</li>
                <li>Desligar ou afastar carregadores, caixas de som e fones Bluetooth próximos.</li>
                <li>Se formular perguntas sobre nomes ("Qual espírito se apresenta?"), tratar qualquer fonema como hipótese não confirmada.</li>
                <li>Registrar sempre o resultado do controle mesmo se for nulo ou ruído.</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowPreparationModal(false)}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold cursor-pointer"
              >
                Concluir Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

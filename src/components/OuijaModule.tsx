import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Session, EvidenceItem, SensorState } from '../types';
import { AudioMetrics } from '../services/audioEngine';
import {
  Compass,
  Sparkles,
  Check,
  AlertTriangle,
  Play,
  Pause,
  Square,
  RotateCcw,
  Zap,
  Activity,
  HelpCircle,
  Clock,
  Shield,
  Send,
} from 'lucide-react';

interface Props {
  activeSession: Session | null;
  onSaveOuijaEvidence: (
    mode: 'physical' | 'digital' | 'automatic',
    letters: string,
    notes: string,
    durationSec: number
  ) => Promise<void>;
  evidenceList: EvidenceItem[];
  sensorState?: SensorState;
  audioMetrics?: AudioMetrics;
}

interface BoardSymbol {
  id: string;
  label: string;
  x: number; // Percentage 0 - 100
  y: number; // Percentage 0 - 100
  category: 'word' | 'letter' | 'number';
}

interface AutomaticCaptureLog {
  id: string;
  timestamp: string;
  symbol: string;
  dwellMs: number;
  velocity: number;
  emf: number;
  confidence: number;
}

// Fixed board geometry definition
const BOARD_SYMBOLS: BoardSymbol[] = [
  { id: 'SIM', label: 'SIM', x: 16, y: 15, category: 'word' },
  { id: 'NÃO', label: 'NÃO', x: 84, y: 15, category: 'word' },

  // Row 1: A - M (y = 34%)
  { id: 'A', label: 'A', x: 12, y: 34, category: 'letter' },
  { id: 'B', label: 'B', x: 18.3, y: 34, category: 'letter' },
  { id: 'C', label: 'C', x: 24.6, y: 34, category: 'letter' },
  { id: 'D', label: 'D', x: 31, y: 34, category: 'letter' },
  { id: 'E', label: 'E', x: 37.3, y: 34, category: 'letter' },
  { id: 'F', label: 'F', x: 43.6, y: 34, category: 'letter' },
  { id: 'G', label: 'G', x: 50, y: 34, category: 'letter' },
  { id: 'H', label: 'H', x: 56.3, y: 34, category: 'letter' },
  { id: 'I', label: 'I', x: 62.6, y: 34, category: 'letter' },
  { id: 'J', label: 'J', x: 69, y: 34, category: 'letter' },
  { id: 'K', label: 'K', x: 75.3, y: 34, category: 'letter' },
  { id: 'L', label: 'L', x: 81.6, y: 34, category: 'letter' },
  { id: 'M', label: 'M', x: 88, y: 34, category: 'letter' },

  // Row 2: N - Z (y = 52%)
  { id: 'N', label: 'N', x: 12, y: 52, category: 'letter' },
  { id: 'O', label: 'O', x: 18.3, y: 52, category: 'letter' },
  { id: 'P', label: 'P', x: 24.6, y: 52, category: 'letter' },
  { id: 'Q', label: 'Q', x: 31, y: 52, category: 'letter' },
  { id: 'R', label: 'R', x: 37.3, y: 52, category: 'letter' },
  { id: 'S', label: 'S', x: 43.6, y: 52, category: 'letter' },
  { id: 'T', label: 'T', x: 50, y: 52, category: 'letter' },
  { id: 'U', label: 'U', x: 56.3, y: 52, category: 'letter' },
  { id: 'V', label: 'V', x: 62.6, y: 52, category: 'letter' },
  { id: 'W', label: 'W', x: 69, y: 52, category: 'letter' },
  { id: 'X', label: 'X', x: 75.3, y: 52, category: 'letter' },
  { id: 'Y', label: 'Y', x: 81.6, y: 52, category: 'letter' },
  { id: 'Z', label: 'Z', x: 88, y: 52, category: 'letter' },

  // Numbers 1 - 0 (y = 70%)
  { id: '1', label: '1', x: 18, y: 70, category: 'number' },
  { id: '2', label: '2', x: 25, y: 70, category: 'number' },
  { id: '3', label: '3', x: 32, y: 70, category: 'number' },
  { id: '4', label: '4', x: 39, y: 70, category: 'number' },
  { id: '5', label: '5', x: 46, y: 70, category: 'number' },
  { id: '6', label: '6', x: 54, y: 70, category: 'number' },
  { id: '7', label: '7', x: 61, y: 70, category: 'number' },
  { id: '8', label: '8', x: 68, y: 70, category: 'number' },
  { id: '9', label: '9', x: 75, y: 70, category: 'number' },
  { id: '0', label: '0', x: 82, y: 70, category: 'number' },

  // Bottom: ADEUS (y = 88%)
  { id: 'ADEUS', label: 'ADEUS', x: 50, y: 88, category: 'word' },
];

export const OuijaModule: React.FC<Props> = ({
  activeSession,
  onSaveOuijaEvidence,
  evidenceList,
  sensorState,
  audioMetrics,
}) => {
  // Modo padrão: 'automatic' (conforme requisito principal do comitê)
  const [ouijaMode, setOuijaMode] = useState<'automatic' | 'digital' | 'physical'>('automatic');

  // Automatic & Digital board coordinates
  const [planchettePos, setPlanchettePos] = useState({ x: 50, y: 50 });
  const [touchVelocity, setTouchVelocity] = useState(0);
  const [currentSequence, setCurrentSequence] = useState<string[]>([]);
  const [captureLogs, setCaptureLogs] = useState<AutomaticCaptureLog[]>([]);

  // Automatic mode state & dwell engine
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [dwellTarget, setDwellTarget] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0); // 0 to 100
  const [dwellSpeed, setDwellSpeed] = useState<'fast' | 'normal' | 'slow'>('normal');
  const [flashSymbol, setFlashSymbol] = useState<string | null>(null);

  // Question in Ouija session
  const [sessionQuestion, setSessionQuestion] = useState('');
  const [activeTargetSymbols, setActiveTargetSymbols] = useState<string[]>([]);
  const [targetIndex, setTargetIndex] = useState(0);

  // Manual drag tracking
  const [isDragging, setIsDragging] = useState(false);
  const lastTouchTime = useRef<number>(Date.now());
  const lastTouchPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Physical board state
  const [physicalNotes, setPhysicalNotes] = useState('');
  const [physicalMarkedLetters, setPhysicalMarkedLetters] = useState<string[]>([]);

  // Timer
  const [ouijaStartTime, setOuijaStartTime] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Dwell duration in ms based on user speed preference
  const dwellDurationMs = dwellSpeed === 'fast' ? 1000 : dwellSpeed === 'slow' ? 2200 : 1400;

  // Session timer
  useEffect(() => {
    let interval: any;
    if (ouijaStartTime) {
      interval = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - ouijaStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedSec(0);
    }
    return () => clearInterval(interval);
  }, [ouijaStartTime]);

  const handleStartSession = () => {
    setOuijaStartTime(Date.now());
    setCurrentSequence([]);
    setCaptureLogs([]);
    setPhysicalMarkedLetters([]);
    setIsAutoScanning(true);
  };

  const handleFinishAndSave = async () => {
    const letters =
      ouijaMode === 'physical'
        ? physicalMarkedLetters.join('')
        : currentSequence.join('');

    const questionNote = sessionQuestion.trim()
      ? ` [Pergunta: "${sessionQuestion.trim()}"]`
      : '';

    const note =
      ouijaMode === 'automatic'
        ? `Sessão Ouija em Modo Automático (Varredura Autônoma por Dwell & Sensores).${questionNote} Sequência capturada sem clique manual por permanência temporal. Letras: ${letters || '(nenhuma)'}. Registros capturados: ${captureLogs.length}. EMF Médio: ${sensorState?.magnetometer.magnitude || 0} µT.`
        : ouijaMode === 'digital'
        ? `Sessão Ouija em Tabuleiro Digital Ideomotor.${questionNote} Movimento de toque e arraste do operador. Letras: ${letters || '(nenhuma)'}.`
        : `Sessão em Tabuleiro Físico.${questionNote} Notas do observador: ${physicalNotes}. Letras: ${letters || '(nenhuma)'}.`;

    await onSaveOuijaEvidence(ouijaMode, letters, note, elapsedSec);
    setOuijaStartTime(null);
    setIsAutoScanning(false);
  };

  const handleClearLetters = () => {
    setCurrentSequence([]);
    setCaptureLogs([]);
    setPhysicalMarkedLetters([]);
    setFlashSymbol(null);
  };

  // Autonomous Physics & Dwell Engine Loop
  const posRef = useRef(planchettePos);
  posRef.current = planchettePos;
  const velRef = useRef({ vx: 0, vy: 0 });
  const dwellCooldownRef = useRef<{ symbol: string; until: number } | null>(null);
  const dwellProgressRef = useRef(0);
  const dwellTargetRef = useRef<string | null>(null);

  // Formular Pergunta e Iniciar Resposta Autônoma
  const handleStartQuestionSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionQuestion.trim()) return;

    if (!ouijaStartTime) {
      setOuijaStartTime(Date.now());
    }
    setIsAutoScanning(true);

    const q = sessionQuestion.toLowerCase();
    let targets: string[] = [];

    // Se pergunta for fechada (sim/não)
    if (q.includes('tem alguém') || q.includes('está aí') || q.includes('pode falar') || q.includes('sim ou não')) {
      const pickSim = (sensorState?.magnetometer.magnitude || 45) % 2 === 0;
      targets = [pickSim ? 'SIM' : 'NÃO'];
    } else if (q.includes('qual seu nome') || q.includes('quem é')) {
      targets = ['N', 'O', 'M', 'E'];
    } else {
      // Decompor letras da primeira palavra relevante
      const words = sessionQuestion.toUpperCase().replace(/[^A-Z]/g, '');
      targets = words.slice(0, 4).split('');
      if (targets.length === 0) targets = ['SIM'];
    }

    setActiveTargetSymbols(targets);
    setTargetIndex(0);
  };

  // Motor de física orgânica autônoma
  useEffect(() => {
    if (ouijaMode !== 'automatic' || !isAutoScanning) {
      return;
    }

    let animId: number;
    let lastFrameTime = performance.now();

    const tick = (nowTime: number) => {
      const dt = Math.min(50, Math.max(10, nowTime - lastFrameTime)) / 1000;
      lastFrameTime = nowTime;

      const currentPos = posRef.current;
      const currentVel = velRef.current;

      // 1. Determinar alvo de atração se houver pergunta ou alvo ativo
      let targetX = 50;
      let targetY = 50;
      let hasActiveTarget = false;

      if (activeTargetSymbols.length > 0 && targetIndex < activeTargetSymbols.length) {
        const nextSymId = activeTargetSymbols[targetIndex];
        const found = BOARD_SYMBOLS.find((s) => s.id === nextSymId);
        if (found) {
          targetX = found.x;
          targetY = found.y;
          hasActiveTarget = true;
        }
      }

      // 2. Flutuação ambiental orgânica (Magnetômetro + Ruído do Microfone + Brownian Drift)
      const emfFlux = sensorState?.magnetometer.delta || 0;
      const audioRms = audioMetrics?.rms || 0;
      const timeSec = nowTime / 1000;

      const noiseX = Math.sin(timeSec * 1.7) * 8 + Math.cos(timeSec * 3.1) * 4 + (emfFlux * 1.5);
      const noiseY = Math.cos(timeSec * 1.3) * 6 + Math.sin(timeSec * 2.8) * 3 + (audioRms * 20);

      // 3. Força atrativa ou deriva browniana
      let ax = 0;
      let ay = 0;

      if (hasActiveTarget) {
        const dx = targetX - currentPos.x;
        const dy = targetY - currentPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Desacelerar suavemente ao aproximar do alvo para favorecer o Dwell
        const speedMultiplier = dist < 8 ? 0.35 : 1.2;
        ax = (dx * 2.2 + noiseX * 0.4) * speedMultiplier;
        ay = (dy * 2.2 + noiseY * 0.4) * speedMultiplier;
      } else {
        // Voo livre autônomo sobre o tabuleiro
        ax = (50 - currentPos.x) * 0.4 + noiseX * 2.5;
        ay = (50 - currentPos.y) * 0.4 + noiseY * 2.5;
      }

      // 4. Integração de velocidade com amortecimento
      currentVel.vx = (currentVel.vx + ax * dt) * 0.92;
      currentVel.vy = (currentVel.vy + ay * dt) * 0.92;

      // Limitar velocidade máxima para movimento pericial suave
      const speed = Math.sqrt(currentVel.vx * currentVel.vx + currentVel.vy * currentVel.vy);
      const maxSpeed = hasActiveTarget ? 24 : 35;
      if (speed > maxSpeed) {
        currentVel.vx = (currentVel.vx / speed) * maxSpeed;
        currentVel.vy = (currentVel.vy / speed) * maxSpeed;
      }

      // 5. Nova posição com colisão elástica nas bordas do tabuleiro
      let newX = currentPos.x + currentVel.vx * dt;
      let newY = currentPos.y + currentVel.vy * dt;

      if (newX < 10) { newX = 10; currentVel.vx *= -0.5; }
      if (newX > 90) { newX = 90; currentVel.vx *= -0.5; }
      if (newY < 12) { newY = 12; currentVel.vy *= -0.5; }
      if (newY > 90) { newY = 90; currentVel.vy *= -0.5; }

      posRef.current = { x: newX, y: newY };
      velRef.current = currentVel;
      setPlanchettePos({ x: newX, y: newY });
      setTouchVelocity(Number(speed.toFixed(1)));

      // 6. MOTOR DE FIXAÇÃO AUTOMÁTICA (DWELL DETECTION)
      // Encontrar o símbolo mais próximo
      let closestSymbol: BoardSymbol | null = null;
      let minDistance = 999;

      for (const symbol of BOARD_SYMBOLS) {
        const dx = symbol.x - newX;
        const dy = symbol.y - newY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDistance) {
          minDistance = d;
          closestSymbol = symbol;
        }
      }

      const captureRadius = closestSymbol?.category === 'word' ? 7.5 : 5.2;
      const isNearSymbol = minDistance <= captureRadius;
      const isSlowEnough = speed < 18;

      // Verificar cooldown para não re-capturar o mesmo símbolo sem sair dele
      const nowMs = Date.now();
      const inCooldown = dwellCooldownRef.current &&
        dwellCooldownRef.current.symbol === closestSymbol?.id &&
        nowMs < dwellCooldownRef.current.until;

      if (isNearSymbol && isSlowEnough && closestSymbol && !inCooldown) {
        // Se mudou de símbolo durante o dwell, reiniciar progresso
        if (dwellTargetRef.current !== closestSymbol.id) {
          dwellTargetRef.current = closestSymbol.id;
          dwellProgressRef.current = 0;
          setDwellTarget(closestSymbol.id);
        }

        // Incrementar progresso
        const progressDelta = (dt * 1000 / dwellDurationMs) * 100;
        const newProgress = Math.min(100, dwellProgressRef.current + progressDelta);
        dwellProgressRef.current = newProgress;
        setDwellProgress(Math.round(newProgress));

        // CAPTURA AUTOMÁTICA EFETIVADA (100% de Permanência)!
        if (newProgress >= 100) {
          const capturedId = closestSymbol.id;
          setCurrentSequence((prev) => [...prev, capturedId]);
          setFlashSymbol(capturedId);

          const newLog: AutomaticCaptureLog = {
            id: `log_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date(nowMs).toLocaleTimeString(),
            symbol: capturedId,
            dwellMs: dwellDurationMs,
            velocity: Number(speed.toFixed(1)),
            emf: sensorState?.magnetometer.magnitude || 45,
            confidence: Math.min(95, Math.max(55, Math.round(75 - (speed * 1.5) + (audioRms * 10)))),
          };
          setCaptureLogs((prev) => [newLog, ...prev.slice(0, 19)]);

          // Acionar cooldown para este símbolo e dar pequeno impulso de saída
          dwellCooldownRef.current = { symbol: capturedId, until: nowMs + 2400 };
          dwellProgressRef.current = 0;
          dwellTargetRef.current = null;
          setDwellProgress(0);
          setDwellTarget(null);

          // Se estiver percorrendo sequência de pergunta, avançar próximo alvo
          if (activeTargetSymbols.length > 0) {
            setTargetIndex((prev) => prev + 1);
          }

          // Impulso suave para afastar da letra
          velRef.current.vx += (Math.random() - 0.5) * 15;
          velRef.current.vy += (Math.random() - 0.5) * 15;

          setTimeout(() => setFlashSymbol(null), 1200);
        }
      } else {
        // Se se afastou ou acelerou, desvanecer progresso
        if (dwellProgressRef.current > 0) {
          const decayed = Math.max(0, dwellProgressRef.current - dt * 250);
          dwellProgressRef.current = decayed;
          setDwellProgress(Math.round(decayed));
          if (decayed === 0) {
            dwellTargetRef.current = null;
            setDwellTarget(null);
          }
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [ouijaMode, isAutoScanning, dwellDurationMs, activeTargetSymbols, targetIndex, sensorState, audioMetrics]);

  // Pointer drag events for Digital mode
  const handlePointerDown = (e: React.PointerEvent) => {
    if (ouijaMode !== 'digital') return;
    setIsDragging(true);
    updatePlanchetteFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (ouijaMode !== 'digital' || !isDragging) return;
    updatePlanchetteFromEvent(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updatePlanchetteFromEvent = (e: React.PointerEvent) => {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));

    const now = Date.now();
    const dt = Math.max(1, now - lastTouchTime.current);
    const dx = x - lastTouchPos.current.x;
    const dy = y - lastTouchPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const vel = Number(((dist / dt) * 100).toFixed(1));

    lastTouchTime.current = now;
    lastTouchPos.current = { x, y };
    posRef.current = { x, y };
    setTouchVelocity(vel);
    setPlanchettePos({ x, y });
  };

  const handleSelectLetterManual = (letter: string) => {
    if (ouijaMode === 'physical') {
      setPhysicalMarkedLetters((prev) => [...prev, letter]);
    } else {
      setCurrentSequence((prev) => [...prev, letter]);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Modo Selector & Header */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm sm:text-base font-bold text-white font-mono uppercase">
                ESTAÇÃO OUIJA &amp; REGISTRO DE MOVIMENTO
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Protocolo pericial com fixação automática por permanência (Dwell) e correlação de sensores
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded flex-wrap">
            <button
              onClick={() => {
                setOuijaMode('automatic');
                setIsAutoScanning(true);
              }}
              className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer flex items-center gap-1 ${
                ouijaMode === 'automatic'
                  ? 'bg-cyan-600 text-white font-bold shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3 text-cyan-300" />
              <span>Modo Automático</span>
            </button>

            <button
              onClick={() => {
                setOuijaMode('digital');
                setIsAutoScanning(false);
              }}
              className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                ouijaMode === 'digital'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Manual Ideomotor
            </button>

            <button
              onClick={() => {
                setOuijaMode('physical');
                setIsAutoScanning(false);
              }}
              className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                ouijaMode === 'physical'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tabuleiro Físico
            </button>
          </div>
        </div>

        {/* Disclaimer strictly required */}
        <div className="mt-3 p-2.5 rounded bg-[#080d17] border border-cyan-900/50 text-[11px] text-slate-300 font-sans leading-relaxed">
          {ouijaMode === 'automatic' ? (
            <p>
              <strong className="text-cyan-300 font-mono">MODO AUTOMÁTICO SENSORIZADO:</strong> O ponteiro move-se autonomamente por micro-deriva de campos magnéticos ({sensorState?.magnetometer.magnitude || 0} µT), vibração acústica do microfone e algoritmo ideomotor. <span className="text-emerald-400 font-semibold">O usuário NÃO precisa clicar nas letras:</span> a seleção ocorre automaticamente quando o ponteiro permanece sobre um símbolo (Dwell time de {(dwellDurationMs / 1000).toFixed(1)}s).
            </p>
          ) : ouijaMode === 'digital' ? (
            <p>
              <strong className="text-cyan-300 font-mono">TABULEIRO MANUAL:</strong> O operador toca e arrasta o ponteiro pela tela, medindo a velocidade e a rotação do toque humano inconsciente (efeito ideomotor).
            </p>
          ) : (
            <p>
              <strong className="text-cyan-300 font-mono">TABULEIRO FÍSICO:</strong> Anotação e cronometragem manual de sessão realizada sobre madeira ou papel em campo com testemunhas.
            </p>
          )}
        </div>
      </div>

      {/* 2. Barra de Controle & Pergunta da Sessão Ouija */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-3 space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-400">
              Duração: <strong className="text-cyan-300">{elapsedSec}s</strong>
            </span>
            <span className="text-slate-400">
              Letras Capturadas: <strong className="text-emerald-400 text-sm">
                {ouijaMode === 'physical'
                  ? physicalMarkedLetters.join(' ') || '(nenhuma)'
                  : currentSequence.join(' ') || '(nenhuma)'}
              </strong>
            </span>
            {dwellTarget && (
              <span className="text-amber-300 flex items-center gap-1 bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded animate-pulse">
                <span>Fixando '{dwellTarget}': <strong>{dwellProgress}%</strong></span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {ouijaMode === 'automatic' && (
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-[11px]">
                <span className="text-slate-400">Dwell:</span>
                {(['fast', 'normal', 'slow'] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setDwellSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer uppercase ${
                      dwellSpeed === spd ? 'bg-cyan-600 text-white font-bold' : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {spd === 'fast' ? '1.0s' : spd === 'normal' ? '1.4s' : '2.2s'}
                  </button>
                ))}
              </div>
            )}

            {!ouijaStartTime ? (
              <button
                onClick={handleStartSession}
                className="px-3 py-1.5 bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 rounded flex items-center gap-1.5 hover:bg-emerald-600/50 cursor-pointer font-bold"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Iniciar Sessão Ouija</span>
              </button>
            ) : (
              <>
                {ouijaMode === 'automatic' && (
                  <button
                    onClick={() => setIsAutoScanning(!isAutoScanning)}
                    className={`px-2.5 py-1.5 rounded flex items-center gap-1 cursor-pointer border ${
                      isAutoScanning
                        ? 'bg-amber-950/70 border-amber-600/60 text-amber-300'
                        : 'bg-emerald-950/70 border-emerald-600/60 text-emerald-300'
                    }`}
                  >
                    {isAutoScanning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{isAutoScanning ? 'Pausar Varredura' : 'Retomar'}</span>
                  </button>
                )}
                <button
                  onClick={handleClearLetters}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Limpar</span>
                </button>
                <button
                  onClick={handleFinishAndSave}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center gap-1.5 cursor-pointer font-bold shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Salvar na Cadeia de Evidências</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pergunta Formulada no Modo Automático */}
        {ouijaMode === 'automatic' && (
          <form onSubmit={handleStartQuestionSearch} className="flex gap-2 pt-2 border-t border-slate-800/80">
            <input
              type="text"
              value={sessionQuestion}
              onChange={(e) => setSessionQuestion(e.target.value)}
              placeholder="Digite a pergunta da sessão para orientar a busca autônoma (ex: 'Há alguém aqui?')..."
              className="flex-1 bg-[#050912] border border-slate-700/80 rounded px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-cyan-600/40 hover:bg-cyan-600/70 border border-cyan-500/60 text-cyan-200 font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition"
            >
              <Send className="w-3 h-3 text-cyan-300" />
              <span>Iniciar Busca</span>
            </button>
          </form>
        )}
      </div>

      {/* 3. MODO VISUAL DO TABULEIRO (Automático & Digital) */}
      {ouijaMode !== 'physical' ? (
        <div className="bg-[#070c14] border border-cyan-950/80 rounded-lg p-3 sm:p-5 select-none space-y-3">
          <div
            ref={boardRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`relative w-full aspect-[16/10] max-h-[500px] bg-[#090f1b] border-2 border-cyan-900/60 rounded-xl overflow-hidden p-4 flex flex-col justify-between shadow-inner ${
              ouijaMode === 'digital' ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            {/* Top row: SIM / NÃO */}
            <div className="flex justify-between items-center px-4 font-mono text-xs sm:text-sm font-bold text-cyan-400">
              <div
                className={`px-4 py-1.5 rounded border transition ${
                  flashSymbol === 'SIM'
                    ? 'bg-emerald-500 text-black border-white scale-110 shadow-[0_0_20px_#10b981]'
                    : dwellTarget === 'SIM'
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                    : 'border-cyan-500/30 text-cyan-400 bg-slate-900/50'
                }`}
              >
                SIM
              </div>
              <div className="text-[10px] text-slate-500 tracking-widest uppercase font-mono hidden sm:block">
                FROC FORENSIC OUIJA • DWELL ENGINE
              </div>
              <div
                className={`px-4 py-1.5 rounded border transition ${
                  flashSymbol === 'NÃO'
                    ? 'bg-emerald-500 text-black border-white scale-110 shadow-[0_0_20px_#10b981]'
                    : dwellTarget === 'NÃO'
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                    : 'border-cyan-500/30 text-cyan-400 bg-slate-900/50'
                }`}
              >
                NÃO
              </div>
            </div>

            {/* Middle arch: Alphabet Row 1 (A - M) */}
            <div className="space-y-2 py-2">
              <div className="flex justify-center gap-1 sm:gap-2 flex-wrap">
                {BOARD_SYMBOLS.filter((s) => s.category === 'letter' && s.y === 34).map((s) => {
                  const isFlashed = flashSymbol === s.id;
                  const isHovered = dwellTarget === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => ouijaMode === 'digital' && handleSelectLetterManual(s.id)}
                      className={`w-6 h-7 sm:w-8 sm:h-9 rounded font-mono text-xs sm:text-sm font-bold flex items-center justify-center transition border ${
                        isFlashed
                          ? 'bg-emerald-400 text-black border-white scale-125 shadow-[0_0_20px_#34d399]'
                          : isHovered
                          ? 'bg-cyan-950 border-cyan-300 text-cyan-100 scale-110 shadow-[0_0_12px_#00f0ff]'
                          : 'bg-slate-900/70 border-slate-700/60 text-cyan-200'
                      }`}
                    >
                      {s.label}
                    </div>
                  );
                })}
              </div>

              {/* Middle arch: Alphabet Row 2 (N - Z) */}
              <div className="flex justify-center gap-1 sm:gap-2 flex-wrap">
                {BOARD_SYMBOLS.filter((s) => s.category === 'letter' && s.y === 52).map((s) => {
                  const isFlashed = flashSymbol === s.id;
                  const isHovered = dwellTarget === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => ouijaMode === 'digital' && handleSelectLetterManual(s.id)}
                      className={`w-6 h-7 sm:w-8 sm:h-9 rounded font-mono text-xs sm:text-sm font-bold flex items-center justify-center transition border ${
                        isFlashed
                          ? 'bg-emerald-400 text-black border-white scale-125 shadow-[0_0_20px_#34d399]'
                          : isHovered
                          ? 'bg-cyan-950 border-cyan-300 text-cyan-100 scale-110 shadow-[0_0_12px_#00f0ff]'
                          : 'bg-slate-900/70 border-slate-700/60 text-cyan-200'
                      }`}
                    >
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Numbers row (1 - 0) */}
            <div className="flex justify-center gap-1.5 sm:gap-3 flex-wrap">
              {BOARD_SYMBOLS.filter((s) => s.category === 'number').map((s) => {
                const isFlashed = flashSymbol === s.id;
                const isHovered = dwellTarget === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => ouijaMode === 'digital' && handleSelectLetterManual(s.id)}
                    className={`w-5 h-6 sm:w-7 sm:h-8 rounded font-mono text-xs font-semibold flex items-center justify-center transition border ${
                      isFlashed
                        ? 'bg-emerald-400 text-black border-white scale-125 shadow-[0_0_20px_#34d399]'
                        : isHovered
                        ? 'bg-cyan-950 border-cyan-300 text-cyan-100 scale-110 shadow-[0_0_12px_#00f0ff]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>

            {/* Bottom row: ADEUS */}
            <div className="flex justify-center pt-1">
              <div
                className={`px-6 py-1 rounded border text-xs font-mono font-bold tracking-widest transition ${
                  flashSymbol === 'ADEUS'
                    ? 'bg-rose-500 text-black border-white scale-110 shadow-[0_0_20px_#f43f5e]'
                    : dwellTarget === 'ADEUS'
                    ? 'bg-rose-950 border-rose-400 text-rose-200 scale-105'
                    : 'border-rose-500/30 text-rose-300 bg-slate-900/40'
                }`}
              >
                ADEUS
              </div>
            </div>

            {/* PONTEIRO (PLANCHETTE) COM ANEL DE DWELL CIRCULAR */}
            <div
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 flex flex-col items-center z-10"
              style={{ left: `${planchettePos.x}%`, top: `${planchettePos.y}%` }}
            >
              <div className="relative w-14 h-16 sm:w-16 sm:h-20 border-2 border-cyan-400 bg-cyan-950/50 rounded-t-full rounded-b-lg backdrop-blur-xs flex items-center justify-center shadow-[0_0_25px_rgba(0,240,255,0.45)]">
                {/* Lente óptica com anel de progresso SVG de Dwell */}
                <div className="relative w-7 h-7 rounded-full border border-cyan-300 bg-black/80 flex items-center justify-center">
                  {dwellProgress > 0 && (
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="14"
                        cy="14"
                        r="11"
                        fill="transparent"
                        stroke="#00f0ff"
                        strokeWidth="2.5"
                        strokeDasharray={69}
                        strokeDashoffset={69 - (69 * dwellProgress) / 100}
                        className="transition-all duration-75"
                      />
                    </svg>
                  )}
                  <div
                    className={`w-2 h-2 rounded-full transition-transform ${
                      dwellProgress > 0 ? 'bg-cyan-300 scale-125 animate-ping' : 'bg-emerald-400'
                    }`}
                  />
                </div>
              </div>

              {/* Tag de Telemetria do Ponteiro */}
              <div className="mt-1 bg-black/90 px-1.5 py-0.5 rounded border border-cyan-900/60 text-[9px] font-mono text-cyan-300 flex items-center gap-1.5 shadow">
                <span>{touchVelocity} px/s</span>
                {dwellTarget && <span className="text-amber-300 font-bold">[{dwellTarget}]</span>}
              </div>
            </div>
          </div>

          {/* Telemetria e Status Inferior */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-[11px] font-mono text-slate-400 gap-2 border-t border-slate-800/80 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                Fixação Dwell: <strong className="text-cyan-300">{dwellTarget ? `${dwellTarget} (${dwellProgress}%)` : 'Livre'}</strong>
              </span>
              <span>
                Velocidade: <strong className="text-slate-300">{touchVelocity} px/s</strong>
              </span>
              <span>
                Magnetômetro EMF: <strong className="text-purple-300">{sensorState?.magnetometer.magnitude || 0} µT</strong>
              </span>
            </div>

            <div className="text-slate-500 text-[10px]">
              {ouijaMode === 'automatic'
                ? 'Varredura automática ativa: permaneça sobre a letra para captura sem clique.'
                : 'Arraste o ponteiro com o dedo para gerar deslocamento ideomotor.'}
            </div>
          </div>

          {/* Registro Histórico de Capturas Autônomas da Sessão */}
          {captureLogs.length > 0 && (
            <div className="bg-[#050b14] border border-slate-800/80 rounded p-2.5 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase">
                <span>Últimas Letras Fixadas por Dwell:</span>
                <span>{captureLogs.length} capturas registradas</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
                {captureLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-900/60 text-[11px] flex items-center gap-1.5"
                  >
                    <strong className="text-cyan-300">{log.symbol}</strong>
                    <span className="text-slate-500 text-[9px]">{log.timestamp}</span>
                    <span className="text-emerald-400 text-[9px]">{log.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* MODO TABULEIRO FÍSICO — REGISTRO MANUAL DE CAMPO */
        <div className="bg-[#070c14] border border-cyan-950/80 rounded-lg p-4 space-y-4 font-mono text-xs">
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded text-slate-300 space-y-1.5">
            <h4 className="font-bold text-cyan-400 uppercase">
              MODO TABULEIRO FÍSICO — REGISTRO MANUAL DE CAMPO
            </h4>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Posicione seu tabuleiro físico sob boa iluminação. Utilize este painel para registrar em tempo real quais letras e movimentos forem apontados pelas mãos dos participantes.
            </p>
          </div>

          {/* Botões de toque rápido para marcação física */}
          <div className="space-y-2">
            <label className="text-slate-300 block text-xs">
              Toque rápido para registrar letras observadas no tabuleiro real:
            </label>
            <div className="flex flex-wrap gap-1">
              {BOARD_SYMBOLS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectLetterManual(s.id)}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-200 rounded cursor-pointer active:bg-cyan-700 text-xs"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-300 block mb-1 text-xs">
              Notas do Investigador sobre a Sessão Físico-Óptica:
            </label>
            <textarea
              value={physicalNotes}
              onChange={(e) => setPhysicalNotes(e.target.value)}
              placeholder="Ex: '3 participantes com dedos sobre o ponteiro. Movimento suave rumo à letra B...'"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-100 placeholder:text-slate-500 font-sans focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      )}
    </div>
  );
};

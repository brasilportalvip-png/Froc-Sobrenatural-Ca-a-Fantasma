import React, { useState, useRef, useEffect } from 'react';
import { Session, EvidenceItem } from '../types';
import { Compass, Camera, Sparkles, Check, AlertTriangle, Play, Square, RotateCcw } from 'lucide-react';

interface Props {
  activeSession: Session | null;
  onSaveOuijaEvidence: (
    mode: 'physical' | 'digital',
    letters: string,
    notes: string,
    durationSec: number
  ) => Promise<void>;
  evidenceList: EvidenceItem[];
}

export const OuijaModule: React.FC<Props> = ({
  activeSession,
  onSaveOuijaEvidence,
  evidenceList,
}) => {
  const [ouijaMode, setOuijaMode] = useState<'digital' | 'physical'>('digital');

  // Digital board state
  const [currentSequence, setCurrentSequence] = useState<string[]>([]);
  const [planchettePos, setPlanchettePos] = useState({ x: 50, y: 50 }); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [touchVelocity, setTouchVelocity] = useState(0);
  const lastTouchTime = useRef<number>(Date.now());
  const lastTouchPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Physical board manual tracking state
  const [physicalNotes, setPhysicalNotes] = useState('');
  const [physicalMarkedLetters, setPhysicalMarkedLetters] = useState<string[]>([]);

  // Session timer for Ouija run
  const [ouijaStartTime, setOuijaStartTime] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

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
    setPhysicalMarkedLetters([]);
  };

  const handleFinishAndSave = async () => {
    const letters =
      ouijaMode === 'digital'
        ? currentSequence.join('')
        : physicalMarkedLetters.join('');

    const note =
      ouijaMode === 'digital'
        ? `Sessão em Tabuleiro Digital. Sequência gerada por movimento de toque do operador humano (Efeito ideomotor). Letras: ${letters || '(nenhuma)'}.`
        : `Sessão em Tabuleiro Físico com observação e anotação manual. Notas: ${physicalNotes}. Letras: ${letters || '(nenhuma)'}.`;

    await onSaveOuijaEvidence(ouijaMode, letters, note, elapsedSec);
    setOuijaStartTime(null);
  };

  // Letters and board items
  const lettersRow1 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  const lettersRow2 = ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const numbersRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Pointer drag events for Digital mode
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updatePlanchetteFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePlanchetteFromEvent(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updatePlanchetteFromEvent = (e: React.PointerEvent) => {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));

    // Calculate instantaneous velocity
    const now = Date.now();
    const dt = Math.max(1, now - lastTouchTime.current);
    const dx = x - lastTouchPos.current.x;
    const dy = y - lastTouchPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const vel = Number(((dist / dt) * 100).toFixed(1));

    lastTouchTime.current = now;
    lastTouchPos.current = { x, y };
    setTouchVelocity(vel);
    setPlanchettePos({ x, y });
  };

  const handleSelectLetter = (letter: string) => {
    if (ouijaMode === 'digital') {
      setCurrentSequence((prev) => [...prev, letter]);
    } else {
      setPhysicalMarkedLetters((prev) => [...prev, letter]);
    }
  };

  const handleClearLetters = () => {
    if (ouijaMode === 'digital') {
      setCurrentSequence([]);
    } else {
      setPhysicalMarkedLetters([]);
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
              Protocolo de registro auditável sem simulação de entidades artificiais
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded">
            <button
              onClick={() => setOuijaMode('digital')}
              className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                ouijaMode === 'digital'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tabuleiro Digital
            </button>
            <button
              onClick={() => setOuijaMode('physical')}
              className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                ouijaMode === 'physical'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tabuleiro Físico (Anotação Manual)
            </button>
          </div>
        </div>

        {/* Disclaimer strictly required */}
        <div className="mt-3 p-2.5 rounded bg-[#080d17] border border-cyan-900/50 text-[11px] text-slate-300 font-sans leading-relaxed">
          {ouijaMode === 'digital' ? (
            <p>
              <strong className="text-cyan-300 font-mono">TABULEIRO DIGITAL:</strong> O ponteiro é movimentado exclusivamente pelo toque e arraste do investigador na tela. Registramos coordenadas, velocidade do toque e efeito ideomotor inconsciente. <span className="text-amber-400 font-semibold">O software NÃO move o ponteiro sozinho nem finge contato sobrenatural simulado.</span>
            </p>
          ) : (
            <p>
              <strong className="text-cyan-300 font-mono">TABULEIRO FÍSICO:</strong> O investigador observa o tabuleiro físico real através da câmera ou visualmente e registra as marcações e letras observadas. O modo é estritamente rotulado como marcação de observação humana.
            </p>
          )}
        </div>
      </div>

      {/* 2. Ouija Session Controls Bar */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-3 flex justify-between items-center flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            Duração da Investigação: <strong className="text-cyan-300">{elapsedSec}s</strong>
          </span>
          <span className="text-slate-400">
            Letras registradas: <strong className="text-emerald-400">
              {ouijaMode === 'digital' ? currentSequence.join(' ') || '(nenhuma)' : physicalMarkedLetters.join(' ') || '(nenhuma)'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!ouijaStartTime ? (
            <button
              onClick={handleStartSession}
              className="px-3 py-1.5 bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 rounded flex items-center gap-1.5 hover:bg-emerald-600/50 cursor-pointer font-bold"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Iniciar Cronômetro Ouija</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleClearLetters}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpar</span>
              </button>
              <button
                onClick={handleFinishAndSave}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center gap-1.5 cursor-pointer font-bold"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Salvar Sequência na Cadeia</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Modo Visual do Tabuleiro */}
      {ouijaMode === 'digital' ? (
        <div className="bg-[#070c14] border border-cyan-950/80 rounded-lg p-4 sm:p-6 select-none">
          <div
            ref={boardRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative w-full aspect-[16/10] max-h-[460px] bg-[#090f1b] border-2 border-cyan-900/60 rounded-xl overflow-hidden p-4 flex flex-col justify-between cursor-crosshair shadow-inner"
          >
            {/* Top row: SIM / NÃO / Sol e Lua */}
            <div className="flex justify-between items-center px-4 font-mono text-xs sm:text-sm font-bold text-cyan-400">
              <button
                onClick={() => handleSelectLetter('SIM')}
                className="px-3 py-1 rounded border border-cyan-500/30 hover:bg-cyan-950 cursor-pointer"
              >
                SIM
              </button>
              <div className="text-[10px] text-slate-500 tracking-widest uppercase">
                FROC FORENSIC OUIJA
              </div>
              <button
                onClick={() => handleSelectLetter('NÃO')}
                className="px-3 py-1 rounded border border-cyan-500/30 hover:bg-cyan-950 cursor-pointer"
              >
                NÃO
              </button>
            </div>

            {/* Middle arch: Alphabet */}
            <div className="space-y-2 py-4">
              <div className="flex justify-center gap-1 sm:gap-2 flex-wrap">
                {lettersRow1.map((l) => (
                  <button
                    key={l}
                    onClick={() => handleSelectLetter(l)}
                    className="w-6 h-7 sm:w-8 sm:h-9 bg-slate-900/70 border border-slate-700/60 hover:border-cyan-400 rounded text-cyan-200 font-mono text-xs sm:text-sm font-bold flex items-center justify-center transition cursor-pointer hover:scale-105 active:bg-cyan-600"
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex justify-center gap-1 sm:gap-2 flex-wrap">
                {lettersRow2.map((l) => (
                  <button
                    key={l}
                    onClick={() => handleSelectLetter(l)}
                    className="w-6 h-7 sm:w-8 sm:h-9 bg-slate-900/70 border border-slate-700/60 hover:border-cyan-400 rounded text-cyan-200 font-mono text-xs sm:text-sm font-bold flex items-center justify-center transition cursor-pointer hover:scale-105 active:bg-cyan-600"
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Numbers row */}
            <div className="flex justify-center gap-1.5 sm:gap-3 flex-wrap">
              {numbersRow.map((n) => (
                <button
                  key={n}
                  onClick={() => handleSelectLetter(n)}
                  className="w-5 h-6 sm:w-7 sm:h-8 bg-slate-900/60 border border-slate-800 hover:border-cyan-400 rounded text-slate-300 font-mono text-xs font-semibold flex items-center justify-center cursor-pointer"
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Bottom row: ADEUS */}
            <div className="flex justify-center pt-2">
              <button
                onClick={() => handleSelectLetter('ADEUS')}
                className="px-6 py-1 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-950 text-xs font-mono font-bold tracking-widest cursor-pointer"
              >
                ADEUS
              </button>
            </div>

            {/* Interactive Planchette (Ponteiro) */}
            <div
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 flex flex-col items-center"
              style={{ left: `${planchettePos.x}%`, top: `${planchettePos.y}%` }}
            >
              <div className="w-14 h-16 sm:w-16 sm:h-20 border-2 border-cyan-400 bg-cyan-950/40 rounded-t-full rounded-b-lg backdrop-blur-xs flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.4)]">
                <div className="w-5 h-5 rounded-full border border-cyan-300 bg-black/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
              </div>
              <span className="text-[9px] font-mono text-cyan-300 mt-1 bg-black/80 px-1 rounded">
                {touchVelocity} px/s
              </span>
            </div>
          </div>

          <div className="mt-3 flex justify-between text-[11px] font-mono text-slate-400">
            <span>Toque e arraste para mover o ponteiro. Toque nas letras para registrá-las.</span>
            <span>Velocidade Ideomotora: {touchVelocity} px/s</span>
          </div>
        </div>
      ) : (
        /* Tabuleiro Físico */
        <div className="bg-[#070c14] border border-cyan-950/80 rounded-lg p-4 space-y-4">
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded text-xs text-slate-300 space-y-2">
            <h4 className="font-mono font-bold text-cyan-400 uppercase">
              MODO TABULEIRO FÍSICO — REGISTRO MANUAL DE CAMPO
            </h4>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Posicione seu tabuleiro de madeira ou papel físico sob boa iluminação. Utilize este painel para registrar em tempo real quais letras e movimentos forem apontados pelas mãos dos participantes.
            </p>
          </div>

          {/* Quick-tap letters for fast physical notation */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-300 block">
              Toque rápido para registrar letras observadas no tabuleiro real:
            </label>
            <div className="flex flex-wrap gap-1">
              {[...lettersRow1, ...lettersRow2, ...numbersRow, 'SIM', 'NÃO', 'ADEUS'].map((item) => (
                <button
                  key={item}
                  onClick={() => handleSelectLetter(item)}
                  className="px-2 py-1 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-cyan-200 rounded cursor-pointer active:bg-cyan-700"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-slate-300 block mb-1">
              Notas do Investigador sobre o Tabuleiro Físico:
            </label>
            <textarea
              value={physicalNotes}
              onChange={(e) => setPhysicalNotes(e.target.value)}
              placeholder="Ex: '3 participantes com dois dedos sobre o ponteiro de madeira. Movimento suave rumo à letra B...'"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-100 placeholder:text-slate-500 font-sans focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      )}
    </div>
  );
};

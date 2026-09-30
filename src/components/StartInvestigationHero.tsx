import React, { useState } from 'react';
import {
  Sparkles,
  Play,
  CheckCircle2,
  Radio,
  Compass,
  Cpu,
  ShieldAlert,
  HelpCircle,
  Sliders,
} from 'lucide-react';
import { InvestigationExperienceMode } from '../types';

interface Props {
  onStartSession: () => Promise<any>;
  onRequestMicPermission?: () => Promise<any>;
  onCalibrateSensors?: () => void;
  experienceMode: InvestigationExperienceMode;
  onToggleExperienceMode: (mode: InvestigationExperienceMode) => void;
  onOpenGuidedMode?: () => void;
}

export const StartInvestigationHero: React.FC<Props> = ({
  onStartSession,
  onRequestMicPermission,
  onCalibrateSensors,
  experienceMode,
  onToggleExperienceMode,
  onOpenGuidedMode,
}) => {
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStepText, setInitStepText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const handleStartClick = async () => {
    if (isInitializing) return;
    setIsInitializing(true);

    try {
      setInitStepText('Preparando estação...');
      setProgressPercent(20);
      await new Promise((r) => setTimeout(r, 250));

      setInitStepText('Verificando microfone...');
      setProgressPercent(45);
      if (onRequestMicPermission) {
        try {
          await onRequestMicPermission();
        } catch (e) {
          console.warn('Permissão de microfone requisitada na inicialização:', e);
        }
      }
      await new Promise((r) => setTimeout(r, 250));

      setInitStepText('Calibrando sensores...');
      setProgressPercent(70);
      if (onCalibrateSensors) {
        try {
          onCalibrateSensors();
        } catch (e) {
          console.warn('Calibração de sensores:', e);
        }
      }
      await new Promise((r) => setTimeout(r, 250));

      setInitStepText('Preparando análise inteligente...');
      setProgressPercent(90);
      await new Promise((r) => setTimeout(r, 250));

      setInitStepText('Estação pronta.');
      setProgressPercent(100);
      await new Promise((r) => setTimeout(r, 200));

      await onStartSession();
    } catch (err) {
      console.error('Erro ao iniciar estação:', err);
    } finally {
      setIsInitializing(false);
      setInitStepText('');
      setProgressPercent(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#091325] via-[#060c18] to-[#04070e] border border-cyan-500/30 p-6 sm:p-10 shadow-[0_10px_50px_rgba(0,0,0,0.8)] text-center my-4">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none" />

      {/* Identidade Superior */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono mb-4 backdrop-blur-md">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span>FROC INTELLIGENCE · ESTAÇÃO INTELIGENTE</span>
      </div>

      <h1 className="text-2xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight text-white drop-shadow-[0_2px_15px_rgba(0,240,255,0.4)]">
        FROC SOBRENATURAL
      </h1>

      <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto mt-3 font-sans leading-relaxed">
        Uma estação inteligente que escuta o ambiente acústico, monitora variações eletromagnéticas,
        cruza sinais em tempo real e destaca automaticamente os momentos de interesse.
      </p>

      {/* Botão Central Gigante: INICIAR INVESTIGAÇÃO */}
      <div className="my-8 flex flex-col items-center justify-center">
        {isInitializing ? (
          <div className="w-full max-w-md bg-[#040812] border border-cyan-500/60 rounded-2xl p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
              <span className="font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span>{initStepText}</span>
              </span>
              <span className="tabular-nums">{progressPercent}%</span>
            </div>

            {/* Barra de Progresso Fluida */}
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Ajustando sensores físicos e rede de inteligência...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleStartClick}
              className="group relative inline-flex items-center justify-center gap-3 px-8 sm:px-12 py-5 sm:py-6 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-500 hover:from-cyan-500 hover:via-teal-500 hover:to-cyan-400 text-white font-mono font-black text-lg sm:text-2xl tracking-wider transition-all duration-200 shadow-[0_0_35px_rgba(0,240,255,0.4)] hover:shadow-[0_0_55px_rgba(0,240,255,0.7)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-cyan-300/60"
            >
              <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white group-hover:translate-x-0.5 transition-transform" />
              <span>INICIAR INVESTIGAÇÃO</span>
            </button>

            <p className="text-xs sm:text-sm text-slate-400 font-mono">
              Microfone, sensores e inteligência serão preparados automaticamente.
            </p>
          </div>
        )}
      </div>

      {/* Seletor de Modo: Simples (Padrão) vs Avançado */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-cyan-950/80 max-w-lg mx-auto">
        <div className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            onClick={() => onToggleExperienceMode('simple')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              experienceMode === 'simple'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/50 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modo Simples (Padrão)
          </button>
          <button
            onClick={() => onToggleExperienceMode('advanced')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              experienceMode === 'advanced'
                ? 'bg-slate-800 text-slate-100 font-bold border border-slate-700 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Modo Avançado</span>
          </button>
        </div>

        {onOpenGuidedMode && (
          <button
            onClick={onOpenGuidedMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-xs font-mono transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>Como Funciona (Guia)</span>
          </button>
        )}
      </div>
    </div>
  );
};

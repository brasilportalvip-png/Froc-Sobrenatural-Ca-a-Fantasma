import React, { useState } from 'react';
import { HelpCircle, ChevronRight, CheckCircle2, Volume2, Mic, X } from 'lucide-react';

interface Props {
  currentStep: 1 | 2 | 3 | 4;
  onDismiss?: () => void;
  onSelectSuggestion?: (prompt: string) => void;
}

export const GuidedInvestigationBanner: React.FC<Props> = ({
  currentStep,
  onDismiss,
  onSelectSuggestion,
}) => {
  const steps = [
    {
      step: 1,
      title: 'Passo 1: Pergunte',
      desc: 'Faça uma pergunta curta em voz alta ou digite abaixo.',
      actionText: 'Ex: "Tem alguém aqui?"',
      suggestion: 'Tem alguém aqui?',
    },
    {
      step: 2,
      title: 'Passo 2: Silêncio',
      desc: 'Aguarde 6 a 10 segundos em silêncio para não contaminar o microfone.',
    },
    {
      step: 3,
      title: 'Passo 3: Análise FROC',
      desc: 'A inteligência está comparando áudio e sensores simultaneamente.',
    },
    {
      step: 4,
      title: 'Passo 4: Revisão',
      desc: 'Se um sinal foi detectado, toque em "OUVIR O MOMENTO" para examinar.',
    },
  ];

  const active = steps[currentStep - 1] || steps[0];

  return (
    <div className="bg-gradient-to-r from-[#0d172e] via-[#091322] to-[#0d172e] border border-cyan-500/40 rounded-xl p-3 sm:p-3.5 shadow-md relative">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-200 p-1 rounded transition cursor-pointer"
          title="Fechar Modo Guiado"
          aria-label="Fechar Modo Guiado"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span className="p-1 rounded bg-cyan-950 border border-cyan-500/50 text-cyan-300">
          <HelpCircle className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
          MODO GUIADO PARA INVESTIGADORES
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 my-2 overflow-x-auto pb-1 no-scrollbar">
        {steps.map((s) => {
          const isCurrent = s.step === currentStep;
          const isDone = s.step < currentStep;

          return (
            <div
              key={s.step}
              className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                isCurrent
                  ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-400/80 shadow'
                  : isDone
                  ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30'
                  : 'text-slate-500 bg-slate-900/40 border border-slate-800'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                  {s.step}
                </span>
              )}
              <span>{s.title}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
        <p className="text-slate-200 font-sans">{active.desc}</p>
        {active.suggestion && onSelectSuggestion && (
          <button
            onClick={() => onSelectSuggestion(active.suggestion!)}
            className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/50 font-mono text-[11px] font-bold cursor-pointer transition"
          >
            Usar sugestão: "{active.suggestion}"
          </button>
        )}
      </div>
    </div>
  );
};

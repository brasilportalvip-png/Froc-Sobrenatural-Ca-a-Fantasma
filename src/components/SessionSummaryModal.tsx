import React, { useState } from 'react';
import { SessionSummary, FrocMoment } from '../types';
import {
  X,
  Sparkles,
  Clock,
  HelpCircle,
  Radio,
  Compass,
  Camera,
  CheckCircle2,
  BookmarkCheck,
  RotateCcw,
  Sliders,
  Play,
  Square,
  Activity,
} from 'lucide-react';
import { CorrelationEngine } from '../services/correlationEngine';

interface Props {
  summary: SessionSummary;
  onClose: () => void;
  onSaveMomentEvidence?: (moment: FrocMoment) => void;
  onNavigateToEvidenceTab?: () => void;
}

export const SessionSummaryModal: React.FC<Props> = ({
  summary,
  onClose,
  onSaveMomentEvidence,
  onNavigateToEvidenceTab,
}) => {
  const [playingMomentId, setPlayingMomentId] = useState<string | null>(null);
  const [activeAudioElement, setActiveAudioElement] = useState<HTMLAudioElement | null>(null);

  const handlePlay = (moment: FrocMoment) => {
    if (playingMomentId === moment.id && activeAudioElement) {
      activeAudioElement.pause();
      setActiveAudioElement(null);
      setPlayingMomentId(null);
      return;
    }

    if (!moment.audioBlob) return;

    if (activeAudioElement) {
      activeAudioElement.pause();
    }

    const url = URL.createObjectURL(moment.audioBlob);
    const audio = new Audio(url);
    setActiveAudioElement(audio);
    setPlayingMomentId(moment.id);

    audio.onended = () => {
      setPlayingMomentId(null);
      setActiveAudioElement(null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setPlayingMomentId(null);
      setActiveAudioElement(null);
      URL.revokeObjectURL(url);
    };

    audio.play().catch(() => {
      setPlayingMomentId(null);
      setActiveAudioElement(null);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#070d19] border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-950/80 bg-[#0a1324]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-300">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-mono font-black text-white uppercase tracking-wider">
                RESUMO DA INVESTIGAÇÃO
              </h2>
              <p className="text-[11px] text-cyan-400 font-mono">
                {summary.sessionTitle} · Duração: {summary.durationFormatted}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
            aria-label="Fechar Resumo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Métricas Principais Consolidadas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#040812] p-3 rounded-xl border border-slate-900 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase">Perguntas</span>
              <span className="text-lg font-mono font-bold text-purple-300 tabular-nums">
                {summary.questionsCount}
              </span>
            </div>
            <div className="bg-[#040812] p-3 rounded-xl border border-slate-900 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase">Possíveis Falas</span>
              <span className="text-lg font-mono font-bold text-cyan-300 tabular-nums">
                {summary.possibleSpeechCount}
              </span>
            </div>
            <div className="bg-[#040812] p-3 rounded-xl border border-slate-900 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase">Eventos Correlacionados</span>
              <span className="text-lg font-mono font-bold text-rose-300 tabular-nums">
                {summary.correlatedMomentsCount}
              </span>
            </div>
            <div className="bg-[#040812] p-3 rounded-xl border border-slate-900 text-center">
              <span className="text-[10px] font-mono text-slate-500 block uppercase">Maior Variação Magnética</span>
              <span className="text-lg font-mono font-bold text-amber-300 tabular-nums">
                +{summary.maxMagneticDeltaUt.toFixed(1)} µT
              </span>
            </div>
          </div>

          {/* Destaque da Janela de Maior Atividade */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900/50 to-cyan-950/40 border border-cyan-500/30 p-3.5 rounded-xl text-xs font-mono flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">
                Janela de Maior Atividade Instrumental:
              </span>
              <strong className="text-cyan-300 text-sm">{summary.peakActivityWindow}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px] uppercase">
                Momentos com Necessidade de Revisão:
              </span>
              <span className="text-rose-300 font-bold text-sm">
                {summary.reviewMomentsCount} momentos
              </span>
            </div>
          </div>

          {/* Seção: DESTAQUES DA INVESTIGAÇÃO */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>DESTAQUES DA INVESTIGAÇÃO</span>
              <span className="text-[10px] text-slate-500 font-normal">
                (Ordenados por relevância instrumental)
              </span>
            </h3>

            {summary.topMoments.length === 0 ? (
              <div className="text-center py-6 text-xs font-mono text-slate-500 bg-[#040812] rounded-xl border border-slate-900">
                Nenhum evento anômalo ou correlação significativa foi detectada durante a sessão.
              </div>
            ) : (
              <div className="space-y-2.5">
                {summary.topMoments.map((moment, index) => {
                  const isPlaying = playingMomentId === moment.id;
                  const hasAudio = !!moment.audioBlob;

                  return (
                    <div
                      key={moment.id}
                      className="bg-[#050b16] border border-cyan-950 hover:border-cyan-500/40 rounded-xl p-3 text-xs font-mono space-y-2 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-400 font-bold">
                              Momento {index + 1} — {moment.relativeTimeFormatted}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                              {moment.coincidingSignalsCount} sinais
                            </span>
                            {moment.confidenceScore !== undefined && moment.confidenceScore > 0 && (
                              <span className="text-[10px] text-emerald-400">
                                {Math.round(moment.confidenceScore * 100)}%
                              </span>
                            )}
                          </div>
                          <p className="text-slate-200 font-sans text-xs mt-1">
                            {moment.description}
                          </p>
                        </div>
                      </div>

                      {/* Botões de Ação do Momento */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
                        {hasAudio ? (
                          <button
                            onClick={() => handlePlay(moment)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              isPlaying
                                ? 'bg-rose-900 text-rose-100 border border-rose-500'
                                : 'bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/50'
                            }`}
                          >
                            {isPlaying ? (
                              <>
                                <Square className="w-3 h-3 fill-current" />
                                <span>Parar</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" />
                                <span>Ouvir Momento</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Sem áudio</span>
                        )}

                        {onSaveMomentEvidence && (
                          <button
                            onClick={() => onSaveMomentEvidence(moment)}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[10px] border border-slate-800 transition cursor-pointer"
                          >
                            <BookmarkCheck className="w-3 h-3 text-cyan-400" />
                            <span>Salvar Evidência</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="px-5 py-3.5 border-t border-cyan-950/80 bg-[#0a1324] flex items-center justify-between flex-wrap gap-2">
          {onNavigateToEvidenceTab && (
            <button
              onClick={() => {
                onClose();
                onNavigateToEvidenceTab();
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-mono transition cursor-pointer"
            >
              Ver Todas Evidências Salvas
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-900 hover:bg-cyan-800 text-white rounded-lg text-xs font-mono font-bold transition cursor-pointer border border-cyan-400 shadow ml-auto"
          >
            Concluir Revisão
          </button>
        </div>
      </div>
    </div>
  );
};

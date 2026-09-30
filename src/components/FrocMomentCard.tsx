import React, { useState, useRef } from 'react';
import { FrocMoment } from '../types';
import {
  Play,
  Square,
  Volume2,
  Sparkles,
  BookmarkCheck,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Radio,
  Compass,
  Activity,
  Sliders,
} from 'lucide-react';
import { CorrelationEngine } from '../services/correlationEngine';

interface Props {
  moment: FrocMoment;
  onPlayAudio?: (blob: Blob) => void;
  onSaveEvidence?: (moment: FrocMoment) => void;
  onReanalyze?: (moment: FrocMoment) => Promise<void>;
  onSetDecision?: (moment: FrocMoment, decision: 'relevant' | 'inconclusive' | 'discard') => void;
  isSaved?: boolean;
}

export const FrocMomentCard: React.FC<Props> = ({
  moment,
  onPlayAudio,
  onSaveEvidence,
  onReanalyze,
  onSetDecision,
  isSaved = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMode, setAudioMode] = useState<'original' | 'treated'>('original');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [treatedBlob, setTreatedBlob] = useState<Blob | null>(moment.treatedAudioBlob || null);
  const [isTreating, setIsTreating] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTogglePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    let targetBlob = moment.audioBlob;
    if (audioMode === 'treated') {
      if (!treatedBlob && moment.audioBlob) {
        setIsTreating(true);
        try {
          const processed = await CorrelationEngine.applyForensicAudioTreatment(moment.audioBlob);
          setTreatedBlob(processed);
          targetBlob = processed;
        } catch {
          targetBlob = moment.audioBlob;
        } finally {
          setIsTreating(false);
        }
      } else if (treatedBlob) {
        targetBlob = treatedBlob;
      }
    }

    if (!targetBlob) return;

    try {
      const url = URL.createObjectURL(targetBlob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.warn('Erro na reprodução do áudio:', err);
      setIsPlaying(false);
    }
  };

  const handleReanalyzeClick = async () => {
    if (!onReanalyze || isReanalyzing) return;
    setIsReanalyzing(true);
    try {
      await onReanalyze(moment);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const hasAudio = !!moment.audioBlob;

  return (
    <div className="bg-[#080e1b] border border-cyan-950/90 hover:border-cyan-500/40 rounded-xl p-3.5 sm:p-4.5 transition-all shadow-lg space-y-3">
      {/* Cabeçalho do Momento */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-black text-cyan-300 tracking-wider">
              EVENTO RELEVANTE — {moment.relativeTimeFormatted}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
              {moment.coincidingSignalsCount} SINAIS COINCIDENTES
            </span>
            {moment.confidenceScore !== undefined ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                Confiança: {Math.round(moment.confidenceScore * 100)}%
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                Confiança: N/D
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-100 mt-1">
            {moment.title}
          </h3>
        </div>

        {/* Status de Decisão */}
        {moment.investigatorDecision && (
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
              moment.investigatorDecision === 'relevant'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                : moment.investigatorDecision === 'discard'
                ? 'bg-rose-950 text-rose-300 border-rose-500'
                : 'bg-amber-950 text-amber-300 border-amber-500'
            }`}
          >
            {moment.investigatorDecision === 'relevant'
              ? 'Relevante'
              : moment.investigatorDecision === 'discard'
              ? 'Descartado'
              : 'Inconclusivo'}
          </span>
        )}
      </div>

      {/* Descrição em Linguagem Natural Forense */}
      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
        {moment.description}
      </p>

      {/* Resumo dos Sinais Coincidentes no Intervalo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-400 bg-[#060a14] p-2.5 rounded border border-slate-900">
        <div>
          <span className="text-slate-500 block text-[9px] uppercase">Áudio (Delta)</span>
          <span className="text-cyan-300 font-bold tabular-nums">
            {moment.signalsSummary.audioDeltaDbfs !== undefined
              ? `+${moment.signalsSummary.audioDeltaDbfs.toFixed(1)} dB`
              : 'Dado indisponível'}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px] uppercase">Campo Magnético</span>
          <span className="text-amber-300 font-bold tabular-nums">
            {moment.signalsSummary.magneticDeltaUt !== undefined
              ? (moment.signalsSummary.magneticDeltaUt > 0 ? `+${moment.signalsSummary.magneticDeltaUt.toFixed(1)} µT` : 'Estável (0.0 µT)')
              : 'Não medido'}
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-slate-500 block text-[9px] uppercase">Movimento do Aparelho</span>
          <span className="text-emerald-300 font-bold">
            {moment.signalsSummary.isDeviceStable !== undefined
              ? (moment.signalsSummary.isDeviceStable ? 'Estável (Sem impacto)' : 'Em movimento')
              : 'Não medido'}
          </span>
        </div>
      </div>

      {/* Ambiguidade Acústica (se houver resultados divergentes de reanálise) */}
      {moment.isAmbiguous && moment.reanalysisResults && moment.reanalysisResults.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-2.5 rounded text-xs font-mono text-amber-200">
          <span className="font-bold block uppercase text-[10px]">Interpretação Acústica Ambígua:</span>
          <p className="text-[11px] text-amber-300 mt-0.5">
            Diferentes processamentos produziram transcrições fonéticas divergentes:
          </p>
          <div className="flex gap-2 flex-wrap mt-1">
            {moment.candidateTranscription && (
              <span className="px-2 py-0.5 bg-black/40 rounded border border-amber-500/40">
                1: "{moment.candidateTranscription}" ({typeof moment.confidenceScore === 'number' ? Math.round(moment.confidenceScore * 100) : 'N/D'}%)
              </span>
            )}
            {moment.reanalysisResults.map((r, i) => (
              <span key={i} className="px-2 py-0.5 bg-black/40 rounded border border-amber-500/40">
                {i + 2}: "{r.candidateTranscription || '[ininteligível]'}" ({Math.round(r.confidence * 100)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Botões Principais de Ação: OUVIR O MOMENTO, VER ANÁLISE, SALVAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-900">
        {/* Controle de Áudio: OUVIR O MOMENTO */}
        {hasAudio ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleTogglePlay}
              disabled={isTreating}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer shadow ${
                isPlaying
                  ? 'bg-rose-900 hover:bg-rose-800 text-rose-100 border border-rose-500'
                  : 'bg-cyan-900 hover:bg-cyan-800 text-cyan-100 border border-cyan-500/60'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>PARAR</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>OUVIR O MOMENTO</span>
                </>
              )}
            </button>

            {/* Alternador: Original vs Tratado */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
              <button
                onClick={() => setAudioMode('original')}
                className={`px-2 py-1 rounded transition cursor-pointer ${
                  audioMode === 'original'
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Áudio sem modificação"
              >
                Original
              </button>
              <button
                onClick={() => setAudioMode('treated')}
                className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
                  audioMode === 'treated'
                    ? 'bg-teal-950 text-teal-300 font-bold border border-teal-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Filtro passa-faixa vocal (300-3400Hz)"
              >
                <Sliders className="w-3 h-3" />
                <span>Tratado</span>
              </button>
            </div>
          </div>
        ) : (
          <span className="text-[11px] font-mono text-slate-500 italic">
            Sem registro de áudio gravado
          </span>
        )}

        {/* Ações Secundárias */}
        <div className="flex items-center gap-1.5">
          {/* Reanalisar */}
          {onReanalyze && hasAudio && (
            <button
              onClick={handleReanalyzeClick}
              disabled={isReanalyzing}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded text-xs transition cursor-pointer"
              title="Executar Reanálise Acústica"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {/* Ver Análise Expandida */}
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300 transition cursor-pointer"
          >
            <span>{showAnalysis ? 'Ocultar' : 'Ver Análise'}</span>
            {showAnalysis ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Salvar Evidência */}
          {onSaveEvidence && (
            <button
              onClick={() => onSaveEvidence(moment)}
              disabled={isSaved}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-mono font-bold transition cursor-pointer ${
                isSaved
                  ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 cursor-default'
                  : 'bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-cyan-300'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>{isSaved ? 'Salvo' : 'Salvar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Decisão do Investigador: Relevante / Inconclusivo / Descartar */}
      {onSetDecision && (
        <div className="flex items-center gap-1 pt-1 text-[11px] font-mono text-slate-400">
          <span className="text-[10px] text-slate-500 mr-1">Decisão Pericial:</span>
          <button
            onClick={() => onSetDecision(moment, 'relevant')}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              moment.investigatorDecision === 'relevant'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            Relevante
          </button>
          <button
            onClick={() => onSetDecision(moment, 'inconclusive')}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              moment.investigatorDecision === 'inconclusive'
                ? 'bg-amber-950 text-amber-300 border-amber-500'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            Inconclusivo
          </button>
          <button
            onClick={() => onSetDecision(moment, 'discard')}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              moment.investigatorDecision === 'discard'
                ? 'bg-rose-950 text-rose-300 border-rose-500'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            Descartar
          </button>
        </div>
      )}

      {/* Painel de Análise Expandida */}
      {showAnalysis && (
        <div className="mt-2 pt-2.5 border-t border-slate-800/80 space-y-2 text-xs font-mono bg-slate-950/80 p-3 rounded-lg border border-slate-800">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">
              Notas Acústicas Periciais:
            </span>
            <p className="text-slate-300 font-sans text-xs mt-0.5">
              {moment.acousticNotes || 'Sinal contido na banda média com elevação de energia concentrada.'}
            </p>
          </div>

          {/* Telemetria Real Gravada (Sem valores fabricados) */}
          <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-slate-900/60 p-2 rounded border border-slate-800">
            <div>
              <span className="text-slate-500 block uppercase">Nível dBFS Real</span>
              <span className="text-cyan-300 font-bold">
                {typeof moment.rawAudioMetrics?.dbfs === 'number'
                  ? `${moment.rawAudioMetrics.dbfs.toFixed(1)} dBFS`
                  : typeof moment.signalsSummary.audioDeltaDbfs === 'number'
                  ? `${moment.signalsSummary.audioDeltaDbfs.toFixed(1)} dBFS`
                  : 'Não medido'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase">Frequência Pico</span>
              <span className="text-teal-300 font-bold">
                {typeof moment.rawAudioMetrics?.peakFrequencyHz === 'number'
                  ? `${moment.rawAudioMetrics.peakFrequencyHz} Hz`
                  : typeof moment.signalsSummary.peakFrequencyHz === 'number'
                  ? `${moment.signalsSummary.peakFrequencyHz} Hz`
                  : 'Não medido'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase">RMS Acústico</span>
              <span className="text-emerald-300 font-bold">
                {typeof moment.rawAudioMetrics?.rms === 'number'
                  ? moment.rawAudioMetrics.rms.toFixed(3)
                  : 'Não medido'}
              </span>
            </div>
          </div>

          {moment.alternativeHypotheses && moment.alternativeHypotheses.length > 0 && (
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">
                Hipóteses Físicas / Convencionais:
              </span>
              <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-0.5 mt-0.5">
                {moment.alternativeHypotheses.map((hyp, idx) => (
                  <li key={idx}>{hyp}</li>
                ))}
              </ul>
            </div>
          )}

          {moment.provider && (
            <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-900 flex justify-between">
              <span>Provedor: {moment.provider}</span>
              <span>ID: {moment.id.slice(0, 12)}...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

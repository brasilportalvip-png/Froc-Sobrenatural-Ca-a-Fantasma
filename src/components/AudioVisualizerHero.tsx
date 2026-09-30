import React, { useEffect, useRef } from 'react';
import { AudioMetrics } from '../services/audioEngine';
import { SensorState, LiveCaptionStatus, FrocActivityLevel } from '../types';
import { Sparkles, Radio, Activity, Volume2, ShieldAlert } from 'lucide-react';

interface Props {
  status: LiveCaptionStatus;
  audioMetrics: AudioMetrics;
  sensorState: SensorState;
  activityLevel: FrocActivityLevel;
  activityExplanation: string;
  hasGemini: boolean;
  analyzingSegmentRange: string | null;
  detectedWord: string | null;
  confidence: number;
}

export const AudioVisualizerHero: React.FC<Props> = ({
  status,
  audioMetrics,
  sensorState,
  activityLevel,
  activityExplanation,
  hasGemini,
  analyzingSegmentRange,
  detectedWord,
  confidence,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Animação canvas responsiva aos dados reais de áudio e sensores
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      phase += 0.05;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Parâmetros extraídos da telemetria real (sem fake random)
      const dbfsNorm = Math.max(0, Math.min(1, (audioMetrics.dbfs + 80) / 60)); // 0 a 1
      const rmsNorm = Math.max(0, Math.min(1, audioMetrics.rms * 10));
      const motion = Math.min(2, sensorState.motion?.magnitude ?? 0);

      const baseRadius = Math.min(width, height) * 0.28;
      const pulseRadius = baseRadius + dbfsNorm * 28 + rmsNorm * 22;

      // Cor do halo conforme o estado real do sistema
      let haloColor = 'rgba(0, 240, 255, '; // Ciano padrão
      if (status === 'possible_speech' || status === 'probable_transcription') {
        haloColor = 'rgba(0, 255, 179, '; // Verde espectral
      } else if (status === 'analyzing') {
        haloColor = 'rgba(168, 85, 247, '; // Roxo / Violeta
      } else if (activityLevel === 'ALTA' || activityLevel === 'ELEVADA') {
        haloColor = 'rgba(244, 63, 94, '; // Rosa / Alerta
      }

      // 1. Halo difuso externo
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.4,
        centerX,
        centerY,
        pulseRadius * 1.35
      );
      gradient.addColorStop(0, haloColor + '0.12)');
      gradient.addColorStop(0.6, haloColor + '0.04)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // 2. Anéis concêntricos suaves
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = haloColor + '0.25)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = haloColor + '0.35)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Onda sonora orbital baseada no timeData real do microfone
      const timeData = audioMetrics.timeData;
      const points = 64;
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = haloColor + '0.85)';

      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        let waveOffset = 0;
        if (timeData && timeData.length > 0) {
          const sampleIndex = Math.floor((i / points) * timeData.length);
          const raw = timeData[sampleIndex];
          waveOffset = (raw - 128) / 128 * (15 + dbfsNorm * 25);
        } else {
          waveOffset = Math.sin(angle * 6 + phase) * (dbfsNorm * 12);
        }

        const r = pulseRadius + waveOffset;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [audioMetrics, sensorState, status, activityLevel]);

  // Formatação do status visual central
  let statusHeadline = 'OUVINDO...';
  let statusSub = 'Monitorando acústica e campo eletromagnético';
  let badgeColor = 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300';

  if (status === 'possible_speech') {
    statusHeadline = 'POSSÍVEL FALA DETECTADA';
    statusSub = detectedWord ? `"${detectedWord}"` : 'Sinal vocal na banda de fala humana';
    badgeColor = 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300';
  } else if (status === 'probable_transcription') {
    statusHeadline = detectedWord ? `"${detectedWord}"` : 'TRANSCRIÇÃO PROVÁVEL';
    statusSub = `Confiança acústica: ${Math.round(confidence * 100)}%`;
    badgeColor = 'bg-emerald-950/90 border-emerald-400 text-emerald-200';
  } else if (status === 'analyzing') {
    statusHeadline = 'ANALISANDO...';
    statusSub = analyzingSegmentRange
      ? `Examinando segmento ${analyzingSegmentRange}`
      : 'Examinando harmônicos e telemetria concomitante';
    badgeColor = 'bg-purple-950/80 border-purple-500/40 text-purple-300';
  } else if (status === 'paused') {
    statusHeadline = 'ESTAÇÃO EM ESPERA';
    statusSub = 'Toque para retomar o monitoramento';
    badgeColor = 'bg-slate-900 border-slate-700 text-slate-400';
  }

  // Cor do indicador de atividade
  const activityColor =
    activityLevel === 'ALTA'
      ? 'text-rose-400 bg-rose-950/60 border-rose-500/50'
      : activityLevel === 'ELEVADA'
      ? 'text-amber-400 bg-amber-950/60 border-amber-500/50'
      : activityLevel === 'MODERADA'
      ? 'text-cyan-400 bg-cyan-950/60 border-cyan-500/50'
      : 'text-slate-400 bg-slate-900/60 border-slate-700/50';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#091122] via-[#050b14] to-[#04070e] border border-cyan-950/90 p-4 sm:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
      {/* Background glow cinematográfico */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

      {/* Barra superior de status inteligente */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 relative z-10">
        {/* IA / DSP Status Pill */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border backdrop-blur-md bg-slate-950/60 border-slate-800 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'analyzing'
                  ? 'bg-purple-400 animate-spin'
                  : status === 'possible_speech'
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-cyan-400 animate-pulse'
              }`}
            />
            {hasGemini ? (
              <span>IA ● {statusHeadline}</span>
            ) : (
              <span>DSP LOCAL ● MONITORANDO SINAL</span>
            )}
          </span>
        </div>

        {/* Índice de Atividade Instrumental */}
        <div className="flex items-center gap-1.5" title={activityExplanation}>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 hidden xs:inline">
            Atividade Instrumental:
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border transition ${activityColor}`}
          >
            {activityLevel}
          </span>
        </div>
      </div>

      {/* Visualizador central e Canvas orbital */}
      <div className="relative flex flex-col items-center justify-center my-2 sm:my-4 min-h-[220px]">
        <canvas
          ref={canvasRef}
          width={320}
          height={220}
          className="w-full max-w-[340px] h-[220px] pointer-events-none"
        />

        {/* Texto central sobreposto */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
          <p className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase mb-1">
            FROC INTELLIGENCE LIVE
          </p>
          <h2 className="text-xl sm:text-2xl font-black font-mono tracking-wider text-white drop-shadow-[0_2px_12px_rgba(0,240,255,0.4)]">
            {statusHeadline}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-1 max-w-sm line-clamp-2">
            {statusSub}
          </p>
        </div>
      </div>

      {/* Rodapé informativo discreto */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-3 border-t border-slate-800/80 relative z-10">
        <span className="truncate pr-2">
          {activityExplanation}
        </span>
        <span className="text-cyan-400 shrink-0 tabular-nums">
          {audioMetrics.dbfs > -90 ? `${audioMetrics.dbfs.toFixed(0)} dBFS` : '-- dBFS'}
        </span>
      </div>
    </div>
  );
};

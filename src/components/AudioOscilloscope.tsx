import React, { useEffect, useRef } from 'react';
import { AudioMetrics } from '../services/audioEngine';

interface Props {
  metrics: AudioMetrics;
  isRecording: boolean;
}

export const AudioOscilloscope: React.FC<Props> = ({ metrics, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Deep dark background
      ctx.fillStyle = '#070c14';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#0e2238';
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw frequency spectrum bars (lower half or background)
      if (metrics.frequencyData && metrics.frequencyData.length > 0) {
        const barCount = Math.min(64, metrics.frequencyData.length / 4);
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const val = metrics.frequencyData[i * 2] / 255;
          const barHeight = val * (height * 0.45);
          ctx.fillStyle = isRecording ? 'rgba(0, 240, 255, 0.25)' : 'rgba(100, 116, 139, 0.15)';
          ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }
      }

      // Draw waveform oscilloscope line
      if (metrics.timeData && metrics.timeData.length > 0) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isRecording ? '#00ffb3' : '#38bdf8';
        ctx.shadowColor = isRecording ? '#00ffb3' : '#38bdf8';
        ctx.shadowBlur = 6;

        const sliceWidth = width / metrics.timeData.length;
        let x = 0;

        for (let i = 0; i < metrics.timeData.length; i++) {
          const v = metrics.timeData[i] / 128.0; // 0 to 2
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      } else {
        // Flat center line if no audio stream
        ctx.beginPath();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [metrics, isRecording]);

  // dBFS calculation (-100 to 0)
  const dbfs = metrics.dbfs;
  const dbfsPercent = Math.max(0, Math.min(100, ((dbfs + 80) / 80) * 100));

  return (
    <div className="bg-[#070c14] border border-cyan-950/80 rounded-lg p-3">
      <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 mb-2">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span>ESPECTRO &amp; OSCILOSCÓPIO</span>
        </span>
        <div className="flex items-center gap-3">
          <span title="Frequência predominante instantânea">
            Pico: <strong className="text-cyan-300 font-bold">{metrics.peakFrequencyHz} Hz</strong>
          </span>
          <span title="Digital decibels relative to Full Scale">
            Nível: <strong className={`${dbfs > -12 ? 'text-amber-400' : 'text-slate-300'}`}>{dbfs.toFixed(1)} dBFS</strong>
          </span>
        </div>
      </div>

      <div className="relative w-full h-24 rounded overflow-hidden border border-slate-800">
        <canvas
          ref={canvasRef}
          width={600}
          height={100}
          className="w-full h-full block"
        />
        {metrics.isVoiceBand && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-[10px] font-mono text-emerald-300">
            Banda de Voz Ativa (250-3400Hz)
          </div>
        )}
      </div>

      {/* dBFS meter scale bar */}
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-[9px] font-mono text-slate-500">
          <span>-80 dBFS</span>
          <span>-40 dBFS</span>
          <span>-18 dBFS (Alvo)</span>
          <span>-3 dBFS</span>
          <span className="text-amber-500/80">0 (Clip)</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-75 ${
              dbfs > -3 ? 'bg-rose-500' : dbfs > -18 ? 'bg-amber-400' : 'bg-cyan-400'
            }`}
            style={{ width: `${dbfsPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { SensorState } from '../types';
import { Magnet, Move, Volume2, AlertTriangle, ShieldCheck, Gauge, RefreshCw, Zap } from 'lucide-react';

interface Props {
  sensorState: SensorState;
  onCalibrateMagneticBaseline: () => void;
  onRequestMotionPermission: () => Promise<boolean>;
}

export const SensorsModule: React.FC<Props> = ({
  sensorState,
  onCalibrateMagneticBaseline,
  onRequestMotionPermission,
}) => {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [history, setHistory] = useState<
    { time: number; magDelta: number; motion: number; dbfs: number }[]
  >([]);

  // Update history array
  useEffect(() => {
    const now = Date.now();
    const entry = {
      time: now,
      magDelta: sensorState.magnetometer.available ? sensorState.magnetometer.delta : 0,
      motion: sensorState.motion.available ? sensorState.motion.magnitude : 0,
      dbfs: sensorState.audioLevel.dbfs,
    };

    setHistory((prev) => {
      const updated = [...prev, entry];
      if (updated.length > 50) updated.shift();
      return updated;
    });
  }, [sensorState]);

  // Draw real-time sensor time series on canvas
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark grid background
    ctx.fillStyle = '#070c14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#142033';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    const step = w / 50;

    // 1. Draw Magnetic Delta line (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    history.forEach((pt, i) => {
      const x = i * step;
      // map magDelta 0 to 50 µT
      const y = h - Math.min(h - 5, (pt.magDelta / 50) * (h - 20) + 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Draw Motion Magnitude line (Amber)
    ctx.beginPath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    history.forEach((pt, i) => {
      const x = i * step;
      // map motion 0 to 20 m/s2
      const y = h - Math.min(h - 5, (pt.motion / 20) * (h - 20) + 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Draw Audio dBFS line (Emerald)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    history.forEach((pt, i) => {
      const x = i * step;
      // map dBFS -100 to 0
      const norm = (pt.dbfs + 100) / 100;
      const y = h - Math.min(h - 5, norm * (h - 20) + 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [history]);

  return (
    <div className="space-y-4">
      {/* 1. Header & Hardware Protocol */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm sm:text-base font-bold text-white font-mono uppercase">
                TELEMETRIA DE SENSORES DE HARDWARE
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Medições reais sem simulação artificial de valores inexistentes
            </p>
          </div>
          <button
            onClick={onCalibrateMagneticBaseline}
            disabled={!sensorState.magnetometer.available}
            className="px-3 py-1.5 bg-cyan-600/30 border border-cyan-400/60 hover:bg-cyan-600/50 disabled:opacity-40 text-cyan-200 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Calibrar Linha de Base Magnética</span>
          </button>
        </div>

        {/* Physical interference notes */}
        <div className="mt-3 p-2.5 rounded bg-[#080d17] border border-slate-800 text-[11px] text-slate-300 font-sans space-y-1">
          <p className="font-bold text-amber-400 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>FONTES ROTINEIRAS DE INTERFERÊNCIA (DESCARTAR ANTES DE CONCLUIR):</span>
          </p>
          <ul className="list-disc list-inside text-slate-400 space-y-0.5 text-[10px] font-mono">
            <li>
              <strong>Ímãs do Alto-falante:</strong> O próprio fone/alto-falante do smartphone gera campo magnético forte e localizado.
            </li>
            <li>
              <strong>Fiação Predial:</strong> Corrente alternada (50/60 Hz) e eletrodomésticos induzem flutuações eletromagnéticas naturais.
            </li>
            <li>
              <strong>Movimento das Mãos:</strong> Girar ou tremer o celular altera o vetor magnético relativo à Terra. Observe o sensor de movimento simultaneamente!
            </li>
          </ul>
        </div>
      </div>

      {/* 2. Sensor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Magnetômetro */}
        <div className="bg-[#090f1a] border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Magnet className="w-4 h-4" />
              <span>MAGNETÔMETRO</span>
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                sensorState.magnetometer.available
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {sensorState.magnetometer.available ? 'HARDWARE ATIVO' : 'INDISPONÍVEL'}
            </span>
          </div>

          {sensorState.magnetometer.available ? (
            <div className="space-y-2 font-mono">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold text-cyan-300">
                  {sensorState.magnetometer.magnitude}
                </span>
                <span className="text-xs text-slate-400">µT (microTesla)</span>
              </div>

              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Linha de Base:</span>
                  <span className="text-slate-300 font-semibold">{sensorState.magnetometer.baseline} µT</span>
                </div>
                <div className="flex justify-between">
                  <span>Variação (Δ):</span>
                  <span
                    className={`font-bold ${
                      sensorState.magnetometer.delta > 5 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    ±{sensorState.magnetometer.delta} µT
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Eixos [X, Y, Z]:</span>
                  <span>
                    [{sensorState.magnetometer.x}, {sensorState.magnetometer.y}, {sensorState.magnetometer.z}]
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-slate-500 py-3 space-y-1">
              <p className="font-semibold text-slate-400">Sensor não exposto no hardware.</p>
              <p className="text-[10px] leading-tight">
                O navegador ou dispositivo não expõe a W3C Magnetometer API. A aplicação NÃO inventa leituras falsas.
              </p>
            </div>
          )}
        </div>

        {/* Sensor de Movimento / Acelerômetro */}
        <div className="bg-[#090f1a] border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Move className="w-4 h-4" />
              <span>MOVIMENTO / INÉRCIA</span>
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                sensorState.motion.available
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {sensorState.motion.available ? 'ATIVO' : 'AGUARDANDO'}
            </span>
          </div>

          {sensorState.motion.available ? (
            <div className="space-y-2 font-mono">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold text-amber-300">
                  {sensorState.motion.magnitude}
                </span>
                <span className="text-xs text-slate-400">m/s²</span>
              </div>

              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Estado:</span>
                  <span className="text-slate-300">
                    {sensorState.motion.magnitude > 2 ? 'Dispositivo em Movimento' : 'Estático'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Aceleração [X, Y, Z]:</span>
                  <span>
                    [{sensorState.motion.x}, {sensorState.motion.y}, {sensorState.motion.z}]
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-slate-400 py-2 space-y-2">
              <p>Permissão de acelerômetro necessária no navegador móvel.</p>
              <button
                onClick={onRequestMotionPermission}
                className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded text-xs cursor-pointer"
              >
                Conceder Acesso ao Acelerômetro
              </button>
            </div>
          )}
        </div>

        {/* Medidor Digital de Áudio em dBFS */}
        <div className="bg-[#090f1a] border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Volume2 className="w-4 h-4" />
              <span>NÍVEL ACÚSTICO DIGITAL</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/40">
              dBFS DIGITAL
            </span>
          </div>

          <div className="space-y-2 font-mono">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-bold text-emerald-300">
                {sensorState.audioLevel.dbfs.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">dBFS</span>
            </div>

            <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800">
              <div className="flex justify-between">
                <span>Pico Espectral:</span>
                <span className="text-cyan-300 font-semibold">{sensorState.audioLevel.peakHz} Hz</span>
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                Nota: dBFS mede escala digital do microfone (-100 a 0 dBFS). Não confunda com decibéis dBSPL calibrados em câmara anecoica.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Série Temporal Multissensorial em Tempo Real */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-3 sm:p-4 space-y-2">
        <div className="flex justify-between items-center text-xs font-mono text-slate-300">
          <span className="font-bold uppercase tracking-wider">
            SÉRIE TEMPORAL SINCRONIZADA DOS SENSORES
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-2 h-0.5 bg-cyan-400 inline-block" /> Mag Δ (µT)
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-0.5 bg-amber-400 inline-block" /> Movimento (m/s²)
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-0.5 bg-emerald-400 inline-block" /> dBFS
            </span>
          </div>
        </div>

        <div className="w-full h-36 rounded overflow-hidden border border-slate-800">
          <canvas ref={chartCanvasRef} width={650} height={140} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { TimelineMarker } from '../types';
import { Radio, HelpCircle, Compass, Sparkles, Camera, ShieldCheck, Flame } from 'lucide-react';

interface Props {
  markers: TimelineMarker[];
  startTime: number;
  currentTimeMs: number;
  onSelectMarker: (marker: TimelineMarker) => void;
  selectedMarkerId?: string | null;
}

export const SessionTimeline: React.FC<Props> = ({
  markers,
  startTime,
  currentTimeMs,
  onSelectMarker,
  selectedMarkerId,
}) => {
  const sessionDurationMs = Math.max(1000, currentTimeMs - startTime);

  const getMarkerIcon = (type: TimelineMarker['type']) => {
    switch (type) {
      case 'question':
        return HelpCircle;
      case 'speech':
        return Radio;
      case 'magnetic':
        return Compass;
      case 'visual':
        return Camera;
      case 'ouija':
        return Flame;
      case 'evidence':
        return ShieldCheck;
      case 'moment':
      default:
        return Sparkles;
    }
  };

  const getMarkerColor = (type: TimelineMarker['type']) => {
    switch (type) {
      case 'question':
        return 'bg-purple-500 text-purple-200 border-purple-400';
      case 'speech':
        return 'bg-cyan-500 text-cyan-100 border-cyan-300';
      case 'magnetic':
        return 'bg-amber-500 text-amber-100 border-amber-300';
      case 'visual':
        return 'bg-teal-500 text-teal-100 border-teal-300';
      case 'ouija':
        return 'bg-indigo-500 text-indigo-100 border-indigo-300';
      case 'evidence':
        return 'bg-emerald-500 text-emerald-100 border-emerald-300';
      case 'moment':
      default:
        return 'bg-rose-500 text-rose-100 border-rose-300 animate-pulse';
    }
  };

  return (
    <div className="bg-[#060a14] border border-cyan-950/80 rounded-xl p-3 sm:p-4 space-y-2">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span>MAPA TEMPORAL DA SESSÃO</span>
          <span className="text-[10px] text-slate-500">({markers.length} eventos)</span>
        </span>
        <span className="text-slate-400 tabular-nums">
          00:00 ─── {formatRelative(sessionDurationMs)}
        </span>
      </div>

      {/* Trilha horizontal interativa */}
      <div className="relative w-full h-10 flex items-center my-1">
        {/* Linha guia de fundo */}
        <div className="absolute left-0 right-0 h-1 bg-slate-800/80 rounded-full" />
        <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-900 via-teal-900 to-cyan-700 rounded-full" />

        {/* Marcadores posicionados proporcionalmente */}
        {markers.map((marker) => {
          const markerOffsetMs = Math.max(0, marker.timestampMs - startTime);
          const percent = Math.min(100, Math.max(0, (markerOffsetMs / sessionDurationMs) * 100));
          const Icon = getMarkerIcon(marker.type);
          const colorClass = getMarkerColor(marker.type);
          const isSelected = selectedMarkerId === marker.id;

          return (
            <button
              key={marker.id}
              onClick={() => onSelectMarker(marker)}
              style={{ left: `calc(${percent}% - 12px)` }}
              className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-transform cursor-pointer shadow-md hover:scale-125 z-10 ${colorClass} ${
                isSelected ? 'ring-2 ring-white scale-125' : ''
              }`}
              title={`[${marker.relativeTimeFormatted}] ${marker.label}: ${marker.summary}`}
              aria-label={`Evento ${marker.label} às ${marker.relativeTimeFormatted}`}
            >
              <Icon className="w-3 h-3" />
            </button>
          );
        })}
      </div>

      {/* Legenda dos Marcadores */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span>Pergunta</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            <span>Fala Captada</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span>Magnetismo</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
            <span>Visual</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
            <span>Ouija</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Evidência</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span>Momento Correlacionado</span>
          </span>
        </div>
        <span className="text-slate-500 italic hidden sm:inline">
          Toque em qualquer ponto para detalhes
        </span>
      </div>
    </div>
  );
};

function formatRelative(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

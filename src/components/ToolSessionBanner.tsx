import React from 'react';
import { PremiumToolId } from '../types';
import { useToolSession } from '../services/ToolSessionContext';
import { Clock, RefreshCw, XCircle, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  toolId: PremiumToolId;
  onOpenWallet?: () => void;
}

export const ToolSessionBanner: React.FC<Props> = ({ toolId, onOpenWallet }) => {
  const {
    pricing,
    sessions,
    remainingSeconds,
    isRenewing,
    renewSession,
    toggleAutoRenew,
    endSession,
    isSessionActive,
  } = useToolSession();

  const active = isSessionActive(toolId);
  const session = sessions[toolId];
  const secsLeft = remainingSeconds[toolId] ?? 0;
  const toolInfo = pricing ? pricing[toolId] : null;

  if (!active || !session) return null;

  const minutes = Math.floor(secsLeft / 60);
  const seconds = secsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isLowTime = secsLeft <= 60;
  const isCriticalTime = secsLeft <= 20;

  return (
    <div
      className={`w-full mb-4 px-3 sm:px-4 py-2.5 rounded-lg border font-mono transition-all duration-300 ${
        isCriticalTime
          ? 'bg-rose-950/80 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse'
          : isLowTime
          ? 'bg-amber-950/70 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
          : 'bg-cyan-950/60 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Tool Name & Active Indicator */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isCriticalTime ? 'bg-rose-400' : 'bg-emerald-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isCriticalTime ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
            />
          </span>

          <div className="flex flex-col">
            <span className="font-bold text-slate-200 tracking-wide">
              {toolInfo?.name || 'Sessão em Andamento'}
            </span>
            <span className="text-[10px] text-slate-400">
              {session.renewalCount > 0
                ? `${session.renewalCount}ª renovação ativa`
                : 'Sessão temporizada ativa'}
            </span>
          </div>
        </div>

        {/* Center: Digital Countdown Timer */}
        <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-md border border-slate-700/60">
          <Clock
            className={`w-4 h-4 ${
              isCriticalTime
                ? 'text-rose-400'
                : isLowTime
                ? 'text-amber-400'
                : 'text-cyan-400'
            }`}
          />
          <span
            className={`text-base font-bold tracking-widest ${
              isCriticalTime
                ? 'text-rose-300'
                : isLowTime
                ? 'text-amber-300'
                : 'text-cyan-300'
            }`}
          >
            {formattedTime}
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">restantes</span>
        </div>

        {/* Right: Auto-renew toggle & Actions */}
        <div className="flex items-center gap-3">
          {/* Auto-renew checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={!!session.autoRenew}
              onChange={(e) => toggleAutoRenew(toolId, e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
            />
            <span className="text-[11px]">Auto-renovar (+4 min / 5 créditos)</span>
          </label>

          {/* Manual renew button */}
          <button
            onClick={() => renewSession(toolId)}
            disabled={isRenewing[toolId]}
            className="px-2.5 py-1 bg-cyan-900/70 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/50 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
            title="Renovar por mais 4 minutos (5 créditos)"
          >
            <RefreshCw
              className={`w-3 h-3 ${isRenewing[toolId] ? 'animate-spin' : ''}`}
            />
            <span>+4 min</span>
          </button>

          {/* End session button */}
          <button
            onClick={() => endSession(toolId)}
            className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="Encerrar sessão da ferramenta"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

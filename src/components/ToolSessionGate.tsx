import React, { useState } from 'react';
import { PremiumToolId } from '../types';
import { useToolSession } from '../services/ToolSessionContext';
import { useAuth } from '../services/AuthContext';
import { ToolSessionBanner } from './ToolSessionBanner';
import {
  Clock,
  Sparkles,
  Lock,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Play,
  RefreshCw,
  LogIn,
} from 'lucide-react';

interface Props {
  toolId: PremiumToolId;
  children: React.ReactNode;
  onOpenWallet?: () => void;
  onOpenAuth?: () => void;
}

export const ToolSessionGate: React.FC<Props> = ({
  toolId,
  children,
  onOpenWallet,
  onOpenAuth,
}) => {
  const { user, wallet } = useAuth();
  const {
    pricing,
    sessions,
    isStarting,
    isRenewing,
    startSession,
    renewSession,
    isSessionActive,
  } = useToolSession();

  const [autoRenewOptIn, setAutoRenewOptIn] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const active = isSessionActive(toolId);
  const session = sessions[toolId];
  const toolInfo = pricing ? pricing[toolId] : null;

  const isExpired = session?.status === 'expired';
  const balance = wallet?.balance ?? 0;
  const cost = toolInfo?.costCredits ?? 5;
  const durationMinutes = (toolInfo?.durationSeconds ?? 240) / 60;
  const hasEnoughCredits = balance >= cost;

  // Se a sessão estiver ativa, renderiza a ferramenta normalmente com a barra de controle no topo
  if (active) {
    return (
      <div className="w-full">
        <ToolSessionBanner toolId={toolId} onOpenWallet={onOpenWallet} />
        {children}
      </div>
    );
  }

  // Se não estiver ativa, renderiza o Gate Transparente
  const handleStart = async () => {
    setStartError(null);
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!hasEnoughCredits) {
      if (onOpenWallet) onOpenWallet();
      return;
    }

    const res = await startSession(toolId, autoRenewOptIn);
    if (!res.success) {
      setStartError(res.error || 'Não foi possível iniciar a sessão.');
    }
  };

  const handleRenew = async () => {
    setStartError(null);
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!hasEnoughCredits) {
      if (onOpenWallet) onOpenWallet();
      return;
    }

    const res = await renewSession(toolId);
    if (!res.success) {
      setStartError(res.error || 'Não foi possível renovar a sessão.');
    }
  };

  return (
    <div className="w-full min-h-[480px] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#090f1a] border border-cyan-500/30 rounded-xl p-6 sm:p-8 font-mono shadow-[0_0_30px_rgba(6,182,212,0.15)] text-center relative overflow-hidden">
        {/* Glow corner accents */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Icon & Title */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.2)]">
          {isExpired ? (
            <Clock className="w-7 h-7 text-amber-400 animate-pulse" />
          ) : (
            <Lock className="w-7 h-7 text-cyan-400" />
          )}
        </div>

        <h2 className="text-lg font-bold text-slate-100 tracking-wide mb-1">
          {toolInfo?.name || 'Ferramenta de Investigação'}
        </h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          {toolInfo?.description ||
            'Módulo de perícia e telemetria com controle de sessões temporizadas autoritativas.'}
        </p>

        {/* Status Callout (Expired vs Pre-start) */}
        {isExpired ? (
          <div className="bg-amber-950/60 border border-amber-500/50 rounded-lg p-3.5 mb-5 text-left text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-bold mb-1">
              <AlertCircle className="w-4 h-4" />
              <span>Seu período de {durationMinutes} minutos terminou.</span>
            </div>
            <p className="text-slate-300 text-[11px]">
              A ferramenta foi pausada para controle de consumo. Você pode renovar por mais{' '}
              {durationMinutes} minutos por {cost} créditos ou encerrar a atividade.
            </p>
          </div>
        ) : (
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 mb-5 text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Clock className="w-4 h-4" />
                <span>Duração da Sessão:</span>
              </span>
              <span className="font-bold text-white">{durationMinutes} minutos ({durationMinutes * 60}s)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Sparkles className="w-4 h-4" />
                <span>Custo Fixo:</span>
              </span>
              <span className="font-bold text-white">{cost} créditos</span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              Durante os {durationMinutes} minutos você tem acesso completo contínuo à ferramenta,
              sem custos avulsos adicionais.
            </div>
          </div>
        )}

        {/* Balance Status */}
        <div className="flex items-center justify-between bg-black/50 border border-slate-800 px-3.5 py-2.5 rounded-lg mb-5 text-xs">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            <span>Seu Saldo:</span>
          </span>
          <span className={`font-bold ${hasEnoughCredits ? 'text-emerald-400' : 'text-rose-400'}`}>
            {user ? `${balance} créditos` : 'Não autenticado'}
          </span>
        </div>

        {/* Opt-in Checkbox for Auto-Renew (Transparent & Opt-in Only) */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 mb-5 text-left">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRenewOptIn}
              onChange={(e) => setAutoRenewOptIn(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
            />
            <div className="text-[11px] text-slate-300">
              <span className="font-bold block text-slate-200">
                Renovar automaticamente a cada {durationMinutes} minutos por {cost} créditos
              </span>
              <span className="text-[10px] text-slate-400">
                Opção explícita. Você pode desativar a qualquer momento durante a sessão.
              </span>
            </div>
          </label>
        </div>

        {/* Error message */}
        {startError && (
          <div className="mb-4 p-2.5 bg-rose-950/70 border border-rose-500 rounded text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{startError}</span>
          </div>
        )}

        {/* CTA Buttons */}
        {!user ? (
          <button
            onClick={() => onOpenAuth && onOpenAuth()}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.25)] transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Entrar com Conta para Iniciar</span>
          </button>
        ) : !hasEnoughCredits ? (
          <button
            onClick={() => onOpenWallet && onOpenWallet()}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.25)] transition cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            <span>Saldo Insuficiente · Adquirir Créditos</span>
          </button>
        ) : isExpired ? (
          <button
            onClick={handleRenew}
            disabled={isRenewing[toolId]}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.25)] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRenewing[toolId] ? 'animate-spin' : ''}`} />
            <span>Renovar por mais {durationMinutes} minutos — {cost} créditos</span>
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={isStarting[toolId]}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.25)] transition cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isStarting[toolId] ? 'animate-spin' : ''}`} />
            <span>Iniciar Sessão ({cost} Créditos)</span>
          </button>
        )}
      </div>
    </div>
  );
};

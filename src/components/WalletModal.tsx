import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { CreditPackage } from '../types';
import {
  Wallet,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  History,
  Gift,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Lock,
} from 'lucide-react';

export const WalletModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    wallet,
    ledger,
    packages,
    claimFreeBonus,
    refreshWallet,
    getIdToken,
    sendVerificationEmail,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'balance' | 'packages' | 'ledger' | 'rules'>('balance');
  const [claimStatus, setClaimStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClaimBonus = async () => {
    setClaiming(true);
    setClaimStatus(null);
    try {
      const res = await claimFreeBonus();
      setClaimStatus({
        message: res.message,
        isError: !res.success,
      });
    } catch (err: any) {
      setClaimStatus({
        message: err.message || 'Erro ao resgatar.',
        isError: true,
      });
    } finally {
      setClaiming(false);
    }
  };

  const handleBuyPackage = async (pack: CreditPackage) => {
    if (!user) return;
    setBuyingId(pack.id);
    setOrderNotice(null);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId: pack.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao iniciar pedido.');
      }

      if (data.mercadoPagoInitPoint) {
        window.location.href = data.mercadoPagoInitPoint;
      } else {
        setOrderNotice(`Pedido #${data.id} gerado com sucesso! Aguardando configuração do Access Token Mercado Pago pelo administrador.`);
      }
    } catch (err: any) {
      setOrderNotice(`Falha: ${err.message}`);
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#080d16] border border-cyan-500/50 rounded-xl shadow-2xl p-5 text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                CARTEIRA &amp; CRÉDITOS PERICIAIS
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {user ? user.email : 'Investigador não autenticado'} · Gestão transparente e auditável
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 font-mono text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="flex border-b border-slate-800/80 mt-3 gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab('balance')}
            className={`pb-2 px-2 border-b-2 font-semibold transition cursor-pointer ${
              activeTab === 'balance'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Meu Saldo
          </button>
          <button
            onClick={() => setActiveTab('packages')}
            className={`pb-2 px-2 border-b-2 font-semibold transition cursor-pointer ${
              activeTab === 'packages'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Comprar Créditos
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-2 px-2 border-b-2 font-semibold transition cursor-pointer ${
              activeTab === 'ledger'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Extrato Auditoria
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-2 px-2 border-b-2 font-semibold transition cursor-pointer ${
              activeTab === 'rules'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Regras &amp; Preços
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* TAB 1: MEU SALDO */}
          {activeTab === 'balance' && (
            <div className="space-y-4">
              {/* Saldo Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div className="bg-[#0b1322] border border-cyan-500/50 p-3 rounded-lg space-y-1">
                  <span className="text-[10px] text-cyan-300 uppercase tracking-wide block">Disponível</span>
                  <strong className="text-2xl text-cyan-200 block">
                    {wallet ? wallet.balance : 0}
                  </strong>
                  <span className="text-[10px] text-slate-400">
                    ≈ {wallet ? Math.floor(wallet.balance / 5) : 0} consultas
                  </span>
                </div>

                <div className="bg-[#0b1322] border border-slate-800 p-3 rounded-lg space-y-1">
                  <span className="text-[10px] text-amber-400 uppercase tracking-wide block">Reservado</span>
                  <strong className="text-xl text-amber-300 block">
                    {wallet ? wallet.reserved : 0}
                  </strong>
                  <span className="text-[10px] text-slate-400">Em análise ativa</span>
                </div>

                <div className="bg-[#0b1322] border border-slate-800 p-3 rounded-lg space-y-1">
                  <span className="text-[10px] text-purple-400 uppercase tracking-wide block">Promocional</span>
                  <strong className="text-xl text-purple-300 block">
                    {wallet ? wallet.promotionalGranted : 0}
                  </strong>
                  <span className="text-[10px] text-slate-400">Bônus concedido</span>
                </div>

                <div className="bg-[#0b1322] border border-slate-800 p-3 rounded-lg space-y-1">
                  <span className="text-[10px] text-emerald-400 uppercase tracking-wide block">Comprados</span>
                  <strong className="text-xl text-emerald-300 block">
                    {wallet ? wallet.purchasedTotal : 0}
                  </strong>
                  <span className="text-[10px] text-slate-400">Via Mercado Pago</span>
                </div>
              </div>

              {/* Bônus de 25 Créditos Banner */}
              {user && (!wallet || wallet.promotionalGranted === 0) && (
                <div className="bg-gradient-to-r from-cyan-950/80 via-[#0b1526] to-cyan-950/80 border border-cyan-500/60 p-3.5 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-cyan-400" />
                    <strong className="text-xs font-mono text-cyan-200 uppercase">
                      25 CRÉDITOS PARA EXPERIMENTAR · ATÉ 5 CONSULTAS
                    </strong>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                    Novos pesquisadores com e-mail verificado recebem 25 créditos cortesia uma única vez para testar a estação pericial e a cadeia de evidências.
                  </p>

                  {!user.emailVerified ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Verifique seu e-mail antes de resgatar o bônus.
                      </span>
                      <button
                        onClick={sendVerificationEmail}
                        className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 text-white rounded text-[11px] font-mono cursor-pointer"
                      >
                        Reenviar E-mail
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleClaimBonus}
                      disabled={claiming}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold cursor-pointer transition shadow"
                    >
                      {claiming ? 'Processando...' : 'Resgatar 25 Créditos de Boas-Vindas'}
                    </button>
                  )}

                  {claimStatus && (
                    <p
                      className={`text-[11px] font-mono p-2 rounded ${
                        claimStatus.isError ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                      }`}
                    >
                      {claimStatus.message}
                    </p>
                  )}
                </div>
              )}

              {/* Informações de transparência */}
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg space-y-1.5 text-xs font-mono text-slate-300">
                <span className="font-bold text-cyan-400 block uppercase">
                  TRANSPARÊNCIA DO CUSTO POR CONSULTA:
                </span>
                <p className="text-slate-400 text-[11px]">
                  • Cada consulta pericial confirmada custa exatamente <strong>5 créditos</strong>.
                </p>
                <p className="text-slate-400 text-[11px]">
                  • O saldo de créditos é mantido exclusivamente no backend com transações atômicas seguras no Firestore.
                </p>
                <p className="text-slate-400 text-[11px]">
                  • Se houver falha técnica de processamento ou erro de rede, os 5 créditos são estornados automaticamente.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: COMPRAR CRÉDITOS */}
          {activeTab === 'packages' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 font-sans">
                Selecione um pacote de créditos para recarga via <strong>Mercado Pago (Checkout Pro)</strong> com confirmação segura e imediata.
              </p>

              {orderNotice && (
                <div className="p-2.5 rounded bg-cyan-950/70 border border-cyan-500 text-xs font-mono text-cyan-200">
                  {orderNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {packages.map((pack) => {
                  const hasPrice = pack.active && pack.priceInCentsBRL > 0;
                  const formattedBRL = (pack.priceInCentsBRL / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  });

                  return (
                    <div
                      key={pack.id}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between font-mono space-y-3 ${
                        hasPrice
                          ? 'bg-[#0b1424] border-cyan-500/50 hover:border-cyan-400'
                          : 'bg-slate-950/50 border-slate-800 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-baseline">
                          <strong className="text-lg text-white font-bold">{pack.credits} Créditos</strong>
                          <span className="text-[10px] text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded">
                            {pack.consultationsEquivalent} Consultas
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{pack.description}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        {hasPrice ? (
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-slate-400">Valor oficial:</span>
                            <strong className="text-base text-emerald-400">{formattedBRL}</strong>
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-400/90 italic">
                            Preço em configuração pelo proprietário
                          </div>
                        )}

                        <button
                          onClick={() => handleBuyPackage(pack)}
                          disabled={!hasPrice || buyingId === pack.id}
                          className={`w-full py-2 rounded text-xs font-bold font-mono transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            hasPrice
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{buyingId === pack.id ? 'Gerando Pedido...' : 'Comprar com Mercado Pago'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: EXTRATO AUDITORIA */}
          {activeTab === 'ledger' && (
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center pb-1 text-slate-400 text-[11px]">
                <span>ÚLTIMOS LANÇAMENTOS DO LEDGER IMUTÁVEL</span>
                <button
                  onClick={refreshWallet}
                  className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Atualizar</span>
                </button>
              </div>

              {ledger.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Nenhuma movimentação registrada nesta carteira.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {ledger.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2 rounded bg-slate-900/70 border border-slate-800 flex justify-between items-center text-[11px]"
                    >
                      <div>
                        <strong className="text-slate-200 block">{entry.description}</strong>
                        <span className="text-[10px] text-slate-500">
                          {new Date(entry.timestamp).toLocaleString('pt-BR')} {entry.referenceId && `· Ref: ${entry.referenceId}`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-bold block ${
                            entry.amount > 0
                              ? 'text-emerald-400'
                              : entry.amount < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                        </span>
                        <span className="text-[10px] text-slate-500">Saldo: {entry.balanceAfter}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REGRAS E POLÍTICAS */}
          {activeTab === 'rules' && (
            <div className="space-y-2.5 text-xs text-slate-300 font-sans leading-relaxed">
              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                <strong className="text-cyan-400 font-mono block">1. DEFINIÇÃO DE CONSULTA COBRADA</strong>
                <p className="text-slate-400 text-[11px]">
                  Uma consulta é cobrada (5 créditos) quando um sinal de áudio e dados de telemetria são enviados para análise e o motor pericial conclui o processamento com êxito. Inclusive respostas categorizadas como "Nenhuma resposta identificada" consomem os créditos pois envolveram medição espectral e inferência rigorosa.
                </p>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                <strong className="text-cyan-400 font-mono block">2. ESTORNOS AUTOMÁTICOS EM CASO DE FALHA</strong>
                <p className="text-slate-400 text-[11px]">
                  Se ocorrer queda de conexão, indisponibilidade do modelo de IA ou falha do servidor antes da conclusão do resultado, a reserva de 5 créditos é desfeita de forma atômica e os créditos retornam à carteira.
                </p>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                <strong className="text-cyan-400 font-mono block">3. POLÍTICA DE VALIDADE DOS CRÉDITOS</strong>
                <p className="text-slate-400 text-[11px]">
                  Os créditos adquiridos ou promocionais não possuem prazo de expiração configurado e permanecem vinculados indefinidamente ao UID do investigador.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Processamento com isolamento transacional</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-mono cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

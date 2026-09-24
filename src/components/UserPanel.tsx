import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import { CreditPackage, OrderItem, Session } from '../types';
import { loadSessions } from '../services/storage';
import {
  User,
  Wallet,
  ShoppingBag,
  FolderLock,
  Settings,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Gift,
  ExternalLink,
  CheckCircle,
  Clock,
  ArrowLeft,
  Lock,
  Layers,
  FileText,
  Mail,
  LogOut,
  CreditCard,
} from 'lucide-react';

interface UserPanelProps {
  onBackToApp: () => void;
  onOpenAuth: () => void;
  onOpenWalletModal: () => void;
}

export const UserPanel: React.FC<UserPanelProps> = ({
  onBackToApp,
  onOpenAuth,
  onOpenWalletModal,
}) => {
  const {
    user,
    wallet,
    ledger,
    packages,
    refreshWallet,
    claimFreeBonus,
    sendVerificationEmail,
    reloadUser,
    logoutUser,
    getIdToken,
  } = useAuth();

  const [activeSection, setActiveSection] = useState<
    'overview' | 'wallet' | 'orders' | 'investigations' | 'account'
  >('overview');

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<Session[]>([]);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [bonusFeedback, setBonusFeedback] = useState<{ message: string; isError: boolean } | null>(
    null
  );
  const [verificationSent, setVerificationSent] = useState(false);

  // Carregar pedidos e sessões locais
  useEffect(() => {
    if (user) {
      loadOrders();
    }
    loadLocalInvestigations();
  }, [user]);

  const loadOrders = async () => {
    try {
      setLoadingOrders(true);
      setOrdersError(null);
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/user/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data);
      } else {
        setOrdersError(data.error || 'Não foi possível carregar os pedidos.');
      }
    } catch (err: any) {
      console.warn('[UserPanel] Erro ao carregar pedidos:', err);
      setOrdersError(err.message || 'Erro de conexão ao carregar pedidos.');
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadLocalInvestigations = async () => {
    try {
      const sess = await loadSessions();
      setLocalSessions(sess);
    } catch (err) {
      console.warn('[UserPanel] Erro ao carregar investigações locais:', err);
    }
  };

  const handleClaim = async () => {
    setClaimingBonus(true);
    setBonusFeedback(null);
    try {
      const res = await claimFreeBonus();
      setBonusFeedback({
        message: res.message,
        isError: !res.success,
      });
    } catch (err: any) {
      setBonusFeedback({
        message: err.message || 'Erro ao resgatar créditos de boas-vindas.',
        isError: true,
      });
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleSendVerification = async () => {
    try {
      await sendVerificationEmail();
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 8000);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar e-mail de verificação.');
    }
  };

  const handleCheckVerification = async () => {
    try {
      setCheckingVerification(true);
      await reloadUser();
    } catch (err: any) {
      console.warn('[UserPanel] Erro ao recarregar status de verificação:', err);
    } finally {
      setCheckingVerification(false);
    }
  };

  // Se não autenticado, apresentar tela de bloqueio e redirecionamento amigável
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 my-8">
        <div className="bg-[#070d18] border border-cyan-500/30 rounded-xl p-8 text-center shadow-2xl backdrop-blur-md">
          <Lock className="w-12 h-12 text-cyan-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-bold font-mono text-cyan-200 mb-2">
            Acesso Restrito ao Painel do Investigador
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            O painel de controle, extrato de créditos e histórico de pedidos requer autenticação
            segura para preservar a cadeia de custódia e sigilo dos dados.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onOpenAuth}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold rounded-lg shadow-lg cursor-pointer transition"
            >
              Fazer Login / Cadastrar
            </button>
            <button
              onClick={onBackToApp}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded-lg cursor-pointer transition flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar aos Instrumentos
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusLabelMap: Record<string, { label: string; color: string }> = {
    created: { label: 'Iniciado', color: 'text-amber-400 border-amber-500/40 bg-amber-950/30' },
    pending: { label: 'Aguardando Pagamento', color: 'text-amber-300 border-amber-500/50 bg-amber-950/40' },
    approved: { label: 'Aprovado & Creditado', color: 'text-emerald-400 border-emerald-500/50 bg-emerald-950/40' },
    declined: { label: 'Recusado pelo Provedor', color: 'text-rose-400 border-rose-500/40 bg-rose-950/30' },
    refunded: { label: 'Estornado / Reembolsado', color: 'text-purple-400 border-purple-500/40 bg-purple-950/30' },
    cancelled: { label: 'Cancelado', color: 'text-slate-400 border-slate-600 bg-slate-900' },
    expired: { label: 'Expirado', color: 'text-slate-500 border-slate-700 bg-slate-900/50' },
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6">
      {/* Top Banner de Navegação e Retorno */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#070d18] border border-cyan-500/30 rounded-xl p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToApp}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 rounded-lg cursor-pointer transition"
            title="Voltar aos Instrumentos de Investigação"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold font-mono text-cyan-300 tracking-wide">
                PAINEL DO INVESTIGADOR
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                PRODUÇÃO
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Identificação: {user.email} {user.emailVerified ? '• Verificado' : '• Não Verificado'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => refreshWallet()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 rounded cursor-pointer transition"
            title="Sincronizar dados em tempo real com o servidor"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={onOpenWalletModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/60 text-xs font-mono text-cyan-200 rounded cursor-pointer transition shadow"
          >
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            <span>{wallet?.balance || 0} Créditos</span>
          </button>
        </div>
      </div>

      {/* Navegação Interna do Painel */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-slate-800 pb-2">
        {[
          { id: 'overview' as const, label: 'Visão Geral', icon: ShieldCheck },
          { id: 'wallet' as const, label: 'Minha Carteira & Extrato', icon: Wallet },
          { id: 'orders' as const, label: 'Minhas Compras', icon: ShoppingBag },
          { id: 'investigations' as const, label: 'Minhas Investigações', icon: FolderLock },
          { id: 'account' as const, label: 'Minha Conta', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
                isActive
                  ? 'bg-cyan-950/80 border border-cyan-500/80 text-cyan-300 shadow-md'
                  : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo Dinâmico por Seção */}

      {/* 1. VISÃO GERAL */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Alerta de Verificação de E-mail se pendente */}
          {!user.emailVerified && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold font-mono text-amber-200">
                    E-mail ainda não verificado
                  </h4>
                  <p className="text-[11px] text-amber-300/80">
                    Para resgatar os 25 créditos gratuitos de boas-vindas e garantir recuperação de conta, confirme o link enviado.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCheckVerification}
                  disabled={checkingVerification}
                  className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 text-xs font-mono rounded cursor-pointer transition flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingVerification ? 'animate-spin' : ''}`} />
                  <span>{checkingVerification ? 'Verificando...' : 'Já confirmei'}</span>
                </button>
                <button
                  onClick={handleSendVerification}
                  disabled={verificationSent}
                  className="px-3 py-1.5 bg-amber-900/60 hover:bg-amber-800/80 border border-amber-500/50 text-amber-200 text-xs font-mono rounded cursor-pointer transition"
                >
                  {verificationSent ? 'Link Reenviado!' : 'Reenviar E-mail'}
                </button>
              </div>
            </div>
          )}

          {/* Cards de Métricas da Carteira */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#081120] border border-cyan-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">SALDO DISPONÍVEL</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-cyan-300">
                {wallet?.balance ?? 0}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {wallet ? Math.floor(wallet.balance / 5) : 0} consultas forenses
              </span>
            </div>

            <div className="bg-[#081120] border border-amber-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">RESERVADO EM ANÁLISE</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-amber-400">
                {wallet?.reserved ?? 0}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Protegido contra execução dupla
              </span>
            </div>

            <div className="bg-[#081120] border border-emerald-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">BÔNUS / PROMOCIONAL</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">
                {wallet?.promotionalGranted ?? 0}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Concessão única de 25 créditos
              </span>
            </div>

            <div className="bg-[#081120] border border-purple-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">COMPRADOS / GASTOS</span>
              <div className="text-xl sm:text-2xl font-mono font-bold text-purple-300">
                {wallet?.purchasedTotal ?? 0} <span className="text-xs text-slate-400">/ {wallet?.spentTotal ?? 0}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Adquiridos via Mercado Pago / Utilizados
              </span>
            </div>
          </div>

          {/* Dívida Compensatória se houver estorno */}
          {(wallet?.debtAmount ?? 0) > 0 && (
            <div className="bg-rose-950/30 border border-rose-500/50 rounded-xl p-4 text-xs font-mono text-rose-300 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold">Dívida Compensatória Ativa: {wallet?.debtAmount} créditos</p>
                <p className="text-[11px] text-rose-300/80">
                  Um estorno ou cancelamento de pagamento ocorreu após o consumo dos créditos. Novos créditos adquiridos quitarão o saldo antes de novas consultas.
                </p>
              </div>
            </div>
          )}

          {/* Banner Bônus de 25 Créditos */}
          <div className="bg-gradient-to-r from-blue-950/60 to-cyan-950/60 border border-cyan-500/50 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-400/40 flex items-center justify-center shrink-0">
                <Gift className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-mono text-cyan-200">
                  Bônus Forense de Boas-Vindas: 25 Créditos Gratuitos
                </h3>
                <p className="text-xs text-slate-300 max-w-xl">
                  Cada conta com e-mail verificado tem direito a 25 créditos gratuitos concedidos uma única vez pelo servidor, equivalente a 5 consultas forenses completas com orquestrador de IA.
                </p>
                {bonusFeedback && (
                  <p
                    className={`text-xs font-mono mt-1 ${
                      bonusFeedback.isError ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {bonusFeedback.message}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleClaim}
              disabled={claimingBonus || (wallet?.promotionalGranted ?? 0) > 0}
              className={`px-4 py-2 font-mono text-xs font-bold rounded-lg cursor-pointer transition shrink-0 ${
                (wallet?.promotionalGranted ?? 0) > 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg'
              }`}
            >
              {(wallet?.promotionalGranted ?? 0) > 0
                ? 'Bônus Já Resgatado'
                : claimingBonus
                ? 'Resgatando...'
                : 'Resgatar 25 Créditos'}
            </button>
          </div>

          {/* Próximos Passos e Resumo Metodológico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Custo Transparente por Consulta
              </h4>
              <ul className="text-xs text-slate-400 space-y-2 font-mono">
                <li>• **Análise Espectral de Áudio & IA**: 5 créditos por consulta efetiva</li>
                <li>• Chat Metodológico de Investigação: 5 créditos por consulta concluída.</li>
                <li>• **Sensores, Ouija, Câmera e Teste Duplo-Cego**: 100% locais e gratuitos (0 créditos)</li>
                <li>• **Reserva Atômica**: Se a IA falhar ou o modelo estiver indisponível, os 5 créditos são integralmente estornados.</li>
              </ul>
            </div>

            <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Investigações Locais Neste Dispositivo
              </h4>
              <p className="text-xs text-slate-400">
                Você possui <span className="text-cyan-300 font-mono font-bold">{localSessions.length}</span> sessões gravadas no IndexedDB deste navegador.
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                Os dados brutos de áudio e evidências físicas residem com segurança no seu dispositivo atual para garantir total privacidade.
              </p>
              <button
                onClick={() => setActiveSection('investigations')}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition pt-1"
              >
                Visualizar sessões locais →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MINHA CARTEIRA & EXTRATO */}
      {activeSection === 'wallet' && (
        <div className="space-y-6">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-cyan-300">
                  Extrato Transacional da Carteira
                </h3>
                <p className="text-xs text-slate-400">
                  Histórico oficial de todas as movimentações e reservas auditadas pelo servidor.
                </p>
              </div>
              <button
                onClick={onOpenWalletModal}
                className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/60 text-xs font-mono text-cyan-300 rounded cursor-pointer transition"
              >
                Adquirir Créditos
              </button>
            </div>

            {ledger.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                Nenhuma movimentação registrada até o momento nesta carteira.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Tipo de Operação</th>
                      <th className="py-2.5 px-3">Descrição / Motivo</th>
                      <th className="py-2.5 px-3 text-right">Variação</th>
                      <th className="py-2.5 px-3 text-right">Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {ledger.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.type === 'free_grant'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                : item.type === 'purchase'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                : item.type === 'admin_adjustment'
                                ? 'bg-blue-950 text-blue-300 border border-blue-500/40'
                                : item.type === 'refund'
                                ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{item.description}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            item.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.amount > 0 ? `+${item.amount}` : item.amount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                          {item.balanceAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. MINHAS COMPRAS */}
      {activeSection === 'orders' && (
        <div className="space-y-6">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-cyan-300">
                  Histórico de Pedidos Mercado Pago
                </h3>
                <p className="text-xs text-slate-400">
                  Os créditos só são liberados após confirmação autoritativa do webhook oficial.
                </p>
              </div>
              <button
                onClick={loadOrders}
                disabled={loadingOrders}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 rounded cursor-pointer transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>{loadingOrders ? 'Atualizando...' : 'Recarregar'}</span>
              </button>
            </div>

            {ordersError && (
              <div className="mb-4 p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-300 text-xs font-mono">
                {ordersError}
              </div>
            )}

            {orders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                Nenhum pedido de crédito gerado até o momento.
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => {
                  const badge = statusLabelMap[ord.status] || {
                    label: ord.status,
                    color: 'text-slate-400 border-slate-600 bg-slate-900',
                  };
                  return (
                    <div
                      key={ord.id}
                      className="bg-[#081120] border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono text-cyan-300">
                            {ord.credits} Créditos
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-400">
                          Ref: {ord.id} • Valor: R$ {(ord.amountCentsBRL / 100).toFixed(2)} • Data:{' '}
                          {new Date(ord.createdAt).toLocaleString()}
                        </p>
                        {ord.mercadoPagoPaymentId && (
                          <p className="text-[10px] font-mono text-emerald-400">
                            ID Mercado Pago: {ord.mercadoPagoPaymentId}
                          </p>
                        )}
                      </div>

                      {ord.status === 'created' && ord.mercadoPagoInitPoint && (
                        <a
                          href={ord.mercadoPagoInitPoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs rounded flex items-center gap-1.5 transition"
                        >
                          <span>Pagar no Mercado Pago</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MINHAS INVESTIGAÇÕES */}
      {activeSection === 'investigations' && (
        <div className="space-y-6">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-cyan-300 flex items-center gap-2">
                  <FolderLock className="w-4 h-4 text-cyan-400" />
                  Sessões e Evidências Gravadas Localmente
                </h3>
                <p className="text-xs text-slate-400">
                  Armazenadas com integridade estrita no IndexedDB deste navegador.
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-300 bg-cyan-950 px-2.5 py-1 rounded border border-cyan-500/40">
                {localSessions.length} Sessões
              </span>
            </div>

            {localSessions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                Nenhuma investigação registrada ainda neste dispositivo. Inicie uma nova sessão nos instrumentos.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {localSessions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-[#081120] border border-slate-800 rounded-xl p-4 space-y-2 hover:border-cyan-500/40 transition"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold font-mono text-cyan-200 truncate">
                        {s.title || 'Sessão Sem Título'}
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {s.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Início: {new Date(s.startTime).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Evidências Registradas: {s.evidenceCount || 0}
                    </p>
                    <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                      <span className="text-[10px] font-mono text-amber-400/80">
                        🔒 Armazenamento local neste dispositivo
                      </span>
                      <button
                        onClick={onBackToApp}
                        className="text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        Abrir nos Instrumentos →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MINHA CONTA */}
      {activeSection === 'account' && (
        <div className="space-y-6">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold font-mono text-cyan-300 flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              Informações do Usuário &amp; Segurança
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[#081120] p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">E-MAIL CADASTRADO</span>
                <span className="text-slate-200 font-bold">{user.email}</span>
              </div>
              <div className="bg-[#081120] p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">STATUS DE VERIFICAÇÃO</span>
                <span
                  className={
                    user.emailVerified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'
                  }
                >
                  {user.emailVerified ? '✓ Verificado' : '⚠ Verificação Pendente'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-wrap gap-3">
              {!user.emailVerified && (
                <button
                  onClick={handleSendVerification}
                  className="px-4 py-2 bg-amber-900/60 hover:bg-amber-800/80 border border-amber-500/50 text-amber-200 font-mono text-xs rounded cursor-pointer transition"
                >
                  Enviar E-mail de Verificação
                </button>
              )}

              <button
                onClick={async () => {
                  if (confirm('Deseja realmente encerrar a sessão da sua conta?')) {
                    await logoutUser();
                    onBackToApp();
                  }
                }}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/50 text-rose-300 font-mono text-xs rounded cursor-pointer transition flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

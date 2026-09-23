import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import {
  AdminDashboardOverview,
  AdminAdjustmentReceipt,
  UserWallet,
  OrderItem,
} from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  CreditCard,
  History,
  Activity,
  ArrowLeft,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  Lock,
  PlusCircle,
  MinusCircle,
  FileText,
  Sliders,
} from 'lucide-react';

interface AdminPanelProps {
  onBackToApp: () => void;
  onOpenAuth: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToApp, onOpenAuth }) => {
  const { user, isAdmin, getIdToken } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'adjust' | 'orders' | 'audit' | 'config'
  >('overview');

  // Overview data
  const [overview, setOverview] = useState<AdminDashboardOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Users data
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Manual adjustment form
  const [targetUid, setTargetUid] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [adjAction, setAdjAction] = useState<'grant' | 'revoke'>('grant');
  const [adjAmount, setAdjAmount] = useState<number>(10);
  const [adjReason, setAdjReason] = useState('');
  const [adjCategory, setAdjCategory] = useState<'courtesy' | 'support' | 'correction' | 'other'>(
    'support'
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [targetWallet, setTargetWallet] = useState<UserWallet | null>(null);
  const [loadingTargetWallet, setLoadingTargetWallet] = useState(false);
  const [submittingAdj, setSubmittingAdj] = useState(false);
  const [adjReceipt, setAdjReceipt] = useState<AdminAdjustmentReceipt | null>(null);
  const [adjError, setAdjError] = useState<string | null>(null);

  // Orders and Audit data
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (user && isAdmin) {
      loadOverview();
      loadUsers();
    }
  }, [user, isAdmin]);

  const loadOverview = async () => {
    try {
      setLoadingOverview(true);
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (err) {
      console.warn('[AdminPanel] Erro ao carregar visão geral:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchTerm)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.warn('[AdminPanel] Erro ao carregar usuários:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTargetWallet = async (uidToFetch: string) => {
    if (!uidToFetch) return;
    try {
      setLoadingTargetWallet(true);
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(uidToFetch)}/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTargetWallet(data.wallet);
      } else {
        setTargetWallet(null);
      }
    } catch (err) {
      console.warn('[AdminPanel] Erro ao carregar carteira alvo:', err);
    } finally {
      setLoadingTargetWallet(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.warn('[AdminPanel] Erro ao carregar auditoria:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const loadAdminOrders = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminOrders(data);
      }
    } catch (err) {
      console.warn('[AdminPanel] Erro ao carregar pedidos admin:', err);
    }
  };

  const handleExecuteAdjustment = async () => {
    if (!targetUid.trim()) {
      alert('Informe o UID do usuário alvo.');
      return;
    }
    if (!adjReason.trim()) {
      alert('Informe o motivo formal do ajuste.');
      return;
    }
    if (!adjAmount || adjAmount <= 0) {
      alert('Quantidade deve ser um inteiro positivo.');
      return;
    }

    const actionText = adjAction === 'grant' ? 'CONCEDER' : 'RETIRAR';
    const confirmMessage = `Confirma ${actionText} ${adjAmount} créditos para o usuário ${targetUid}?\nMotivo: ${adjReason}\nChave de Idempotência: ${idempotencyKey}`;
    if (!confirm(confirmMessage)) {
      return;
    }

    setSubmittingAdj(true);
    setAdjError(null);
    setAdjReceipt(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Não autenticado.');

      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUid: targetUid.trim(),
          action: adjAction,
          amount: Number(adjAmount),
          reason: adjReason.trim(),
          category: adjCategory,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar ajuste.');
      }

      setAdjReceipt(data.receipt);
      setTargetWallet(data.wallet);
      // Gerar nova chave para a próxima operação
      setIdempotencyKey(crypto.randomUUID());
      // Atualizar lista e overview
      loadOverview();
      loadUsers();
    } catch (err: any) {
      setAdjError(err.message || 'Erro inesperado.');
    } finally {
      setSubmittingAdj(false);
    }
  };

  // Se não autenticado ou não administrador
  if (!user || !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 my-8">
        <div className="bg-[#070d18] border border-rose-500/40 rounded-xl p-8 text-center shadow-2xl backdrop-blur-md">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold font-mono text-rose-200 mb-2">
            Acesso Restrito: Painel Administrativo
          </h2>
          <p className="text-xs text-slate-400 max-w-lg mx-auto mb-6">
            O console administrativo é protegido por verificação estrita de token e autorização no servidor (allowlist <code className="text-cyan-300">ADMIN_UIDS</code> ou custom claims).
            Se você for o proprietário, certifique-se de configurar seu UID no painel da Vercel.
          </p>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-left max-w-md mx-auto text-xs font-mono text-slate-300 mb-6 space-y-1">
            <p className="text-slate-400 text-[11px]">Diagnóstico Operacional:</p>
            <p>• Usuário conectado: {user ? user.email : 'Nenhum (Anônimo)'}</p>
            <p>• UID do cliente: {user ? user.uid : 'N/A'}</p>
            <p>• Privilégio reconhecido pelo backend: <span className="text-rose-400 font-bold">NÃO (403)</span></p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {!user && (
              <button
                onClick={onOpenAuth}
                className="w-full sm:w-auto px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold rounded-lg cursor-pointer transition"
              >
                Identificar-se com Conta Administradora
              </button>
            )}
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

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6">
      {/* Top Banner Admin */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0a101f] border border-cyan-500/40 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToApp}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 rounded-lg cursor-pointer transition"
            title="Voltar aos Instrumentos"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold font-mono text-cyan-300 tracking-wide flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                CONGRESSO ADMINISTRATIVO FORENSE
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300">
                ADMIN AUTORIZADO
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Operador: {user.email} (UID: {user.uid.slice(0, 10)}...)
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            loadOverview();
            loadUsers();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 rounded cursor-pointer transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Atualizar Painel</span>
        </button>
      </div>

      {/* Navegação Interna Admin */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-slate-800 pb-2">
        {[
          { id: 'overview' as const, label: 'Visão Geral & Métricas', icon: Activity },
          { id: 'users' as const, label: 'Usuários & Carteiras', icon: Users },
          { id: 'adjust' as const, label: 'Ajuste Manual de Créditos', icon: Sliders },
          { id: 'orders' as const, label: 'Pedidos Mercado Pago', icon: CreditCard },
          { id: 'audit' as const, label: 'Trilha de Auditoria', icon: History },
          { id: 'config' as const, label: 'Configurações de Pacotes', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'audit') loadAuditLogs();
                if (tab.id === 'orders') loadAdminOrders();
              }}
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

      {/* Conteúdo Dinâmico por Aba */}

      {/* 1. VISÃO GERAL */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {overview?.metricsPartial && <p role="status" className="text-xs text-amber-300">Métricas parciais: esta visão inclui no máximo 500 registros de cada coleção.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#081120] border border-cyan-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">CARTEIRAS CRIADAS</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-cyan-300">
                {overview?.totalUsers ?? '...'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Carteiras provisionadas</span>
            </div>

            <div className="bg-[#081120] border border-emerald-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">CRÉDITOS EM CIRCULAÇÃO</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">
                {overview?.totalCreditsInCirculation ?? '...'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Saldo disponível ativo</span>
            </div>

            <div className="bg-[#081120] border border-blue-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">CRÉDITOS COMPRADOS</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-blue-400">
                {overview?.totalPurchasedCredits ?? '...'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Via Mercado Pago</span>
            </div>

            <div className="bg-[#081120] border border-purple-500/40 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">CRÉDITOS CONSUMIDOS</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-purple-300">
                {overview?.totalSpentCredits ?? '...'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Consultas processadas</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Integridade dos Serviços e Provedores
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span>Google Gemini API</span>
                  <span
                    className={
                      overview?.apiHealth.geminiOnline
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    {overview?.apiHealth.geminiOnline ? '● Conectado (Cascade Ativo)' : '○ Modo DSP Local'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span>Mercado Pago Checkout Pro</span>
                  <span
                    className={
                      overview?.apiHealth.mercadoPagoOnline
                        ? 'text-emerald-400 font-bold'
                        : 'text-rose-400 font-bold'
                    }
                  >
                    {overview?.apiHealth.mercadoPagoOnline ? '● Ativo' : '○ Chave Pendente'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span>Allowlist de Administradores</span>
                  <span className="text-emerald-400 font-bold">● ADMIN_UIDS Configurado</span>
                </div>
              </div>
            </div>

            <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-400" />
                Pedidos por Status
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Aprovados:</span>
                  <span className="text-emerald-400 font-bold text-lg">
                    {overview?.ordersCountByStatus?.approved || 0}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Pendentes:</span>
                  <span className="text-amber-400 font-bold text-lg">
                    {overview?.ordersCountByStatus?.pending || 0}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Iniciados:</span>
                  <span className="text-slate-300 font-bold text-lg">
                    {overview?.ordersCountByStatus?.created || 0}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Estornados:</span>
                  <span className="text-purple-400 font-bold text-lg">
                    {overview?.ordersCountByStatus?.refunded || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. USUÁRIOS & CARTEIRAS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Filtrar por UID do usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                className="w-full bg-[#081120] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:border-cyan-500 outline-none"
              />
            </div>
            <button
              onClick={loadUsers}
              className="px-4 py-2 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-xs font-mono rounded-lg cursor-pointer"
            >
              Buscar
            </button>
          </div>

          <div className="bg-[#070d18] border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                  <th className="py-2.5 px-3">UID do Usuário</th>
                  <th className="py-2.5 px-3 text-right">Saldo Disponível</th>
                  <th className="py-2.5 px-3 text-right">Reservado</th>
                  <th className="py-2.5 px-3 text-right">Promocional</th>
                  <th className="py-2.5 px-3 text-right">Comprados</th>
                  <th className="py-2.5 px-3 text-right">Ajuste Manual</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {usersList.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-900/40 transition">
                    <td className="py-2.5 px-3 font-mono text-cyan-300 font-bold">{u.uid}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">{u.balance}</td>
                    <td className="py-2.5 px-3 text-right text-amber-400">{u.reserved}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{u.promotionalGranted}</td>
                    <td className="py-2.5 px-3 text-right text-blue-300">{u.purchasedTotal}</td>
                    <td className="py-2.5 px-3 text-right text-purple-300">{u.manualGrantedTotal || 0}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => {
                          setTargetUid(u.uid);
                          fetchTargetWallet(u.uid);
                          setActiveTab('adjust');
                        }}
                        className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-[10px] text-cyan-300 rounded cursor-pointer transition"
                      >
                        Ajustar Créditos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. AJUSTE MANUAL DE CRÉDITOS */}
      {activeTab === 'adjust' && (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="bg-[#070d18] border border-cyan-500/40 rounded-xl p-6 space-y-5 shadow-2xl">
            <div>
              <h3 className="text-base font-bold font-mono text-cyan-300 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                Concessão e Ajuste Manual de Créditos
              </h3>
              <p className="text-xs text-slate-400">
                Operação atômica transacional auditada. A chave de idempotência previne duplicidade sob repetições ou falhas de rede.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  UID DO USUÁRIO ALVO *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: u8g37492hgksdf..."
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    className="flex-1 bg-[#081120] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => fetchTargetWallet(targetUid)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 rounded-lg cursor-pointer"
                  >
                    Verificar Saldo
                  </button>
                </div>
              </div>

              {/* Informações da Carteira Alvo Antes da Concessão */}
              {targetWallet && (
                <div className="p-3 bg-slate-900 border border-cyan-500/30 rounded-lg text-xs font-mono space-y-1">
                  <p className="text-cyan-400 font-bold">Estado Atual da Carteira:</p>
                  <p>• Saldo Disponível: <span className="text-emerald-400 font-bold">{targetWallet.balance}</span></p>
                  <p>• Reservado: {targetWallet.reserved}</p>
                  <p>• Total Concedido Manualmente: {targetWallet.manualGrantedTotal || 0}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    AÇÃO OPERACIONAL *
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjAction('grant')}
                      className={`flex-1 py-2 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        adjAction === 'grant'
                          ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      <PlusCircle className="w-4 h-4" /> Conceder (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjAction('revoke')}
                      className={`flex-1 py-2 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        adjAction === 'revoke'
                          ? 'bg-rose-950 border border-rose-500 text-rose-300'
                          : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      <MinusCircle className="w-4 h-4" /> Retirar (-)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    QUANTIDADE DE CRÉDITOS *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full bg-[#081120] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    CATEGORIA FORMAL *
                  </label>
                  <select
                    value={adjCategory}
                    onChange={(e: any) => setAdjCategory(e.target.value)}
                    className="w-full bg-[#081120] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="support">Suporte Técnico</option>
                    <option value="courtesy">Cortesia / Investigador Convidado</option>
                    <option value="correction">Correção de Inconsistência</option>
                    <option value="other">Outro Motivo Auditado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    CHAVE DE IDEMPOTÊNCIA (ESTRITA) *
                  </label>
                  <input
                    type="text"
                    value={idempotencyKey}
                    readOnly
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  MOTIVO FORMAL DO AJUSTE (OBRIGATÓRIO) *
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva a razão justificada para a concessão ou estorno deste saldo..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full bg-[#081120] border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>

              {/* Prévia calculada */}
              {targetWallet && (
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-200 flex justify-between items-center">
                  <span>
                    Prévia de Saldo Calculado: {targetWallet.balance} →{' '}
                    <span className="font-bold text-cyan-300">
                      {adjAction === 'grant'
                        ? targetWallet.balance + adjAmount
                        : Math.max(0, targetWallet.balance - adjAmount)}
                    </span>
                  </span>
                  {adjAction === 'revoke' && targetWallet.balance < adjAmount && (
                    <span className="text-rose-400 text-[10px]">
                      ⚠ Dívida compensatória de {adjAmount - targetWallet.balance} créditos será registrada
                    </span>
                  )}
                </div>
              )}

              {adjError && (
                <div className="p-3 bg-rose-950/60 border border-rose-500 rounded-lg text-xs font-mono text-rose-300">
                  {adjError}
                </div>
              )}

              <button
                onClick={handleExecuteAdjustment}
                disabled={submittingAdj || !targetUid.trim() || !adjReason.trim()}
                className={`w-full py-3 rounded-lg font-mono text-xs font-bold cursor-pointer transition shadow-lg ${
                  submittingAdj || !targetUid.trim() || !adjReason.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                }`}
              >
                {submittingAdj ? 'Gravando Operação em Transação...' : 'Confirmar e Gravar Ajuste'}
              </button>
            </div>
          </div>

          {/* Recibo da Operação Concluída */}
          {adjReceipt && (
            <div className="bg-emerald-950/30 border border-emerald-500/60 rounded-xl p-5 space-y-3 font-mono text-xs text-emerald-200 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle className="w-5 h-5" />
                <span>RECIBO OFICIAL DA OPERAÇÃO DE AJUSTE #{adjReceipt.operationId}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-2 border-t border-emerald-500/30">
                <p>• Usuário Alvo: <span className="text-cyan-300">{adjReceipt.targetUid}</span></p>
                <p>• Operador: <span className="text-cyan-300">{adjReceipt.adminUid}</span></p>
                <p>• Ação: {adjReceipt.action === 'grant' ? '+ Concessão' : '- Retirada'}</p>
                <p>• Quantidade: {adjReceipt.amount} créditos</p>
                <p>• Saldo Anterior: {adjReceipt.previousBalance}</p>
                <p>• Saldo Atual: <span className="font-bold text-emerald-400">{adjReceipt.balanceAfter}</span></p>
                <p>• Categoria: {adjReceipt.category}</p>
                <p>• Motivo: {adjReceipt.reason}</p>
                <p className="col-span-2 text-[10px] text-slate-400">
                  Chave Idempotente: {adjReceipt.idempotencyKey} • Data: {new Date(adjReceipt.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. PEDIDOS MERCADO PAGO */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold font-mono text-cyan-300 mb-3">
              Pedidos de Crédito Registrados no Servidor
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3">ID Pedido</th>
                    <th className="py-2 px-3">UID Comprador</th>
                    <th className="py-2 px-3">Créditos</th>
                    <th className="py-2 px-3">Valor (R$)</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">ID Pagamento MP</th>
                    <th className="py-2 px-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {adminOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 text-cyan-300 font-bold">{o.id}</td>
                      <td className="py-2 px-3 text-slate-300">{o.uid}</td>
                      <td className="py-2 px-3 font-bold text-emerald-400">+{o.credits}</td>
                      <td className="py-2 px-3 text-slate-300">
                        R$ {(o.amountCentsBRL / 100).toFixed(2)}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {o.mercadoPagoPaymentId || 'Pendente'}
                      </td>
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. TRILHA DE AUDITORIA */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-[#070d18] border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold font-mono text-cyan-300 mb-3">
              Trilha Oficial de Auditoria Administrativa
            </h3>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="text-cyan-300 font-bold">{log.type}</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-300">
                    Operador: <span className="text-slate-400">{log.actorAdminUid}</span> → Usuário: <span className="text-slate-400">{log.targetUid}</span>
                  </p>
                  <p className="text-slate-300">
                    Ação: {log.action} | Quantidade: {log.amount} | Motivo: "{log.reason}"
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Chave Idempotência: {log.idempotencyKey} | Saldo: {log.previousBalance} → {log.balanceAfter}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIGURAÇÕES DE PACOTES */}
      {activeTab === 'config' && (
        <div className="bg-[#070d18] border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Configuração de Preços e Pacotes de Créditos
          </h3>
          <p className="text-xs text-slate-400">
            Por política de segurança estrita contra manipulação no cliente, os preços oficiais são configurados exclusivamente através de variáveis de ambiente no servidor da Vercel. O painel apenas reflete os valores e impede edição direta pelo navegador.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block text-[10px]">PACOTE 50 CRÉDITOS</span>
              <span className="text-cyan-300 font-bold">10 Consultas Forenses</span>
              <p className="text-[10px] text-slate-500 mt-1">Variável: PACKAGE_50_PRICE_CENTS</p>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block text-[10px]">PACOTE 75 CRÉDITOS</span>
              <span className="text-cyan-300 font-bold">15 Consultas Forenses</span>
              <p className="text-[10px] text-slate-500 mt-1">Variável: PACKAGE_75_PRICE_CENTS</p>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block text-[10px]">PACOTE 100 CRÉDITOS</span>
              <span className="text-cyan-300 font-bold">20 Consultas Forenses</span>
              <p className="text-[10px] text-slate-500 mt-1">Variável: PACKAGE_100_PRICE_CENTS</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

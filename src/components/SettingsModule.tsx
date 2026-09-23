import React, { useState, useEffect } from 'react';
import { getStorageStats } from '../services/storage';
import {
  Settings,
  Shield,
  HardDrive,
  Mic,
  Camera,
  Cpu,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Lock,
} from 'lucide-react';

interface Props {
  hasAudioPermission: boolean;
  onRequestMicPermission: () => Promise<void>;
  hasGemini: boolean;
  onClearAllData: () => Promise<void>;
  availableMics: MediaDeviceInfo[];
  selectedMicId: string;
  onSelectMic: (deviceId: string) => void;
}

export const SettingsModule: React.FC<Props> = ({
  hasAudioPermission,
  onRequestMicPermission,
  hasGemini,
  onClearAllData,
  availableMics,
  selectedMicId,
  onSelectMic,
}) => {
  const [stats, setStats] = useState<{ sessionCount: number; evidenceCount: number; approxBytes: number }>({
    sessionCount: 0,
    evidenceCount: 0,
    approxBytes: 0,
  });

  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    getStorageStats().then(setStats);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleWipe = async () => {
    await onClearAllData();
    setConfirmWipe(false);
    getStorageStats().then(setStats);
  };

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm sm:text-base font-bold text-white font-mono uppercase">
            CONFIGURAÇÕES DO SISTEMA &amp; POLÍTICA DE PRIVACIDADE
          </h2>
        </div>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          Controle de permissões de hardware, armazenamento IndexedDB e transparência de dados
        </p>
      </div>

      {/* 2. Dispositivos de Entrada e Permissões */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Mic className="w-4 h-4 text-cyan-400" />
          <span>PERMISSÕES &amp; SELEÇÃO DE HARDWARE</span>
        </h3>

        <div className="space-y-3">
          {/* Microphone Selector */}
          <div className="bg-[#0a101d] border border-slate-800 rounded p-3 space-y-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-300 font-semibold">Microfone Principal de Entrada:</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded ${
                  hasAudioPermission
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                    : 'bg-rose-950 text-rose-300 border border-rose-600/40'
                }`}
              >
                {hasAudioPermission ? 'AUTORIZADO' : 'NÃO CONCEDIDO'}
              </span>
            </div>

            {availableMics.length > 0 ? (
              <select
                value={selectedMicId}
                onChange={(e) => onSelectMic(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                {availableMics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microfone (${mic.deviceId.slice(0, 8)})`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                <span>Clique para solicitar permissão de áudio ao navegador.</span>
                <button
                  onClick={onRequestMicPermission}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs cursor-pointer"
                >
                  Conceder Permissão
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Armazenamento Local (IndexedDB) */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-emerald-400" />
          <span>ARMAZENAMENTO PERSISTENTE LOCAL (INDEXEDDB)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="bg-[#0a101d] border border-slate-800 p-3 rounded">
            <span className="text-slate-500 text-[10px] block">Sessões Salvas:</span>
            <strong className="text-white text-base">{stats.sessionCount}</strong>
          </div>
          <div className="bg-[#0a101d] border border-slate-800 p-3 rounded">
            <span className="text-slate-500 text-[10px] block">Itens na Cadeia de Evidência:</span>
            <strong className="text-cyan-400 text-base">{stats.evidenceCount}</strong>
          </div>
          <div className="bg-[#0a101d] border border-slate-800 p-3 rounded">
            <span className="text-slate-500 text-[10px] block">Espaço em Disco Estimado:</span>
            <strong className="text-emerald-400 text-base">{formatBytes(stats.approxBytes)}</strong>
          </div>
        </div>

        <div className="pt-2 flex justify-between items-center flex-wrap gap-2">
          <p className="text-[11px] text-slate-400 font-mono">
            Os dados permanecem salvos mesmo após fechar ou recarregar o navegador.
          </p>

          {confirmWipe ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400 font-mono">Tem certeza?</span>
              <button
                onClick={handleWipe}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-mono font-bold cursor-pointer"
              >
                Sim, Limpar Tudo
              </button>
              <button
                onClick={() => setConfirmWipe(false)}
                className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs font-mono cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmWipe(true)}
              className="px-3 py-1.5 bg-rose-950/70 border border-rose-600/50 hover:bg-rose-900/60 text-rose-300 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Todas as Sessões &amp; Mídias</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Transparência & Privacidade de Inteligência Artificial */}
      <div className="bg-[#080d16] border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
        <h3 className="font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>TRANSPARÊNCIA DE CONEXÕES &amp; SERVIÇO DE IA</span>
        </h3>

        <div className="p-3 bg-[#0a101d] border border-slate-800 rounded space-y-2 leading-relaxed text-slate-300 font-sans">
          <p>
            <strong>Armazenamento Local por Padrão:</strong> 100% de todas as amostras de áudio, fotografias, anotações de Ouija e testes duplo-cego são salvos localmente no armazenamento seguro IndexedDB do seu próprio dispositivo. Nada é enviado para servidores externos de modo passivo.
          </p>
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center flex-wrap gap-2 font-mono text-[11px]">
            <div>
              <span className="text-slate-500">Status do Gemini AI: </span>
              <span className={hasGemini ? 'text-cyan-400 font-bold' : 'text-slate-400'}>
                {hasGemini ? 'Ativo no Servidor (gemini-3.8-flash)' : 'Desativado / Modo Local'}
              </span>
            </div>
            <div className="text-slate-500 text-[10px]">
              Credenciais protegidas no servidor backend (nunca expostas no front-end).
            </div>
          </div>
        </div>
      </div>

      {/* 5. Infraestrutura de Produção Parte 2: Carteira, Mercado Pago & Failover de IA */}
      <div className="bg-[#080d16] border border-cyan-900/60 rounded-lg p-4 space-y-3 text-xs">
        <h3 className="font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>MOTOR DE PRODUÇÃO: ORQUESTRAÇÃO DE IA &amp; CRÉDITOS AUDITÁVEIS</span>
        </h3>

        <div className="p-3 bg-[#0a101d] border border-slate-800 rounded space-y-2 text-slate-300 font-sans leading-relaxed text-[11px]">
          <div>
            <strong className="text-cyan-300 font-mono block">CASCATA DE MODELOS COM FAILOVER DE 2 SEGUNDOS:</strong>
            <p className="text-slate-400">
              O backend orquestra chamadas com ordem de preferência: <code>gemini-3.8-flash</code> &rarr; <code>gemini-3.7-flash</code> &rarr; <code>gemini-2.5-flash</code>. Se um modelo não responder em 2 segundos ou apresentar erro transitório, o timeout aciona o modelo seguinte da cascata. A resposta tardia do modelo anterior é isolada e descartada para impedir cobrança duplicada.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <strong className="text-cyan-300 font-mono block">MERCADO PAGO (CHECKOUT PRO) &amp; TRANSAÇÕES FIRESTORE:</strong>
            <p className="text-slate-400">
              Apenas confirmações autorizadas com webhook validado e consulta à API oficial do Mercado Pago concedem créditos de pacotes (50, 75 ou 100). Saldos nunca são variáveis de cliente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

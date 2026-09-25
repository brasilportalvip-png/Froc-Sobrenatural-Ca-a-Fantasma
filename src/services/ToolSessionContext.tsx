import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PremiumToolId, ToolPricingConfig, ToolSession } from '../types';
import { useAuth } from './AuthContext';

interface ToolSessionContextValue {
  pricing: Record<PremiumToolId, ToolPricingConfig> | null;
  isLoadingPricing: boolean;
  sessions: Record<string, ToolSession | null>;
  remainingSeconds: Record<string, number>;
  isStarting: Record<string, boolean>;
  isRenewing: Record<string, boolean>;
  startSession: (toolId: PremiumToolId, autoRenew?: boolean) => Promise<{ success: boolean; error?: string }>;
  renewSession: (toolId: PremiumToolId) => Promise<{ success: boolean; error?: string }>;
  toggleAutoRenew: (toolId: PremiumToolId, autoRenew: boolean) => Promise<boolean>;
  endSession: (toolId: PremiumToolId) => Promise<boolean>;
  isSessionActive: (toolId: PremiumToolId) => boolean;
  getActiveSessionId: (toolId: PremiumToolId) => string | undefined;
}

const ToolSessionContext = createContext<ToolSessionContextValue | undefined>(undefined);

// Fallback pricing configuration while loading or in offline mode
const DEFAULT_PRICING: Record<PremiumToolId, ToolPricingConfig> = {
  communication: {
    toolId: 'communication',
    costCredits: 5,
    durationSeconds: 240,
    name: 'Comunicação e Análise Espectral',
    description: 'Gravação pericial de áudio, espectrograma em tempo real, osciloscópio e consultas com IA forense.',
    category: 'audio',
  },
  vision: {
    toolId: 'vision',
    costCredits: 5,
    durationSeconds: 240,
    name: 'Visão Computacional e Câmera',
    description: 'Análise óptica de luminância, retículo forense, realces digitais e registro fotográfico na cadeia de custódia.',
    category: 'camera',
  },
  ouija: {
    toolId: 'ouija',
    costCredits: 5,
    durationSeconds: 240,
    name: 'Mesa Ouija Digital e Microvariações',
    description: 'Registro de movimentos com detecção de efeito ideomotor, triangulação e captura de sequências alfanuméricas.',
    category: 'sensor_board',
  },
  blindTest: {
    toolId: 'blindTest',
    costCredits: 5,
    durationSeconds: 240,
    name: 'Protocolo de Teste Duplo-Cego',
    description: 'Criptografia SHA-256 com sal de alvos em envelopes selados, bloqueio de hipóteses e desvendamento cego verificado.',
    category: 'protocol',
  },
  evidenceAnalysis: {
    toolId: 'evidenceAnalysis',
    costCredits: 5,
    durationSeconds: 240,
    name: 'Cadeia de Evidência e Filtragem DSP',
    description: 'Auditoria de integridade temporal, filtros de isolamento acústico pericial e laudo pericial exportável.',
    category: 'chain',
  },
};

export const MAX_AUTO_RENEWALS = 5;

export const ToolSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, getIdToken, refreshWallet } = useAuth();
  const [pricing, setPricing] = useState<Record<PremiumToolId, ToolPricingConfig>>(DEFAULT_PRICING);
  const [isLoadingPricing, setIsLoadingPricing] = useState(true);

  const [sessions, setSessions] = useState<Record<string, ToolSession | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<Record<string, number>>({});
  const [isStarting, setIsStarting] = useState<Record<string, boolean>>({});
  const [isRenewing, setIsRenewing] = useState<Record<string, boolean>>({});

  // Unique tab identifier for multi-tab coordination
  const tabIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? `tab_${crypto.randomUUID()}`
      : `tab_${Date.now()}`
  );

  // BroadcastChannel for cross-tab session synchronization and leader coordination
  const channelRef = useRef<BroadcastChannel | null>(null);
  const remoteRenewInProgressRef = useRef<Record<string, { tabId: string; timestamp: number }>>({});

  // Use refs to avoid stale closures in tick interval
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const isRenewingRef = useRef(isRenewing);
  isRenewingRef.current = isRenewing;

  // Initialize BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('froc_tool_sessions');
    channelRef.current = channel;

    channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'SESSION_STARTED' && msg.toolId && msg.session) {
        const s: ToolSession = msg.session;
        setSessions((prev) => ({ ...prev, [msg.toolId]: s }));
        const secs = Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000));
        setRemainingSeconds((prev) => ({ ...prev, [msg.toolId]: secs }));
        refreshWallet().catch(() => {});
      } else if (msg.type === 'SESSION_RENEWED' && msg.toolId && msg.session) {
        const s: ToolSession = msg.session;
        setSessions((prev) => ({ ...prev, [msg.toolId]: s }));
        const secs = Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000));
        setRemainingSeconds((prev) => ({ ...prev, [msg.toolId]: secs }));
        delete remoteRenewInProgressRef.current[msg.toolId];
        setIsRenewing((prev) => ({ ...prev, [msg.toolId]: false }));
        refreshWallet().catch(() => {});
      } else if (msg.type === 'SESSION_ENDED' && msg.toolId) {
        setSessions((prev) => ({ ...prev, [msg.toolId]: null }));
        setRemainingSeconds((prev) => ({ ...prev, [msg.toolId]: 0 }));
      } else if (msg.type === 'RENEW_IN_PROGRESS' && msg.toolId && msg.tabId !== tabIdRef.current) {
        remoteRenewInProgressRef.current[msg.toolId] = {
          tabId: msg.tabId,
          timestamp: msg.timestamp || Date.now(),
        };
        setIsRenewing((prev) => ({ ...prev, [msg.toolId]: true }));
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [refreshWallet]);

  // Carregar precificação autoritativa do backend
  useEffect(() => {
    let isMounted = true;
    fetch('/api/tools/pricing')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.pricing) {
          setPricing(data.pricing);
        }
      })
      .catch((err) => console.warn('[ToolSessionContext] Usando tabela de preços padrão:', err))
      .finally(() => {
        if (isMounted) setIsLoadingPricing(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Verificar sessões ativas do usuário ao logar
  const checkActiveSessions = useCallback(async () => {
    if (!user) {
      setSessions({});
      setRemainingSeconds({});
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) return;

      const toolIds: PremiumToolId[] = ['communication', 'vision', 'ouija', 'blindTest', 'evidenceAnalysis'];
      const results = await Promise.all(
        toolIds.map(async (toolId) => {
          try {
            const resp = await fetch(`/api/tools/session/active?toolId=${toolId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              return { toolId, session: data.active ? data.session : null };
            }
          } catch {}
          return { toolId, session: null };
        })
      );

      const newSessions: Record<string, ToolSession | null> = {};
      const newRemaining: Record<string, number> = {};
      const now = Date.now();

      results.forEach(({ toolId, session }) => {
        newSessions[toolId] = session;
        if (session && session.expiresAt > now) {
          newRemaining[toolId] = Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
        } else {
          newRemaining[toolId] = 0;
        }
      });

      setSessions(newSessions);
      setRemainingSeconds(newRemaining);
    } catch (err) {
      console.warn('[ToolSessionContext] Erro ao carregar sessões ativas:', err);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    checkActiveSessions();
  }, [checkActiveSessions]);

  // Renovar sessão
  const renewSession = useCallback(
    async (toolId: PremiumToolId): Promise<{ success: boolean; error?: string }> => {
      const currentSession = sessionsRef.current[toolId];
      if (!currentSession) {
        return { success: false, error: 'Nenhuma sessão encontrada para renovar.' };
      }

      // Proteção de limite máximo de renovações automáticas (5 renovações consecutivas)
      if (
        currentSession.autoRenew &&
        typeof currentSession.autoRenewCount === 'number' &&
        currentSession.autoRenewCount >= MAX_AUTO_RENEWALS
      ) {
        setSessions((prev) => ({
          ...prev,
          [toolId]: prev[toolId] ? { ...prev[toolId]!, autoRenew: false, status: 'expired' } : null,
        }));
        return {
          success: false,
          error: `Limite de auto-renovação de ${MAX_AUTO_RENEWALS} ciclos atingido para sua segurança.`,
        };
      }

      setIsRenewing((prev) => ({ ...prev, [toolId]: true }));
      try {
        const token = await getIdToken();
        const secSuffix =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID().slice(0, 8)
            : Date.now().toString(36);
        const requestId = `renew_${Date.now()}_${secSuffix}`;
        const resp = await fetch('/api/tools/session/renew', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            toolSessionId: currentSession.toolSessionId,
            requestId,
          }),
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          const updatedSession: ToolSession = data.session;
          setSessions((prev) => ({ ...prev, [toolId]: updatedSession }));
          const secs = Math.max(0, Math.ceil((updatedSession.expiresAt - Date.now()) / 1000));
          setRemainingSeconds((prev) => ({ ...prev, [toolId]: secs }));

          // Sincronizar via BroadcastChannel com outras abas abertas
          channelRef.current?.postMessage({
            type: 'SESSION_RENEWED',
            toolId,
            session: updatedSession,
          });

          delete remoteRenewInProgressRef.current[toolId];
          await refreshWallet();
          return { success: true };
        } else {
          return { success: false, error: data.error || 'Falha ao renovar sessão.' };
        }
      } catch (err: any) {
        console.error('[ToolSessionContext] Erro ao renovar sessão:', err);
        return { success: false, error: err.message || 'Erro de rede na renovação.' };
      } finally {
        setIsRenewing((prev) => ({ ...prev, [toolId]: false }));
      }
    },
    [getIdToken, refreshWallet]
  );

  // Iniciar nova sessão
  const startSession = useCallback(
    async (toolId: PremiumToolId, autoRenew: boolean = false): Promise<{ success: boolean; error?: string }> => {
      if (!user) {
        return { success: false, error: 'Autenticação necessária.' };
      }

      setIsStarting((prev) => ({ ...prev, [toolId]: true }));
      try {
        const token = await getIdToken();
        const secSuffix =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID().slice(0, 8)
            : Date.now().toString(36);
        const requestId = `tool_sess_${Date.now()}_${secSuffix}`;
        const resp = await fetch('/api/tools/session/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            toolId,
            autoRenew,
            requestId,
          }),
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          const newSession: ToolSession = data.session;
          setSessions((prev) => ({ ...prev, [toolId]: newSession }));
          const secs = Math.max(0, Math.ceil((newSession.expiresAt - Date.now()) / 1000));
          setRemainingSeconds((prev) => ({ ...prev, [toolId]: secs }));

          // Sincronizar via BroadcastChannel com outras abas
          channelRef.current?.postMessage({
            type: 'SESSION_STARTED',
            toolId,
            session: newSession,
          });

          await refreshWallet();
          return { success: true };
        } else {
          return { success: false, error: data.error || 'Falha ao iniciar sessão da ferramenta.' };
        }
      } catch (err: any) {
        console.error('[ToolSessionContext] Erro ao iniciar sessão:', err);
        return { success: false, error: err.message || 'Erro de conexão.' };
      } finally {
        setIsStarting((prev) => ({ ...prev, [toolId]: false }));
      }
    },
    [user, getIdToken, refreshWallet]
  );

  // Alternar auto-renovação
  const toggleAutoRenew = useCallback(
    async (toolId: PremiumToolId, autoRenew: boolean): Promise<boolean> => {
      const currentSession = sessionsRef.current[toolId];
      if (!currentSession) return false;

      // Otimista
      setSessions((prev) => ({
        ...prev,
        [toolId]: prev[toolId] ? { ...prev[toolId]!, autoRenew } : null,
      }));

      try {
        const token = await getIdToken();
        const resp = await fetch('/api/tools/session/toggle-autorenew', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            toolSessionId: currentSession.toolSessionId,
            autoRenew,
          }),
        });
        return resp.ok;
      } catch (err) {
        console.warn('[ToolSessionContext] Erro ao alternar auto-renovação:', err);
        return false;
      }
    },
    [getIdToken]
  );

  // Encerrar sessão
  const endSession = useCallback(
    async (toolId: PremiumToolId): Promise<boolean> => {
      const currentSession = sessionsRef.current[toolId];
      if (!currentSession) return false;

      try {
        const token = await getIdToken();
        setSessions((prev) => ({ ...prev, [toolId]: null }));
        setRemainingSeconds((prev) => ({ ...prev, [toolId]: 0 }));

        channelRef.current?.postMessage({
          type: 'SESSION_ENDED',
          toolId,
        });

        await fetch('/api/tools/session/end', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ toolSessionId: currentSession.toolSessionId }),
        });
        return true;
      } catch (err) {
        console.warn('[ToolSessionContext] Erro ao encerrar sessão:', err);
        return false;
      }
    },
    [getIdToken]
  );

  // Tick timer a cada segundo e controle de expiração / auto-renovação com coordenação multi-aba
  useEffect(() => {
    const timer = setInterval(() => {
      const currentSessions = sessionsRef.current;
      const now = Date.now();

      Object.entries(currentSessions).forEach(([tId, session]) => {
        const toolId = tId as PremiumToolId;
        if (!session || session.status !== 'active') return;

        const leftMs = session.expiresAt - now;
        const leftSec = Math.max(0, Math.ceil(leftMs / 1000));

        setRemainingSeconds((prev) => ({ ...prev, [toolId]: leftSec }));

        // Se chegou ao fim do tempo de 4 minutos (0 segundos restantes)
        if (leftMs <= 0 && !isRenewingRef.current[toolId]) {
          if (session.autoRenew) {
            // Coordenação multi-aba: verificar se outra aba já iniciou renovação nos últimos 5 segundos
            const remoteLock = remoteRenewInProgressRef.current[toolId];
            if (remoteLock && now - remoteLock.timestamp < 5000) {
              // Outra aba já assumiu a liderança na renovação
              return;
            }

            // Anunciar intenção de renovação às demais abas
            channelRef.current?.postMessage({
              type: 'RENEW_IN_PROGRESS',
              toolId,
              tabId: tabIdRef.current,
              timestamp: now,
            });

            // Executar auto-renovação nesta aba
            renewSession(toolId);
          } else {
            // Expirou sem auto-renovação: marcar localmente como expirada
            setSessions((prev) => ({
              ...prev,
              [toolId]: prev[toolId] ? { ...prev[toolId]!, status: 'expired' } : null,
            }));
          }
        }
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [renewSession]);

  const isSessionActive = useCallback(
    (toolId: PremiumToolId): boolean => {
      const s = sessions[toolId];
      if (!s) return false;
      return s.status === 'active' && (remainingSeconds[toolId] ?? 0) > 0;
    },
    [sessions, remainingSeconds]
  );

  const getActiveSessionId = useCallback(
    (toolId: PremiumToolId): string | undefined => {
      const s = sessions[toolId];
      if (s && s.status === 'active' && (remainingSeconds[toolId] ?? 0) > 0) {
        return s.toolSessionId;
      }
      return undefined;
    },
    [sessions, remainingSeconds]
  );

  return (
    <ToolSessionContext.Provider
      value={{
        pricing,
        isLoadingPricing,
        sessions,
        remainingSeconds,
        isStarting,
        isRenewing,
        startSession,
        renewSession,
        toggleAutoRenew,
        endSession,
        isSessionActive,
        getActiveSessionId,
      }}
    >
      {children}
    </ToolSessionContext.Provider>
  );
};

export function useToolSession() {
  const ctx = useContext(ToolSessionContext);
  if (!ctx) {
    throw new Error('useToolSession must be used within a ToolSessionProvider');
  }
  return ctx;
}

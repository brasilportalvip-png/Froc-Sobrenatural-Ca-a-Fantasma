import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Download, Share2, X, WifiOff } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          title="Instalar Froc Sobrenatural como Aplicativo"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 rounded hover:bg-cyan-900/60 hover:border-cyan-400 transition cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.15)]"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Instalar App</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 rounded hover:bg-cyan-900/60 transition cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Instalar iOS</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-lg bg-[#0b121f] border border-cyan-500/50 p-5 shadow-2xl text-slate-100">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-cyan-400 tracking-wider uppercase font-mono">
                Instalar no iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed space-y-2 mb-4">
              1. Toque no botão <strong className="text-cyan-300">Compartilhar</strong> (ícone do quadrado com seta para cima) na barra inferior do Safari.<br />
              2. Role para baixo e selecione <strong className="text-cyan-300">Adicionar à Tela de Início</strong>.<br />
              3. O Froc será instalado como app autônomo com acesso a microfone e câmera.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 bg-cyan-600/30 border border-cyan-400/60 rounded text-xs font-semibold text-cyan-200 hover:bg-cyan-600/50 transition cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-950/80 border-b border-amber-600/50 px-3 py-1 flex items-center justify-center gap-2 text-xs text-amber-300">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
      <span>Modo Offline — O Froc continua operando com gravação local, sensores e armazenamento interno IndexedDB.</span>
    </div>
  );
};

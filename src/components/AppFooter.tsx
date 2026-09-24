import React from 'react';
import { Shield, Lock, FileText, Activity } from 'lucide-react';

interface AppFooterProps {
  onNavigate: (route: 'privacy' | 'terms' | 'painel' | 'communication') => void;
}

export const AppFooter: React.FC<AppFooterProps> = ({ onNavigate }) => {
  return (
    <footer className="mt-12 border-t border-slate-900 bg-[#04060b] text-slate-400 py-6 px-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-slate-300 font-bold tracking-wider">
            FROC SOBRENATURAL
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">Estação de Investigação Paranormal</span>
        </div>

        <nav aria-label="Links institucionais e legais" className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
          <button
            onClick={() => onNavigate('communication')}
            className="hover:text-cyan-300 transition cursor-pointer flex items-center gap-1"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Instrumentos</span>
          </button>
          <button
            onClick={() => onNavigate('painel')}
            className="hover:text-cyan-300 transition cursor-pointer flex items-center gap-1"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>Painel do Usuário</span>
          </button>
          <button
            onClick={() => onNavigate('privacy')}
            className="hover:text-cyan-300 transition cursor-pointer flex items-center gap-1"
          >
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Política de Privacidade (LGPD)</span>
          </button>
          <button
            onClick={() => onNavigate('terms')}
            className="hover:text-cyan-300 transition cursor-pointer flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Termos de Uso</span>
          </button>
        </nav>

        <div className="text-[10px] text-slate-500 text-center md:text-right">
          © {new Date().getFullYear()} Froc Sobrenatural • Cadeia de Evidência Auditável
        </div>
      </div>
    </footer>
  );
};

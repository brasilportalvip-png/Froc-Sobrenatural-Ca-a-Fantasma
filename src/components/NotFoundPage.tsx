import React from 'react';
import { AlertTriangle, ArrowLeft, Radio } from 'lucide-react';

export const NotFoundPage: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
  return (
    <main className="max-w-xl mx-auto p-4 sm:p-6 my-16 text-center space-y-6">
      <div className="bg-[#070d18] border border-cyan-500/40 rounded-xl p-8 shadow-2xl backdrop-blur-md">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4 animate-bounce" />
        <h1 className="text-4xl font-bold font-mono text-cyan-300 mb-2">404</h1>
        <h2 className="text-base font-bold font-mono text-slate-200 mb-2">
          Coordenada Não Encontrada
        </h2>
        <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto mb-6">
          O sinal ou rota solicitada não existe ou foi movida para outra dimensão investigativa.
        </p>

        <button
          onClick={onBackToApp}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold rounded-lg shadow-lg cursor-pointer transition"
        >
          <Radio className="w-4 h-4" />
          <span>Retornar à Central de Instrumentos</span>
        </button>
      </div>
    </main>
  );
};

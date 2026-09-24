import React from 'react';
import { FileText, ArrowLeft, AlertCircle, CheckCircle2, Shield } from 'lucide-react';

export const TermsOfUse: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 my-6 space-y-6">
      <div className="bg-[#070d18] border border-cyan-500/30 rounded-xl p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToApp}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg cursor-pointer transition"
              title="Voltar ao início"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold font-mono text-cyan-300">
                Termos de Uso &amp; Condições do Serviço
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Froc Sobrenatural Caça Fantasma • Vigência: 2026
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
            CONTRATO DE ADESÃO
          </span>
        </div>

        <div className="prose prose-invert max-w-none text-xs sm:text-sm text-slate-300 font-sans leading-relaxed space-y-4 pt-4">
          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              1. Aceitação e Objeto
            </h2>
            <p>
              Ao acessar ou utilizar a estação <strong>Froc Sobrenatural Caça Fantasma</strong>, o usuário concorda integralmente com estes Termos de Uso. A plataforma consiste em uma estação de instrumentação investigativa, telemetria de sensores reais de dispositivos e processamento analítico de sinais acústicos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              2. Mecânica de Créditos e Cobrança de Consultas
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong>Bônus Inicial:</strong> Usuários com e-mail verificado recebem 25 créditos de cortesia, resgatáveis uma única vez por titular.
              </li>
              <li>
                <strong>Custo da Consulta:</strong> Cada solicitação de análise forense de áudio ou interação no chat de investigação consome 5 créditos da carteira.
              </li>
              <li>
                <strong>Validade dos Resultados:</strong> Respostas com "Nenhum sinal detectado" ou "Padrão de ruído ambiente identificado" representam execuções analíticas válidas e completas, sendo devidamente debitadas.
              </li>
              <li>
                <strong>Garantia de Estorno por Falha Técnica:</strong> Caso ocorra indisponibilidade no servidor ou falha de conectividade que impeça a geração do laudo, a reserva de 5 créditos é estornada automaticamente para a carteira.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-cyan-400" />
              3. Isenção de Responsabilidade
            </h2>
            <p>
              A plataforma é destinada ao entretenimento, pesquisa amadora e experimentação acústica. O usuário é o único responsável pela sua integridade física e preservação do patrimônio durante inspeções de campo em locais ermos ou abandonados.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-slate-800 flex justify-end">
          <button
            onClick={onBackToApp}
            className="px-5 py-2 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-mono text-xs rounded-lg cursor-pointer transition"
          >
            Voltar aos Instrumentos
          </button>
        </div>
      </div>
    </main>
  );
};

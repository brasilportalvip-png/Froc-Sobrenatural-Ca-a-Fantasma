import React from 'react';
import { ShieldCheck, ArrowLeft, Lock, FileText, CheckCircle2 } from 'lucide-react';

export const PrivacyPolicy: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
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
                Política de Privacidade &amp; Proteção de Dados (LGPD)
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Froc Sobrenatural Caça Fantasma • Vigência: 2026
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
            CONFORMIDADE LGPD
          </span>
        </div>

        <div className="prose prose-invert max-w-none text-xs sm:text-sm text-slate-300 font-sans leading-relaxed space-y-4 pt-4">
          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              1. Princípios Gerais e Compromisso de Privacidade
            </h2>
            <p>
              A estação <strong>Froc Sobrenatural Caça Fantasma</strong> opera sob estrita conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD). Garantimos transparência, finalidade legítima, minimização da coleta e segurança técnica de ponta a ponta.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              2. Dados Coletados e Finalidade
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong>Identificação e Autenticação:</strong> Endereço de e-mail e identificador exclusivo fornecido pelo Firebase Authentication (UID). Utilizados unicamente para autenticar o acesso à plataforma e manter a integridade da sua carteira de créditos.
              </li>
              <li>
                <strong>Dados Financeiros e Pagamentos:</strong> Transações processadas via Mercado Pago (Checkout Pro). Não armazenamos números de cartão de crédito, códigos CVV ou credenciais bancárias em nossos servidores.
              </li>
              <li>
                <strong>Sinais Físicos e Gravações de Investigação:</strong> Capturas de áudio, leituras de acelerômetro e magnetômetro são processadas no navegador do usuário (client-side) e enviadas para análise forense sob demanda explícita do investigador. Evidências salvas são armazenadas localmente no IndexedDB do navegador do próprio operador.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              3. Isenção Científica e Metodológica
            </h2>
            <p>
              As análises de sinais e assistências investigativas fornecidas por modelos de inteligência artificial (Gemini) constituem ferramentas de apoio pericial para categorização de frequências acústicas e anomalias de sensores. <strong>Não constituem prova científica definitiva de existência ou atividade sobrenatural</strong>, devendo ser avaliadas criticamente pelo operador.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              4. Direitos do Titular (Art. 18 da LGPD)
            </h2>
            <p>
              O titular dos dados tem o direito de solicitar a qualquer momento a confirmação da existência de tratamento, o acesso aos dados, a correção de dados incompletos ou inexatos, e a exclusão definitiva de sua conta e carteira mediante contato com a equipe de suporte.
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

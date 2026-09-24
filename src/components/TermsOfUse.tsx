import React from 'react';
import { FileText, ArrowLeft, AlertCircle, CheckCircle2, Shield, Info } from 'lucide-react';

export const TermsOfUse: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 my-6 space-y-6">
      <div className="bg-[#070d18] border border-cyan-500/30 rounded-xl p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToApp}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg cursor-pointer transition"
              title="Voltar aos instrumentos"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold font-mono text-cyan-300">
                Termos e Condições de Uso da Estação
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Froc Sobrenatural Caça Fantasma • Atualização: Setembro de 2026
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
            TERMOS DE SERVIÇO
          </span>
        </div>

        <div className="prose prose-invert max-w-none text-xs sm:text-sm text-slate-300 font-sans leading-relaxed space-y-4 pt-4">
          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              1. Apresentação e Finalidade do Serviço
            </h2>
            <p>
              A aplicação <strong>Froc Sobrenatural Caça Fantasma</strong> fornece uma estação integrada para investigações de campo, oferecendo mostradores de sensores físicos (magnetômetro e movimento), gravador espectral de áudio, módulo Ouija digital, fotos com carimbo cronológico e módulo de testes cegos auditáveis.
            </p>
            <p className="text-slate-300">
              O serviço destina-se a fins experimentais, de pesquisa independente e entretenimento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              2. Mecânica de Créditos, Consultas e Pagamento
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-slate-300">
              <li>
                <strong>Bônus de Boas-Vindas:</strong> Usuários com e-mail verificado podem resgatar uma única vez 25 créditos de cortesia para testar a plataforma.
              </li>
              <li>
                <strong>Consumo por Consulta Pericial:</strong> Cada solicitação de análise forense de áudio ou interação no chat investigativo assistido consome <strong>5 créditos</strong> da carteira.
              </li>
              <li>
                <strong>Procedimento Transacional:</strong> Ao iniciar uma consulta, 5 créditos são primeiramente reservados (`reserved`). Se a análise for processada com êxito pelo modelo de IA, os 5 créditos são debitados em definitivo (`spent`).
              </li>
              <li>
                <strong>Garantia de Estorno Automático por Falha Técnica:</strong> Se ocorrer falha técnica no processamento, indisponibilidade temporária de rede ou interrupção do servidor antes da emissão do resultado, os 5 créditos reservados são liberados e estornados automaticamente de volta ao saldo disponível do usuário.
              </li>
              <li>
                <strong>Aquisição de Pacotes:</strong> Créditos adicionais podem ser adquiridos em pacotes (ex.: 50, 75 e 100 créditos) processados de forma segura pelo Mercado Pago. Os créditos são disponibilizados imediatamente após a aprovação formal do pagamento via webhook assinado.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              3. Natureza das Respostas e Limitações da IA
            </h2>
            <p>
              A análise espectral e as transcrições são geradas por algoritmos probabilísticos de processamento de sinais e inteligência artificial. Conclusões que apontem "Nenhum sinal anômalo", "Ruído ambiente de fundo" ou hipóteses céticas representam análises técnicas válidas e completas, sujeitas ao débito padrão do serviço.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              4. Segurança Pessoal em Investigações de Campo
            </h2>
            <p>
              O operador é o único responsável pela sua integridade física, respeito a propriedades privadas, cumprimento de normas locais e preservação de seus equipamentos durante investigações noturnas ou em campo. Recomendamos nunca realizar expedições desacompanhado e sempre portar iluminação auxiliar e meios de comunicação de emergência.
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-800 pt-4">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-cyan-400" />
              5. Suporte ao Investigador e Contato
            </h2>
            <p className="text-xs text-slate-300">
              Em caso de dúvidas sobre pedidos, recarga de carteira ou reporte de inconsistências:
            </p>
            <div className="bg-[#050b14] border border-cyan-500/20 p-3 rounded-lg text-xs font-mono text-cyan-300">
              Canal de Suporte: <strong className="text-slate-200">[INSERIR E-MAIL DE CONTATO DO RESPONSÁVEL]</strong>
              <div className="text-[10px] text-slate-400 mt-1">
                * Pendência pré-produção: definir canal de suporte ao cliente antes de aceitar pagamentos reais no Mercado Pago.
              </div>
            </div>
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

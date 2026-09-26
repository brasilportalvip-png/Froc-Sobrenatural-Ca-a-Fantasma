import React from 'react';
import { ShieldCheck, ArrowLeft, Lock, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export const PrivacyPolicy: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
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
                Política de Privacidade &amp; Tratamento de Dados
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Froc Sobrenatural Caça Fantasma • Atualização: Setembro de 2026
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
            PRÁTICAS LGPD
          </span>
        </div>

        <div className="prose prose-invert max-w-none text-xs sm:text-sm text-slate-300 font-sans leading-relaxed space-y-4 pt-4">
          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              1. Diretrizes Gerais e Privacidade por Concepção
            </h2>
            <p>
              O projeto <strong>Froc Sobrenatural Caça Fantasma</strong> adota boas práticas de proteção de dados pessoais, buscando alinhamento com os princípios de transparência, finalidade legítima e minimização previstos na Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              2. Dados Tratados e Funcionamento Técnico Real
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-slate-300">
              <li>
                <strong>Autenticação e Conta (Firebase Authentication):</strong> Coletamos e processamos o endereço de e-mail, identificador único (UID), provedor de login e status de verificação de e-mail estritamente para viabilizar login seguro e manter o saldo da sua carteira de créditos.
              </li>
              <li>
                <strong>Armazenamento no Banco de Dados (Firestore):</strong> O documento do seu perfil (<code>users/{'{uid}'}</code>) e carteira (<code>wallets/{'{uid}'}</code>) são gerenciados com regras estritas de segurança no servidor, impedindo modificações diretas ou forjadas pelo navegador.
              </li>
              <li>
                <strong>Sensores Físicos e Telemetria:</strong> As leituras de magnetômetro e acelerômetro do seu dispositivo são processadas localmente pelo navegador (client-side) para exibição em tempo real nos mostradores analógicos e digitais. Nenhum dado bruto contínuo de sensores é transmitido ou gravado permanentemente em servidores.
              </li>
              <li>
                <strong>Análise Espectral e Áudio Sob Demanda:</strong> Quando o operador clica para analisar uma gravação ou submete uma pergunta de controle, a amostra de áudio e métricas acústicas (dBFS, Hz) são transmitidas via conexão HTTPS segura para a API do Google Gemini para categorização pericial. As consultas concluídas geram registros de auditoria vinculados ao UID para controle do consumo dos créditos.
              </li>
              <li>
                <strong>Cadeia de Custódia e Evidências Salvas:</strong> Sessões de investigação, capturas de foto e registros de teste cego salvos permanecem armazenados localmente no banco de dados IndexedDB do seu próprio navegador.
              </li>
              <li>
                <strong>Pagamentos e Cobrança (Mercado Pago):</strong> Ao adquirir pacotes de créditos, a transação é processada diretamente nos servidores do Mercado Pago através do Checkout Pro. A nossa aplicação não coleta, não processa e não armazena números de cartão de crédito, códigos CVV ou senhas bancárias.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              3. Isenção Científica e Metodológica
            </h2>
            <p>
              As análises acústicas, transcrições candidatas e assistências fornecidas por modelos de inteligência artificial constituem ferramentas computacionais experimentais de apoio investigativo. Elas realizam categorização estatística de frequências e padrões de áudio e <strong>não constituem validação ou comprovação científica de fenômenos sobrenaturais</strong>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              4. Direitos do Titular (Art. 18 da LGPD)
            </h2>
            <p>
              Em conformidade com o Artigo 18 da LGPD, você pode requisitar confirmação do tratamento, cópia dos registros associados ao seu UID, retificação de dados cadastrais ou a exclusão da sua conta e registros correlatos.
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-800 pt-4">
            <h2 className="text-base font-bold font-mono text-cyan-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              5. Contato e Encarregado pelo Tratamento de Dados
            </h2>
            <p className="text-xs text-slate-300">
              Para exercer seus direitos de privacidade, dúvidas ou solicitações de exclusão de conta, entre em contato através do canal de atendimento do projeto:
            </p>
            <div className="bg-[#050b14] border border-cyan-500/20 p-3 rounded-lg text-xs font-mono text-cyan-300">
              Canal de Privacidade: <strong className="text-slate-200">brasilportalvip@gmail.com</strong>
              <div className="text-[10px] text-slate-400 mt-1">
                Encarregado pelo tratamento de dados e suporte a direitos de privacidade (LGPD).
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

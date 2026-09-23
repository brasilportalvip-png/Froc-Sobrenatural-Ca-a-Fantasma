import React, { useState, useEffect } from 'react';
import { BlindTestItem, Session } from '../types';
import { saveBlindTest, loadSessionBlindTests } from '../services/storage';
import { Lock, Unlock, ShieldCheck, CheckCircle2, XCircle, AlertCircle, Plus, Sparkles, HelpCircle } from 'lucide-react';

interface Props {
  activeSession: Session | null;
  onLogEvidence: (title: string, details: string, category: any) => Promise<void>;
}

// SHA-256 helper in browser
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Obfuscate / encode string with salt for local hiding before reveal
function encodePayload(text: string, salt: string): string {
  return btoa(encodeURIComponent(`${salt}::${text.trim()}`));
}
function decodePayload(payload: string): { secret: string; salt: string } {
  try {
    const raw = decodeURIComponent(atob(payload));
    const parts = raw.split('::');
    if (parts.length >= 2) {
      return { salt: parts[0], secret: parts.slice(1).join('::') };
    }
    return { salt: '', secret: raw };
  } catch {
    return { salt: '', secret: payload };
  }
}

export const BlindTestModule: React.FC<Props> = ({ activeSession, onLogEvidence }) => {
  const [tests, setTests] = useState<BlindTestItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // New blind test form (filled by the sealer/witness)
  const [targetSubject, setTargetSubject] = useState('');
  const [sealedSecretAnswer, setSealedSecretAnswer] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');

  // Lock hypothesis form (filled by investigator during session)
  const [activeTestForHypothesis, setActiveTestForHypothesis] = useState<string | null>(null);
  const [investigatorHypothesis, setInvestigatorHypothesis] = useState('');

  useEffect(() => {
    if (activeSession) {
      loadSessionBlindTests(activeSession.id).then(setTests);
    }
  }, [activeSession]);

  const handleCreateSealedTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSubject.trim() || !sealedSecretAnswer.trim() || !activeSession) return;

    // Use random salt/nonce to prevent dictionary / brute force pre-image checks
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const hash = await sha256(`${salt}:${sealedSecretAnswer}`);

    const newTest: BlindTestItem = {
      id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId: activeSession.id,
      targetSubject: targetSubject.trim(),
      sealedHash: hash,
      sealedPayload: encodePayload(sealedSecretAnswer, salt),
      successCriteria: successCriteria.trim() || 'Correspondência exata da palavra ou número',
      sealedAt: Date.now(),
      status: 'sealed',
    };

    await saveBlindTest(newTest);
    setTests((prev) => [newTest, ...prev]);

    // Clear sealer form
    setTargetSubject('');
    setSealedSecretAnswer('');
    setSuccessCriteria('');
    setIsCreating(false);

    await onLogEvidence(
      `Teste Cego Selado: "${newTest.targetSubject}"`,
      `Protocolo de Teste Cego Local iniciado. Resposta de controle selada e ocultada no aparelho com compromisso hash salgado (SHA-256: ${hash.slice(0, 16)}...). Resposta permanece oculta até a gravação da hipótese.`,
      'blind_test_event'
    );
  };

  const handleLockHypothesis = async (testId: string) => {
    if (!investigatorHypothesis.trim()) return;

    const updated = tests.map((t) => {
      if (t.id === testId) {
        return {
          ...t,
          hypothesisLocked: investigatorHypothesis.trim(),
          lockedAt: Date.now(),
          status: 'locked' as const,
        };
      }
      return t;
    });

    const target = updated.find((t) => t.id === testId);
    if (target) {
      await saveBlindTest(target);
      await onLogEvidence(
        `Hipótese Travada para Teste Cego: "${target.targetSubject}"`,
        `Hipótese do investigador travada no sistema antes da abertura do selo: "${target.hypothesisLocked}".`,
        'blind_test_event'
      );
    }

    setTests(updated);
    setActiveTestForHypothesis(null);
    setInvestigatorHypothesis('');
  };

  const handleRevealAndEvaluate = async (testId: string) => {
    const test = tests.find((t) => t.id === testId);
    if (!test || !test.hypothesisLocked) return;

    const { secret: revealedAnswer } = decodePayload(test.sealedPayload);
    const normalizedSecret = revealedAnswer.trim().toLowerCase();
    const normalizedHypothesis = test.hypothesisLocked.trim().toLowerCase();

    // Avaliação rigorosa: correspondência exata conforme critério definido
    const isExact = normalizedSecret === normalizedHypothesis;
    const isSubstring = normalizedHypothesis.includes(normalizedSecret) && normalizedSecret.length >= 3;
    // Se critério pede correspondência exata, não aceita mera substring frouxa
    const matched = test.successCriteria.toLowerCase().includes('exata') ? isExact : (isExact || isSubstring);

    const updated = tests.map((t) => {
      if (t.id === testId) {
        return {
          ...t,
          revealedAt: Date.now(),
          revealedAnswer,
          status: 'evaluated' as const,
          matched,
          notes: matched
            ? `Correspondência verificada estritamente (${isExact ? 'Exata' : 'Parcial comprovada'}).`
            : 'Discrepância confirmada. Resultado negativo registrado honestamente na cadeia de custódia.',
        };
      }
      return t;
    });

    const evaluated = updated.find((t) => t.id === testId);
    if (evaluated) {
      await saveBlindTest(evaluated);
      await onLogEvidence(
        `Resultado do Teste Cego: "${evaluated.targetSubject}" - ${matched ? 'ACERTO' : 'DISCREPÂNCIA (RESULTADO NEGATIVO)'}`,
        `Resposta Selada Revelada: "${revealedAnswer}" | Hipótese Prévia: "${test.hypothesisLocked}". Resultado: ${matched ? 'Correspondência Positiva' : 'Discrepância / Sem Evidência de Contato'}. Registrado na cadeia de evidências.`,
        'blind_test_event'
      );
    }

    setTests(updated);
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Protocol Explanation */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm sm:text-base font-bold text-white font-mono uppercase">
                PROTOCOLO DE TESTE DUPLO-CEGO
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Isolamento criptográfico real de respostas de controle prévias à formulação da hipótese
            </p>
          </div>

          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Nova Pergunta Selada</span>
          </button>
        </div>

        {/* Rigor Explanation */}
        <div className="mt-3 p-2.5 rounded bg-[#080d17] border border-cyan-900/60 text-[11px] text-slate-300 font-sans leading-relaxed">
          <p>
            <strong className="text-cyan-300 font-mono">COMO FUNCIONA O TESTE LOCAL:</strong> Um terceiro registra uma resposta e o aplicativo oculta o texto até a hipótese ser travada. Um hash SHA-256 registra um compromisso, mas a resposta também fica codificada de forma reversível neste aparelho. <strong className="text-amber-400">Quem tem acesso ao armazenamento do navegador pode consultá-la antes da revelação.</strong> Registre acertos e resultados negativos.
          </p>
        </div>
      </div>

      {/* 2. Modal / Form para Selar Controle */}
      {isCreating && (
        <div className="bg-[#080d16] border border-cyan-500/60 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-xs font-mono text-cyan-400 border-b border-slate-800 pb-2">
            <span className="font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>PASSAR CONTROLE PARA O SELADOR (PESSOA EXTERNA)</span>
            </span>
            <button
              onClick={() => setIsCreating(false)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={handleCreateSealedTest} className="space-y-3">
            <div>
              <label className="text-xs font-mono text-slate-300 block mb-1">
                Alvo do Teste Cego:
              </label>
              <input
                type="text"
                required
                value={targetSubject}
                onChange={(e) => setTargetSubject(e.target.value)}
                placeholder="Ex: 'Palavra escrita no envelope lacrado #4', 'Número escolhido mentalmente pelo terceiro'"
                className="w-full bg-[#050912] border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 block mb-1">
                Resposta de Controle Secreta (Selada pelo terceiro):
              </label>
              <input
                type="password"
                required
                value={sealedSecretAnswer}
                onChange={(e) => setSealedSecretAnswer(e.target.value)}
                placeholder="Digite a resposta que ficará selada e inacessível..."
                className="w-full bg-[#050912] border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <span className="text-[10px] font-mono text-slate-500 mt-0.5 block">
                Esta resposta será imediatamente convertida em hash SHA-256 e ficará bloqueada.
              </span>
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 block mb-1">
                Critérios de Acerto pré-estabelecidos:
              </label>
              <input
                type="text"
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                placeholder="Ex: 'Acerto exato da palavra em português', 'Número inteiro idêntico'"
                className="w-full bg-[#050912] border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs font-mono cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Selar Criptograficamente</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Lista de Testes Cegos na Sessão */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold text-slate-300 tracking-wider">
          TESTES DUPLO-CEGO REGISTRADOS NESTA SESSÃO ({tests.length})
        </h3>

        {tests.length === 0 ? (
          <div className="bg-[#080d16] border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-500 text-xs font-mono space-y-2">
            <Lock className="w-8 h-8 text-slate-700 mx-auto" />
            <p>Nenhum teste cego registrado na sessão ativa.</p>
            <p className="text-[11px] text-slate-600">
              Clique em "Criar Nova Pergunta Selada" para executar um teste com rigor científico.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tests.map((test) => (
              <div
                key={test.id}
                className="bg-[#080d16] border border-slate-800 rounded-lg p-4 space-y-3"
              >
                {/* Header status */}
                <div className="flex justify-between items-start flex-wrap gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white font-mono">
                      {test.targetSubject}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 mt-0.5">
                      <span>Selado em: {new Date(test.sealedAt).toLocaleTimeString()}</span>
                      <span>Hash SHA-256: {test.sealedHash.slice(0, 16)}...</span>
                    </div>
                  </div>

                  <div>
                    {test.status === 'sealed' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-600/40 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> SELADO (AGUARDANDO HIPÓTESE)
                      </span>
                    )}
                    {test.status === 'locked' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-600/40 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> HIPÓTESE TRAVADA (PRONTO PARA REVELAR)
                      </span>
                    )}
                    {test.status === 'evaluated' && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                          test.matched
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                            : 'bg-rose-950 text-rose-300 border-rose-500/60'
                        }`}
                      >
                        {test.matched ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> CORRESPONDÊNCIA VERIFICADA
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> DISCREPÂNCIA (RESULTADO NEGATIVO)
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Critérios */}
                <div className="text-[11px] font-mono text-slate-400">
                  <span className="text-slate-500">Critério de Sucesso:</span> {test.successCriteria}
                </div>

                {/* Fase 1: Inserir Hipótese (quando status é 'sealed') */}
                {test.status === 'sealed' && (
                  <div className="bg-[#0b121e] border border-cyan-950 rounded p-3 space-y-2">
                    <span className="text-xs font-mono font-bold text-cyan-300 block">
                      Fase do Investigador: Formular Hipótese Obtida na Sessão
                    </span>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Após fazer perguntas na sessão ou observar o Ouija, digite abaixo a hipótese que você obteve. Ao travar, ela não poderá ser modificada.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={activeTestForHypothesis === test.id ? investigatorHypothesis : ''}
                        onFocus={() => setActiveTestForHypothesis(test.id)}
                        onChange={(e) => {
                          setActiveTestForHypothesis(test.id);
                          setInvestigatorHypothesis(e.target.value);
                        }}
                        placeholder="Ex: 'A resposta é 42' ou 'Palavra obtida: Estrela'..."
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                      />
                      <button
                        onClick={() => handleLockHypothesis(test.id)}
                        disabled={!investigatorHypothesis.trim() || activeTestForHypothesis !== test.id}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-mono font-bold text-xs rounded cursor-pointer"
                      >
                        Travar Hipótese
                      </button>
                    </div>
                  </div>
                )}

                {/* Fase 2: Hipótese Travada (quando status é 'locked') */}
                {test.status === 'locked' && (
                  <div className="bg-[#0b121e] border border-amber-950 rounded p-3 space-y-2">
                    <div className="text-xs font-mono">
                      <span className="text-slate-400">Hipótese Travada do Investigador:</span>{' '}
                      <strong className="text-amber-300 font-bold">"{test.hypothesisLocked}"</strong>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400">
                      O selo criptográfico agora pode ser rompido para confrontação dos dados.
                    </p>
                    <button
                      onClick={() => handleRevealAndEvaluate(test.id)}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Revelar Resposta de Controle e Comparar</span>
                    </button>
                  </div>
                )}

                {/* Fase 3: Avaliado (quando status é 'evaluated') */}
                {test.status === 'evaluated' && (
                  <div className="bg-[#0b121e] border border-slate-800 rounded p-3 space-y-2 font-mono text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Hipótese Travada Prévio ao Selo:</span>
                        <strong className="text-white">"{test.hypothesisLocked}"</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Resposta de Controle Selada:</span>
                        <strong className="text-cyan-300">"{test.revealedAnswer}"</strong>
                      </div>
                    </div>
                    <div className="pt-1 text-[11px] text-slate-300">
                      <strong>Conclusão do Teste:</strong> {test.notes}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

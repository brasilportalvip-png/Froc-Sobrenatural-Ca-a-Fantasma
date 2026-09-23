import React, { useState, useEffect } from 'react';
import { Session, EvidenceItem } from '../types';
import { getAudioBlob } from '../services/storage';
import { AudioEngine } from '../services/audioEngine';
import {
  FileText,
  Volume2,
  Download,
  Filter,
  Trash2,
  Clock,
  Sparkles,
  ExternalLink,
  Printer,
  ChevronRight,
  Play,
  Pause,
  AlertCircle,
  ShieldCheck,
  Image as ImageIcon,
} from 'lucide-react';

interface Props {
  activeSession: Session | null;
  sessions: Session[];
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  evidenceList: EvidenceItem[];
  highlightedEvidenceId?: string | null;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onAddIndependentReview?: (evidenceId: string, reviewerName: string, heardText: string) => Promise<void>;
}

export const EvidenceModule: React.FC<Props> = ({
  activeSession,
  sessions,
  selectedSessionId,
  onSelectSession,
  evidenceList,
  highlightedEvidenceId,
  onDeleteSession,
  onAddIndependentReview,
}) => {
  const [selectedItem, setSelectedItem] = useState<EvidenceItem | null>(null);

  // Independent review form
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerHeard, setReviewerHeard] = useState('');

  // Audio Playback state
  const [rawAudioUrl, setRawAudioUrl] = useState<string | null>(null);
  const [treatedAudioUrl, setTreatedAudioUrl] = useState<string | null>(null);
  const [isPlayingRaw, setIsPlayingRaw] = useState(false);
  const [isPlayingTreated, setIsPlayingTreated] = useState(false);
  const [isProcessingFilter, setIsProcessingFilter] = useState(false);
  const rawAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const treatedAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Technical Report preview state
  const [showReportModal, setShowReportModal] = useState(false);

  // Select initial or highlighted item
  useEffect(() => {
    if (highlightedEvidenceId) {
      const match = evidenceList.find((e) => e.id === highlightedEvidenceId);
      if (match) {
        setSelectedItem(match);
        return;
      }
    }
    if (evidenceList.length > 0 && !selectedItem) {
      setSelectedItem(evidenceList[0]);
    }
  }, [highlightedEvidenceId, evidenceList]);

  // Load audio files when selected item changes
  useEffect(() => {
    let active = true;

    // Clean up previous URLs
    if (rawAudioUrl) URL.revokeObjectURL(rawAudioUrl);
    if (treatedAudioUrl) URL.revokeObjectURL(treatedAudioUrl);
    setRawAudioUrl(null);
    setTreatedAudioUrl(null);
    setIsPlayingRaw(false);
    setIsPlayingTreated(false);

    if (selectedItem?.audioId) {
      getAudioBlob(selectedItem.audioId).then(async (blob) => {
        if (!active || !blob) return;
        const rawUrl = URL.createObjectURL(blob);
        setRawAudioUrl(rawUrl);

        // Prepare treated copy (Bandpass 300Hz-3400Hz)
        setIsProcessingFilter(true);
        try {
          const treatedBuffer = await AudioEngine.processTreatedAudio(blob);
          if (treatedBuffer && active) {
            const treatedBlob = AudioEngine.audioBufferToWavBlob(treatedBuffer);
            const tUrl = URL.createObjectURL(treatedBlob);
            setTreatedAudioUrl(tUrl);
          }
        } finally {
          if (active) setIsProcessingFilter(false);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [selectedItem]);

  const togglePlayRaw = () => {
    if (!rawAudioRef.current) return;
    if (isPlayingRaw) {
      rawAudioRef.current.pause();
      setIsPlayingRaw(false);
    } else {
      if (treatedAudioRef.current && isPlayingTreated) {
        treatedAudioRef.current.pause();
        setIsPlayingTreated(false);
      }
      rawAudioRef.current.play();
      setIsPlayingRaw(true);
    }
  };

  const togglePlayTreated = () => {
    if (!treatedAudioRef.current) return;
    if (isPlayingTreated) {
      treatedAudioRef.current.pause();
      setIsPlayingTreated(false);
    } else {
      if (rawAudioRef.current && isPlayingRaw) {
        rawAudioRef.current.pause();
        setIsPlayingRaw(false);
      }
      treatedAudioRef.current.play();
      setIsPlayingTreated(true);
    }
  };

  const handleExportJson = () => {
    const data = {
      app: 'Froc Sobrenatural Caça Fantasma',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      session: sessions.find((s) => s.id === selectedSessionId),
      evidence: evidenceList,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `froc_cadeia_evidencias_${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Session Selector */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 sm:p-4 shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm sm:text-base font-bold text-white font-mono uppercase">
              CADEIA DE EVIDÊNCIA &amp; ANÁLISE COMPARATIVA
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Áudio original intocado, cópia filtrada independente e telemetria temporal
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedSessionId}
            onChange={(e) => onSelectSession(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({new Date(s.startTime).toLocaleDateString()})
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowReportModal(true)}
            className="px-3 py-1.5 bg-cyan-600/30 border border-cyan-400/60 hover:bg-cyan-600/50 text-cyan-200 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Gerar Relatório Técnico</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-xs font-mono flex items-center gap-1 transition cursor-pointer"
            title="Exportar arquivo JSON com cadeia de custódia completa"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {/* 2. Main Evidence Split Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Synchronized Timeline of Events */}
        <div className="lg:col-span-5 bg-[#080d16] border border-slate-800 rounded-lg p-3 space-y-3">
          <div className="flex justify-between items-center text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
            <span className="font-bold uppercase tracking-wider text-slate-200">
              LINHA DO TEMPO ({evidenceList.length})
            </span>
            <span>Clique para inspecionar</span>
          </div>

          {evidenceList.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 text-center py-10">
              Nenhum evento registrado nesta sessão.
            </p>
          ) : (
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {evidenceList.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-2.5 rounded border transition cursor-pointer flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                        : 'bg-[#0a111e] border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {item.formattedTime}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                          +{Math.floor(item.relativeTimeSec)}s
                        </span>
                        {item.audioId && (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                            <Volume2 className="w-2.5 h-2.5" /> ÁUDIO
                          </span>
                        )}
                        {item.photoDataUrl && (
                          <span className="text-[10px] text-amber-400 font-mono flex items-center gap-0.5">
                            <ImageIcon className="w-2.5 h-2.5" /> FOTO
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-200 font-medium line-clamp-1">
                        {item.questionText || item.title || item.details}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        {item.signalData && <span>dBFS: {item.signalData.dbfs.toFixed(0)}</span>}
                        {item.candidateTranscription ? (
                          <span className="text-cyan-300 font-semibold truncate max-w-[120px]">
                            "{item.candidateTranscription}"
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Sem resposta fonética</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 self-center" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Forensic Inspector of Selected Event */}
        <div className="lg:col-span-7 bg-[#080d16] border border-slate-800 rounded-lg p-4 space-y-4">
          {selectedItem ? (
            <>
              {/* Event Metadata Header */}
              <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                    DETALHE DA OCORRÊNCIA NA CADEIA DE CUSTÓDIA
                  </span>
                  <h3 className="text-sm font-bold text-white mt-1">
                    {selectedItem.questionText
                      ? `Pergunta: "${selectedItem.questionText}"`
                      : selectedItem.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1">
                    <span>Horário: <strong>{selectedItem.formattedTime}</strong></span>
                    <span>Deslocamento: <strong>{selectedItem.relativeTimeSec.toFixed(1)}s</strong></span>
                    <span>ID: <code className="text-slate-500">{selectedItem.id}</code></span>
                  </div>
                </div>
              </div>

              {/* Dual-Audio Comparison (Raw Original vs DSP Treated) */}
              {selectedItem.audioId && (
                <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <span>REPRODUÇÃO DE ÁUDIO (ORIGINAL vs FILTRADO)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      O arquivo original jamais é sobrescrito
                    </span>
                  </div>

                  {/* Audio Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* 1. Original Raw Audio */}
                    <div className="bg-slate-900 border border-slate-800 rounded p-2.5 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-mono">
                        <span className="text-slate-200 font-bold">1. ÁUDIO ORIGINAL BRUTO</span>
                        <span className="text-slate-500 text-[10px]">Sem filtros</span>
                      </div>
                      {rawAudioUrl ? (
                        <>
                          <audio
                            ref={rawAudioRef}
                            src={rawAudioUrl}
                            onEnded={() => setIsPlayingRaw(false)}
                            className="hidden"
                          />
                          <button
                            onClick={togglePlayRaw}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-mono text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                          >
                            {isPlayingRaw ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            <span>{isPlayingRaw ? 'Pausar Original' : 'Ouvir Original'}</span>
                          </button>
                          <a
                            href={rawAudioUrl}
                            download={`froc_original_${selectedItem.id}.webm`}
                            className="block text-center text-[10px] font-mono text-slate-400 hover:text-cyan-300 underline"
                          >
                            Baixar Gravação Original (.webm)
                          </a>
                        </>
                      ) : (
                        <p className="text-[10px] font-mono text-slate-500 text-center py-2">
                          Carregando áudio do IndexedDB...
                        </p>
                      )}
                    </div>

                    {/* 2. Treated Filtered Audio */}
                    <div className="bg-slate-900 border border-cyan-900/60 rounded p-2.5 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-mono">
                        <span className="text-cyan-300 font-bold">2. CÓPIA TRATADA (DSP)</span>
                        <span className="text-cyan-400 text-[10px]">Passa-faixa 300Hz-3.4kHz</span>
                      </div>
                      {isProcessingFilter ? (
                        <p className="text-[10px] font-mono text-cyan-400 text-center py-2 animate-pulse">
                          Aplicando filtro passa-faixa Web Audio...
                        </p>
                      ) : treatedAudioUrl ? (
                        <>
                          <audio
                            ref={treatedAudioRef}
                            src={treatedAudioUrl}
                            onEnded={() => setIsPlayingTreated(false)}
                            className="hidden"
                          />
                          <button
                            onClick={togglePlayTreated}
                            className="w-full py-2 bg-cyan-950/70 border border-cyan-600/60 hover:bg-cyan-900/70 text-cyan-200 rounded font-mono text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                          >
                            {isPlayingTreated ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            <span>{isPlayingTreated ? 'Pausar Tratado' : 'Ouvir Cópia Tratada'}</span>
                          </button>
                          <a
                            href={treatedAudioUrl}
                            download={`froc_tratado_${selectedItem.id}.wav`}
                            className="block text-center text-[10px] font-mono text-cyan-400 hover:text-cyan-200 underline"
                          >
                            Baixar Cópia Tratada (.wav)
                          </a>
                        </>
                      ) : (
                        <p className="text-[10px] font-mono text-slate-500 text-center py-2">
                          Filtro indisponível para este trecho.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Photo Display if applicable */}
              {selectedItem.photoDataUrl && (
                <div className="bg-[#0b121e] border border-slate-800 rounded-lg p-3 space-y-2">
                  <span className="text-xs font-mono font-bold text-amber-400 block">
                    CAPTURA VISUAL ASSOCIADA AO EVENTO
                  </span>
                  <img
                    src={selectedItem.photoDataUrl}
                    alt="Evidência visual"
                    className="w-full max-h-64 object-contain rounded bg-black border border-slate-800"
                  />
                  <p className="text-[11px] font-mono text-slate-400">{selectedItem.details}</p>
                </div>
              )}

              {/* Telemetry Readings at the exact instant */}
              {selectedItem.signalData && (
                <div className="bg-[#0a101c] border border-slate-800 rounded-lg p-3 space-y-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 block">
                    TELEMETRIA REGISTRADA NO MILISSEGUNDO EXATO
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="bg-slate-900 p-2 rounded">
                      <span className="text-slate-500 text-[10px] block">Nível Digital:</span>
                      <strong className="text-white">{selectedItem.signalData.dbfs.toFixed(1)} dBFS</strong>
                    </div>
                    <div className="bg-slate-900 p-2 rounded">
                      <span className="text-slate-500 text-[10px] block">Pico Espectral:</span>
                      <strong className="text-cyan-400">{selectedItem.signalData.peakFrequencyHz} Hz</strong>
                    </div>
                    <div className="bg-slate-900 p-2 rounded">
                      <span className="text-slate-500 text-[10px] block">Magnetômetro:</span>
                      <strong className="text-purple-300">
                        {selectedItem.signalData.magneticMagnitudeUtd !== undefined
                          ? `${selectedItem.signalData.magneticMagnitudeUtd} µT`
                          : 'N/A'}
                      </strong>
                    </div>
                    <div className="bg-slate-900 p-2 rounded">
                      <span className="text-slate-500 text-[10px] block">Movimento Celular:</span>
                      <strong className="text-amber-300">
                        {selectedItem.signalData.motionMagnitude !== undefined
                          ? `${selectedItem.signalData.motionMagnitude} m/s²`
                          : 'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Analysis & Alternative Hypotheses */}
              <div className="bg-[#0a101c] border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                <span className="font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                  AVALIAÇÃO DE INTELIGIBILIDADE &amp; HIPÓTESES ALTERNATIVAS
                </span>
                <p className="text-slate-300 leading-relaxed font-sans">
                  {selectedItem.aiAnalysis?.conclusion ||
                    selectedItem.details ||
                    'Sem transcrição ou fala inteligível confirmada.'}
                </p>

                {selectedItem.aiAnalysis?.alternativeHypotheses && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                    <span className="text-amber-400 font-bold block mb-1">
                      Hipóteses Naturais Consideradas:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                      {selectedItem.aiAnalysis.alternativeHypotheses.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Origem e Cadeia do Possível Nome (se detectado fonema) */}
              {selectedItem.possibleName && (
                <div className="bg-[#0b1322] border border-cyan-500/70 rounded-lg p-3 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 uppercase">
                      FICHA DO CANDIDATO FONÉTICO
                    </span>
                    <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-600/40 rounded text-[10px]">
                      NÃO COMPROVADO
                    </span>
                  </div>
                  <div className="text-slate-300 space-y-1 text-[11px]">
                    <p>
                      <strong>Possível nome:</strong> <span className="text-cyan-200 text-sm font-bold">"{selectedItem.possibleName.name}"</span>
                    </p>
                    <p>
                      <strong>Fonte da gravação:</strong> Áudio bruto original (intocado)
                    </p>
                    <p>
                      <strong>Trecho estimado:</strong> {selectedItem.possibleName.segmentTime}
                    </p>
                    <p className="text-amber-300 text-[10px] mt-1 leading-tight">
                      Aviso legal e pericial: Qualquer declaração fonética não equivale à identificação de um falecido ou entidade. A identidade permanece não confirmada.
                    </p>
                  </div>
                </div>
              )}

              {/* Avaliação Cega Independente (Multi-ouvintes sem sugestão prévia) */}
              <div className="bg-[#0a101c] border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center font-mono">
                  <span className="font-bold text-purple-400 uppercase tracking-wide">
                    AVALIAÇÃO CEGA INDEPENDENTE (PAREIDOLIA CHECK)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Ouvir o áudio sem ler o texto prévio
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans leading-tight">
                  Peça a um colega ou testemunha que ouça o trecho acima sem ver a tela e anote o que ouviu. Se cada ouvinte reportar palavras completamente diferentes, trata-se de pareidolia acústica.
                </p>

                {selectedItem.independentReviews && selectedItem.independentReviews.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800 font-mono text-[11px]">
                    <span className="text-slate-400 font-semibold block">Registros de Ouvintes Independentes:</span>
                    {selectedItem.independentReviews.map((rev, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                        <span><strong>{rev.reviewerName}:</strong> "{rev.heardText}"</span>
                        <span className="text-slate-500 text-[10px]">{new Date(rev.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form to submit blind review */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 block font-semibold">
                    + Adicionar Anotação de Novo Ouvinte (Cego):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome / ID do Ouvinte"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                    />
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="O que ouviu sem ver a tela?"
                        value={reviewerHeard}
                        onChange={(e) => setReviewerHeard(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                      />
                      <button
                        onClick={async () => {
                          if (!reviewerName.trim() || !reviewerHeard.trim() || !selectedItem) return;
                          if (onAddIndependentReview) {
                            await onAddIndependentReview(selectedItem.id, reviewerName.trim(), reviewerHeard.trim());
                            setReviewerName('');
                            setReviewerHeard('');
                          }
                        }}
                        disabled={!reviewerName.trim() || !reviewerHeard.trim()}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs font-mono font-bold cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs font-mono text-slate-500 text-center py-16">
              Selecione um evento na linha do tempo ao lado para examinar a cadeia de custódia.
            </p>
          )}
        </div>
      </div>

      {/* 3. Modal: Relatório Técnico de Sessão Completo */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#090f1a] border border-cyan-500/60 rounded-xl shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex justify-between items-start border-b border-slate-700 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold font-mono text-cyan-400 uppercase">
                  RELATÓRIO TÉCNICO DE INVESTIGAÇÃO FORENSE
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Froc Sobrenatural Caça Fantasma — Protocolo de Cadeia de Evidência v1.0
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono cursor-pointer"
                >
                  Imprimir / PDF
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-slate-400 hover:text-white px-2 py-1 font-mono text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Session Metadata */}
            <div className="bg-slate-900 p-3 rounded font-mono text-xs space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Sessão:</span>{' '}
                  <strong className="text-white">
                    {sessions.find((s) => s.id === selectedSessionId)?.title}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Investigador:</span>{' '}
                  <strong className="text-white">
                    {sessions.find((s) => s.id === selectedSessionId)?.investigatorName || 'Investigador Principal'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Data de Início:</span>{' '}
                  <strong className="text-white">
                    {new Date(
                      sessions.find((s) => s.id === selectedSessionId)?.startTime || 0
                    ).toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Total de Eventos:</span>{' '}
                  <strong className="text-cyan-400">{evidenceList.length} ocorrências</strong>
                </div>
              </div>
            </div>

            {/* Scientific Methodology & Limitations */}
            <div className="space-y-2 text-xs font-sans text-slate-300 leading-relaxed">
              <h4 className="font-mono font-bold text-cyan-300 uppercase text-xs">
                1. METODOLOGIA &amp; LIMITAÇÕES DO HARDWARE
              </h4>
              <p>
                Este experimento baseia-se na hipótese nula de que anomalias em áudio e campos magnéticos decorrem de fenômenos ambientais, acústicos ou artefatos de hardware até que se prove o contrário. As gravações originais são preservadas de modo imutável via IndexedDB. Filtros de processamento de sinal digital (DSP) são executados em cópias separadas sem sobrepor o dado original. O equipamento móvel possui limitações de diafragma no microfone e sensores magnéticos não calibrados em câmara blindada.
              </p>
            </div>

            {/* Summary of Evidence Table */}
            <div className="space-y-2 font-mono text-xs">
              <h4 className="font-bold text-cyan-300 uppercase">
                2. TABELA SINCRONIZADA DE OCORRÊNCIAS
              </h4>
              <div className="border border-slate-800 rounded overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="p-2">Hora</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Pergunta / Detalhe</th>
                      <th className="p-2">dBFS</th>
                      <th className="p-2">Transcrição Candidata</th>
                      <th className="p-2">Conclusão Forense</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {evidenceList.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-900/40">
                        <td className="p-2 text-cyan-300">{ev.formattedTime}</td>
                        <td className="p-2 text-slate-400 uppercase text-[10px]">{ev.category}</td>
                        <td className="p-2 text-slate-200">{ev.questionText || ev.title}</td>
                        <td className="p-2 text-emerald-400">{ev.signalData?.dbfs.toFixed(0) || '-'}</td>
                        <td className="p-2 text-slate-300">
                          {ev.candidateTranscription ? `"${ev.candidateTranscription}"` : 'Nenhuma'}
                        </td>
                        <td className="p-2 text-slate-400 text-[10px] max-w-xs truncate">
                          {ev.aiAnalysis?.conclusion || ev.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs rounded cursor-pointer"
              >
                Fechar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

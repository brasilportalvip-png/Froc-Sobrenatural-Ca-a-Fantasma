import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraOff, RefreshCw, Eye, ShieldAlert, Sparkles, Image, Check, AlertTriangle } from 'lucide-react';
import { Session, EvidenceItem } from '../types';

interface Props {
  activeSession: Session | null;
  onSavePhotoEvidence: (photoDataUrl: string, analysisNote: string) => Promise<void>;
  evidenceList: EvidenceItem[];
}

export const VisionModule: React.FC<Props> = ({
  activeSession,
  onSavePhotoEvidence,
  evidenceList,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Optical variation / motion contour analyzer state (honest pixel difference without fabricated shape recognition)
  const [motionPercent, setMotionPercent] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFlash, setCapturedFlash] = useState(false);

  // Filter mode for inspection (explicitly labeled as standard digital luminance filters, NOT thermal or x-ray)
  const [inspectionFilter, setInspectionFilter] = useState<'none' | 'high_contrast' | 'edge_enhance'>('none');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastFrameDataRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setCameraError(err.message || 'Permissão de câmera negada ou câmera ocupada por outro aplicativo.');
      setCameraActive(false);
    }
  };

  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  // Optical analysis loop (frame luminance delta) with refs to avoid re-rendering effects every frame
  useEffect(() => {
    if (!cameraActive) return;

    let animId: number;
    let lastTime = 0;

    const processFrame = (time: number) => {
      // Throttle to max 15 FPS for battery and performance efficiency
      if (time - lastTime > 66) {
        lastTime = time;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.drawImage(video, 0, 0, w, h);

            const frame = ctx.getImageData(0, 0, w, h);
            const data = frame.data;
            const prev = lastFrameDataRef.current;

            // Compare with previous frame
            if (prev && prev.length === data.length) {
              let diffSum = 0;
              const totalPixels = w * h;

              // Sample every 4th pixel for high performance
              for (let i = 0; i < data.length; i += 16) {
                const lumCurrent = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const lumLast = 0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2];
                const d = Math.abs(lumCurrent - lumLast);
                if (d > 25) {
                  diffSum++;
                }
              }

              const pct = Math.min(100, (diffSum / (totalPixels / 4)) * 100);
              setMotionPercent(Number(pct.toFixed(1)));
            }

            // Save copy for next iteration
            lastFrameDataRef.current = new Uint8ClampedArray(data);
          }
        }
      }
      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraActive]);

  // Clean unmount using current ref
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Capture still photograph into session evidence
  const handleCapturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;

    setIsCapturing(true);
    setCapturedFlash(true);
    setTimeout(() => setCapturedFlash(false), 200);

    const video = videoRef.current;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth || 1280;
    captureCanvas.height = video.videoHeight || 720;
    const ctx = captureCanvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      const photoDataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);

      const note = `Captura fotográfica durante sessão. Variação óptica de pixels no instante: ${motionPercent}%. Filtro aplicado: ${inspectionFilter}. Classificação: registro óptico bruto para verificação humana.`;

      await onSavePhotoEvidence(photoDataUrl, note);
    }

    setIsCapturing(false);
  };

  const photoEvidence = evidenceList.filter((e) => e.category === 'photo_capture' && e.photoDataUrl);

  return (
    <div className="space-y-4">
      {/* 1. Hardware Disclaimer Banner */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs uppercase mb-1">
          <Eye className="w-4 h-4" />
          <span>MÓDULO DE VISÃO ÓPTICA &amp; REGISTRO DE IMAGEM</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
          A câmera capta imagens reais com marcação temporal sincronizada à sessão. O software analisa variações de luminância e contraste entre quadros.
        </p>
        <div className="mt-2 p-2 bg-amber-950/40 border border-amber-600/40 rounded flex items-start gap-2 text-[11px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Aviso de Rigor Físico:</strong> Celulares e navegadores não possuem visão noturna verdadeira, térmica ou raio X. Câmera térmica requer hardware externo específico (ex: sensor infravermelho microbolômetro); raio X não existe em sensores CMOS de celular. Sombras e poeira suspensa (orbs) devem ser analisadas com ceticismo.
          </span>
        </div>
      </div>

      {/* 2. Live Camera Viewport */}
      <div className="bg-[#070c14] border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-xs font-mono font-bold text-slate-200 uppercase">
              {cameraActive ? 'Transmissão Óptica Ativa' : 'Câmera Desligada'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {cameraActive ? (
              <>
                <button
                  onClick={toggleFacingMode}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                  title="Alternar câmera frontal / traseira"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span className="hidden sm:inline">{facingMode === 'environment' ? 'Traseira' : 'Frontal'}</span>
                </button>
                <button
                  onClick={stopCamera}
                  className="px-2.5 py-1 bg-rose-950/70 border border-rose-600 text-rose-300 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                >
                  <CameraOff className="w-3 h-3" />
                  <span>Desligar</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => startCamera('environment')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.2)]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Ativar Câmera</span>
              </button>
            )}
          </div>
        </div>

        {/* Viewport frame */}
        <div className="relative aspect-video max-h-[420px] w-full bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
          {cameraActive ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  inspectionFilter === 'high_contrast'
                    ? 'contrast-200 grayscale'
                    : inspectionFilter === 'edge_enhance'
                    ? 'contrast-150 brightness-110 saturate-50'
                    : ''
                }`}
              />
              <canvas ref={canvasRef} width={320} height={180} className="hidden" />

              {/* Flash effect upon capture */}
              {capturedFlash && <div className="absolute inset-0 bg-white/70 animate-out fade-out duration-200" />}

              {/* Forensic Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none border border-cyan-500/20 m-3 flex flex-col justify-between p-2 font-mono text-[10px] text-cyan-400">
                <div className="flex justify-between items-start">
                  <div className="bg-black/60 px-2 py-1 rounded backdrop-blur-sm">
                    <div>FROC OPTICAL RETICLE</div>
                    <div className="text-slate-400">VARIAÇÃO: {motionPercent}%</div>
                  </div>
                  <div className="bg-black/60 px-2 py-1 rounded backdrop-blur-sm text-right">
                    <div>DELTA PIXELS: {motionPercent}%</div>
                    <div className="text-slate-400">AVISO: PAREIDOLIA HUMANA</div>
                  </div>
                </div>

                {/* Center crosshair */}
                <div className="self-center my-auto w-12 h-12 border border-cyan-400/30 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-cyan-400/60 rounded-full" />
                </div>

                <div className="flex justify-between items-end">
                  <div className="bg-black/60 px-2 py-0.5 rounded text-[9px] text-slate-400">
                    MODO: {facingMode.toUpperCase()}
                  </div>
                  <div className="bg-black/60 px-2 py-0.5 rounded text-[9px] text-cyan-300">
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Shutter Button */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                <button
                  onClick={handleCapturePhoto}
                  disabled={isCapturing}
                  className="px-4 py-2 bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs rounded-full flex items-center gap-2 shadow-[0_0_15px_#00f0ff] transition cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>REGISTRAR FOTO NA CADEIA</span>
                </button>
              </div>
            </>
          ) : (
            <div className="text-center p-6 text-slate-500 font-mono text-xs space-y-3">
              <Camera className="w-12 h-12 mx-auto text-slate-700" />
              <p>Câmera desativada no momento.</p>
              {cameraError && <p className="text-rose-400 max-w-sm mx-auto">{cameraError}</p>}
            </div>
          )}
        </div>

        {/* Filter controls */}
        {cameraActive && (
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Realces de Luminância Óptica:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setInspectionFilter('none')}
                className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                  inspectionFilter === 'none'
                    ? 'bg-cyan-900 border border-cyan-400 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Padrão (Fiel)
              </button>
              <button
                onClick={() => setInspectionFilter('high_contrast')}
                className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                  inspectionFilter === 'high_contrast'
                    ? 'bg-cyan-900 border border-cyan-400 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Alto Contraste
              </button>
              <button
                onClick={() => setInspectionFilter('edge_enhance')}
                className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                  inspectionFilter === 'edge_enhance'
                    ? 'bg-cyan-900 border border-cyan-400 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Realce de Bordas
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Fotos Capturadas na Sessão */}
      <div className="bg-[#090f1a] border border-slate-800 rounded-lg p-3 sm:p-4">
        <h3 className="text-xs font-mono font-bold text-slate-300 tracking-wider flex items-center gap-2 mb-3">
          <Image className="w-4 h-4 text-cyan-400" />
          <span>FOTOS REGISTRADAS NESTA SESSÃO ({photoEvidence.length})</span>
        </h3>

        {photoEvidence.length === 0 ? (
          <p className="text-xs font-mono text-slate-500 text-center py-6 border border-dashed border-slate-800/80 rounded">
            Nenhuma fotografia capturada na sessão ativa.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {photoEvidence.map((ev) => (
              <div
                key={ev.id}
                className="bg-[#0b1322] border border-slate-800 rounded overflow-hidden space-y-2 p-2"
              >
                <img
                  src={ev.photoDataUrl}
                  alt={ev.title}
                  className="w-full aspect-video object-cover rounded bg-black"
                />
                <div className="text-[11px] font-mono text-slate-400 flex justify-between items-center">
                  <span className="text-cyan-400 font-semibold">{ev.formattedTime}</span>
                  <span className="text-slate-500">ID: {ev.id.slice(0, 8)}</span>
                </div>
                <p className="text-[11px] text-slate-300 font-sans line-clamp-2">{ev.details}</p>
                <a
                  href={ev.photoDataUrl}
                  download={`froc_evidencia_${ev.id}.jpg`}
                  className="inline-block text-[11px] font-mono text-cyan-400 hover:underline"
                >
                  Baixar Imagem Original
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

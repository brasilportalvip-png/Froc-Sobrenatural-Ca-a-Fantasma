import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Eye,
  Sliders,
  Sun,
  Layers,
  Sparkles,
  Zap,
  Image,
  AlertTriangle,
  ZoomIn,
  Activity,
  Maximize2,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Session, EvidenceItem } from '../types';
import {
  VisionMode,
  EdgeEnhanceLevel,
  VisionEngineOptions,
  VisionMetrics,
  DEFAULT_VISION_OPTIONS,
  FrameAccumulator,
  processVisionFrame,
} from '../services/visionEngine';

interface Props {
  activeSession: Session | null;
  onSavePhotoEvidence: (
    photoDataUrl: string,
    analysisNote: string,
    visionMetadata?: any
  ) => Promise<void>;
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
  const accumulatorRef = useRef<FrameAccumulator>(new FrameAccumulator());
  const lastProcessedDataRef = useRef<Uint8ClampedArray | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamResolution, setStreamResolution] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });

  // Real Hardware Capabilities
  const [hasTorch, setHasTorch] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({
    min: 1,
    max: 1,
    step: 0.1,
  });
  const [zoomValue, setZoomValue] = useState<number>(1);
  const [hasExposure, setHasExposure] = useState(false);
  const [exposureRange, setExposureRange] = useState<{ min: number; max: number; step: number }>({
    min: 0,
    max: 0,
    step: 0.1,
  });
  const [exposureValue, setExposureValue] = useState<number>(0);

  // Vision Engine Options
  const [engineOptions, setEngineOptions] = useState<VisionEngineOptions>(DEFAULT_VISION_OPTIONS);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  // Live Metrics
  const [liveMetrics, setLiveMetrics] = useState<VisionMetrics>({
    avgLuminance: 0,
    minLuminance: 0,
    maxLuminance: 0,
    histogram: new Uint32Array(256),
    motionPercent: 0,
    appliedGain: 1.0,
    lightCategory: 'moderate',
  });

  // Shutter & Capturing State
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFlash, setCapturedFlash] = useState(false);
  const [captureSuccessMsg, setCaptureSuccessMsg] = useState<string | null>(null);

  // Stop Camera Tracks cleanly
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
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
    accumulatorRef.current.reset();
    lastProcessedDataRef.current = null;
    setCameraActive(false);
    setTorchActive(false);
  }, []);

  // Inspect and extract real hardware capabilities from the video track
  const inspectTrackCapabilities = (track: MediaStreamTrack) => {
    try {
      if (typeof track.getCapabilities === 'function') {
        const caps: any = track.getCapabilities();

        // 1. Torch
        if ('torch' in caps) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }

        // 2. Zoom
        if ('zoom' in caps && caps.zoom) {
          setHasZoom(true);
          setZoomRange({
            min: caps.zoom.min ?? 1,
            max: caps.zoom.max ?? 1,
            step: caps.zoom.step ?? 0.1,
          });
          const settings: any = track.getSettings();
          setZoomValue(settings.zoom ?? caps.zoom.min ?? 1);
        } else {
          setHasZoom(false);
        }

        // 3. Exposure Compensation
        if ('exposureCompensation' in caps && caps.exposureCompensation) {
          setHasExposure(true);
          setExposureRange({
            min: caps.exposureCompensation.min ?? -2,
            max: caps.exposureCompensation.max ?? 2,
            step: caps.exposureCompensation.step ?? 0.1,
          });
          const settings: any = track.getSettings();
          setExposureValue(settings.exposureCompensation ?? 0);
        } else {
          setHasExposure(false);
        }
      } else {
        setHasTorch(false);
        setHasZoom(false);
        setHasExposure(false);
      }
    } catch (e) {
      console.warn('Erro ao inspecionar capabilities da câmera:', e);
    }
  };

  // Start Camera with Requested Facing Mode
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        inspectTrackCapabilities(videoTrack);
        const settings = videoTrack.getSettings();
        if (settings.width && settings.height) {
          setStreamResolution({ width: settings.width, height: settings.height });
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setCameraActive(true);
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setCameraError(
        err.message || 'Permissão de câmera negada ou câmera em uso por outro aplicativo.'
      );
      setCameraActive(false);
    }
  };

  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  // Hardware Torch Toggle
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !torchActive;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchActive(nextTorch);
    } catch (err) {
      console.warn('Falha ao acionar lanterna do dispositivo:', err);
    }
  };

  // Hardware Zoom Change
  const handleZoomChange = async (val: number) => {
    setZoomValue(val);
    if (!streamRef.current || !hasZoom) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      await (track as any).applyConstraints({
        advanced: [{ zoom: val }],
      });
    } catch (err) {
      console.warn('Falha ao aplicar zoom:', err);
    }
  };

  // Hardware Exposure Compensation Change
  const handleExposureChange = async (val: number) => {
    setExposureValue(val);
    if (!streamRef.current || !hasExposure) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      await (track as any).applyConstraints({
        advanced: [{ exposureCompensation: val }],
      });
    } catch (err) {
      console.warn('Falha ao aplicar compensação de exposição:', err);
    }
  };

  // Processing render loop on Canvas 2D
  useEffect(() => {
    if (!cameraActive) return;

    let lastMetricsUpdateTime = 0;

    const renderLoop = (timestamp: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && !video.paused && !video.ended) {
        // Adjust canvas internal dimensions to match video stream resolution
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        // Downscale processing buffer to max 640x360 for consistent 20-30 FPS on mobile
        const procW = Math.min(640, vw);
        const procH = Math.round((procW / vw) * vh);

        if (canvas.width !== procW || canvas.height !== procH) {
          canvas.width = procW;
          canvas.height = procH;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          // Draw raw camera feed into canvas
          ctx.drawImage(video, 0, 0, procW, procH);

          // Extract frame pixels for real processing
          const imgData = ctx.getImageData(0, 0, procW, procH);

          // Process pixels via LowLightEngine
          const metrics = processVisionFrame(
            imgData,
            engineOptions,
            accumulatorRef.current,
            lastProcessedDataRef.current
          );

          // Write processed pixels back into canvas viewport
          ctx.putImageData(imgData, 0, 0);

          // Keep copy for next frame motion delta calculation
          lastProcessedDataRef.current = new Uint8ClampedArray(imgData.data);

          // Throttle state update to 5Hz to avoid React UI thrashing
          if (timestamp - lastMetricsUpdateTime > 200) {
            lastMetricsUpdateTime = timestamp;
            setLiveMetrics(metrics);
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [cameraActive, engineOptions]);

  // Clean unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Capture photograph from the PROCESSED Canvas
  const handleCapturePhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !cameraActive || isCapturing) return;

    setIsCapturing(true);
    setCapturedFlash(true);
    setTimeout(() => setCapturedFlash(false), 200);

    try {
      // Extract processed pixels directly from active Canvas
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      const modeLabels: Record<VisionMode, string> = {
        standard: 'Padrão (Fiel)',
        low_light: 'Realce de Baixa Luz',
        green_filter: 'Filtro Visual Verde',
        frame_stacking: 'Acumulação de Frames',
      };

      const note = [
        `Registro óptico forense [Modo: ${modeLabels[engineOptions.mode]}].`,
        `Ganho aplicado: ${liveMetrics.appliedGain}x (Gamma: ${engineOptions.gamma}).`,
        `Luminância média: ${liveMetrics.avgLuminance}/255 (${liveMetrics.lightCategory}).`,
        `Variação óptica de pixels no instante: ${liveMetrics.motionPercent}%.`,
        engineOptions.mode === 'frame_stacking'
          ? `Acumulação ativa (${engineOptions.frameStackCount} frames). Possível presença de ghosting.`
          : '',
        hasTorch && torchActive ? 'Lanterna física ativada.' : '',
        hasZoom && zoomValue > 1 ? `Zoom óptico/digital: ${zoomValue.toFixed(1)}x.` : '',
        'Classificação pericial: Registro bruto processado localmente. Sujeito a ruído térmico de sensor digital.',
      ]
        .filter(Boolean)
        .join(' ');

      const visionMetadata = {
        mode: engineOptions.mode,
        gain: engineOptions.gain,
        gamma: engineOptions.gamma,
        appliedGain: liveMetrics.appliedGain,
        avgLuminance: liveMetrics.avgLuminance,
        lightCategory: liveMetrics.lightCategory,
        frameStacking: engineOptions.mode === 'frame_stacking',
        stackedFramesCount:
          engineOptions.mode === 'frame_stacking' ? engineOptions.frameStackCount : undefined,
        temporalDenoise: engineOptions.temporalDenoise,
        edgeEnhance: engineOptions.edgeEnhance,
        histogramStretched: engineOptions.histogramStretch,
        motionPercent: liveMetrics.motionPercent,
        cameraCapabilities: {
          torchSupported: hasTorch,
          torchActive: torchActive,
          zoomSupported: hasZoom,
          zoomValue: zoomValue,
          exposureSupported: hasExposure,
          exposureValue: exposureValue,
          facingMode,
        },
        forensicDisclaimer:
          'Câmeras de dispositivos móveis não possuem visão noturna física ou sensores infravermelhos passivos. Variações ópticas podem decorrer de ruído eletrônico ou compressão.',
      };

      await onSavePhotoEvidence(photoDataUrl, note, visionMetadata);
      setCaptureSuccessMsg('Fotografia forense salva na cadeia de evidências!');
      setTimeout(() => setCaptureSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Erro ao capturar foto forense:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const photoEvidence = evidenceList.filter((e) => e.category === 'photo_capture' && e.photoDataUrl);

  return (
    <div className="space-y-4">
      {/* 1. Rigor Físico e Aviso de Pareidolia */}
      <div className="bg-[#0b121e] border border-cyan-950 rounded-lg p-3 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs uppercase mb-1">
          <Eye className="w-4 h-4" />
          <span>MÓDULO DE VISÃO ÓPTICA &amp; REALCE DE BAIXA LUMINOSIDADE</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
          Processamento local direto em memória por Pixel Shaders / Canvas 2D. Correção de curva Gamma,
          ganho dinâmico adaptativo, estiramento de histograma e acumulação temporal para redução de
          ruído de fótons em ambientes escuros.
        </p>
        <div className="mt-2 p-2 bg-amber-950/40 border border-amber-600/40 rounded flex items-start gap-2 text-[11px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Aviso de Rigor Físico e Forense:</strong> Celulares e navegadores não possuem visão
            noturna verdadeira, térmica ou raio X. Sensores digitais CMOS convencionais sofrem de
            elevado ruído térmico em baixa luminosidade (grânulos coloridos), artefatos que frequentemente
            induzem pareidolia visual. Sombras e poeira suspensa (orbs) devem ser analisadas com ceticismo.
          </span>
        </div>
      </div>

      {/* 2. Visualizador da Câmera & Retículo */}
      <div className="bg-[#070c14] border border-slate-800 rounded-lg p-3 sm:p-4">
        {/* Barra superior de status e controles de hardware */}
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                cameraActive ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-mono font-bold text-slate-200 uppercase">
              {cameraActive ? 'Transmissão Óptica Ativa' : 'Câmera Desligada'}
            </span>
            {cameraActive && (
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-1.5 py-0.5 rounded">
                {streamResolution.width}x{streamResolution.height}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {cameraActive ? (
              <>
                {/* Lanterna (Torch) - Exibido apenas se suportado pelo hardware */}
                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer border ${
                      torchActive
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-[0_0_10px_#f59e0b]'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Alternar lanterna do dispositivo"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{torchActive ? 'Lanterna LIGADA' : 'Lanterna'}</span>
                  </button>
                )}

                {/* Alternar Frontal / Traseira */}
                <button
                  onClick={toggleFacingMode}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                  title="Alternar câmera frontal / traseira"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span className="hidden sm:inline">
                    {facingMode === 'environment' ? 'Traseira' : 'Frontal'}
                  </span>
                </button>

                {/* Desligar */}
                <button
                  onClick={stopCamera}
                  className="px-2.5 py-1 bg-rose-950/70 border border-rose-600 text-rose-300 rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer hover:bg-rose-900"
                >
                  <CameraOff className="w-3 h-3" />
                  <span>Desligar</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => startCamera('environment')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.3)]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Ativar Câmera</span>
              </button>
            )}
          </div>
        </div>

        {/* Viewport Principal (Canvas processado) */}
        <div className="relative aspect-video max-h-[460px] w-full bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
          {cameraActive ? (
            <>
              {/* Vídeo oculto usado como fonte de streaming */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="hidden"
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setStreamResolution({
                      width: videoRef.current.videoWidth || 1280,
                      height: videoRef.current.videoHeight || 720,
                    });
                  }
                }}
              />

              {/* Canvas ativo onde os pixels são fisicamente processados */}
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain bg-black"
              />

              {/* Efeito de Flash na Captura */}
              {capturedFlash && (
                <div className="absolute inset-0 bg-white/80 pointer-events-none transition-opacity duration-200" />
              )}

              {/* Mensagem temporária de sucesso na captura */}
              {captureSuccessMsg && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-950/90 border border-emerald-500 text-emerald-200 px-3 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 shadow-lg backdrop-blur-sm z-30 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{captureSuccessMsg}</span>
                </div>
              )}

              {/* Retículo Forense & Telemetria em Tempo Real */}
              <div className="absolute inset-0 pointer-events-none border border-cyan-500/20 m-2 sm:m-3 flex flex-col justify-between p-2 font-mono text-[10px] text-cyan-400">
                {/* Cabeçalho do Retículo */}
                <div className="flex justify-between items-start gap-2">
                  <div className="bg-black/75 px-2 py-1 rounded backdrop-blur-sm border border-cyan-900/60 space-y-0.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-cyan-400" />
                      <span>FROC FORENSIC OPTICAL RETICLE</span>
                    </div>
                    <div className="text-slate-300">
                      MODO: <span className="text-cyan-300 font-bold uppercase">{engineOptions.mode}</span>
                    </div>
                    <div className="text-slate-400">
                      GANHO: <span className="text-emerald-300 font-semibold">{liveMetrics.appliedGain}x</span>
                      {engineOptions.adaptiveGain && ' (AUTO)'}
                    </div>
                  </div>

                  <div className="bg-black/75 px-2 py-1 rounded backdrop-blur-sm border border-cyan-900/60 text-right space-y-0.5">
                    <div>
                      VARIAÇÃO ÓPTICA:{' '}
                      <span
                        className={`font-bold ${
                          liveMetrics.motionPercent > 15 ? 'text-amber-400' : 'text-cyan-300'
                        }`}
                      >
                        {liveMetrics.motionPercent}%
                      </span>
                    </div>
                    <div className="text-slate-300">
                      LUMINÂNCIA:{' '}
                      <span className="text-cyan-300">
                        {liveMetrics.avgLuminance} / 255
                      </span>
                    </div>
                    <div className="text-slate-400 text-[9px]">
                      ILUMINAÇÃO:{' '}
                      <span
                        className={
                          liveMetrics.lightCategory === 'very_dark'
                            ? 'text-rose-400 font-bold'
                            : liveMetrics.lightCategory === 'low_light'
                            ? 'text-amber-400'
                            : 'text-slate-300'
                        }
                      >
                        {liveMetrics.lightCategory === 'very_dark'
                          ? 'MUITO ESCURO (<15)'
                          : liveMetrics.lightCategory === 'low_light'
                          ? 'BAIXA LUZ (15-55)'
                          : liveMetrics.lightCategory === 'moderate'
                          ? 'MODERADA'
                          : 'CLARA'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Retículo Central (Crosshair) */}
                <div className="self-center my-auto w-12 h-12 border border-cyan-400/40 rounded-full flex items-center justify-center relative">
                  <div className="w-1.5 h-1.5 bg-cyan-400/80 rounded-full" />
                  <div className="absolute w-16 h-[1px] bg-cyan-400/20" />
                  <div className="absolute h-16 w-[1px] bg-cyan-400/20" />
                </div>

                {/* Rodapé do Retículo */}
                <div className="flex justify-between items-end gap-2">
                  <div className="bg-black/75 px-2 py-1 rounded backdrop-blur-sm border border-cyan-900/60 text-[9px] text-slate-400">
                    <div>SENSOR: CMOS {facingMode.toUpperCase()}</div>
                    {engineOptions.mode === 'frame_stacking' && (
                      <div className="text-amber-300 font-semibold">
                        STACKING: {engineOptions.frameStackCount} FRAMES (GHOSTING POSSÍVEL)
                      </div>
                    )}
                  </div>

                  <div className="bg-black/75 px-2 py-1 rounded backdrop-blur-sm border border-cyan-900/60 text-[9px] text-cyan-300">
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Botão de Disparo / Shutter no rodapé da viewport */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
                <button
                  onClick={handleCapturePhoto}
                  disabled={isCapturing}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-mono font-bold text-xs rounded-full flex items-center gap-2 shadow-[0_0_15px_#00f0ff] transition cursor-pointer"
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
              {cameraError && (
                <p className="text-rose-400 max-w-sm mx-auto bg-rose-950/40 p-2 border border-rose-800 rounded">
                  {cameraError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 3. Seletor de Modos de Visão & Botão Realce de Baixa Luz */}
        {cameraActive && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800 text-xs font-mono">
              <span className="text-slate-400 text-[11px] font-semibold">Motor de Processamento:</span>

              <div className="flex flex-wrap gap-1.5">
                {/* 1. REALCE DE BAIXA LUZ (Botão Principal Obrigatório) */}
                <button
                  onClick={() =>
                    setEngineOptions((prev) => ({
                      ...prev,
                      mode: 'low_light',
                      adaptiveGain: true,
                      histogramStretch: true,
                    }))
                  }
                  className={`px-3 py-1.5 rounded text-xs font-bold font-mono cursor-pointer flex items-center gap-1.5 transition ${
                    engineOptions.mode === 'low_light'
                      ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_#00f0ff] border border-cyan-300'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>REALCE DE BAIXA LUZ</span>
                </button>

                {/* 2. ACUMULAÇÃO DE FRAMES (Frame Stacking) */}
                <button
                  onClick={() =>
                    setEngineOptions((prev) => ({
                      ...prev,
                      mode: 'frame_stacking',
                    }))
                  }
                  className={`px-3 py-1.5 rounded text-xs font-bold font-mono cursor-pointer flex items-center gap-1.5 transition ${
                    engineOptions.mode === 'frame_stacking'
                      ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_#f59e0b] border border-amber-300'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Acumulação de Frames</span>
                </button>

                {/* 3. FILTRO VISUAL VERDE (Nome Estrito Obrigatório) */}
                <button
                  onClick={() =>
                    setEngineOptions((prev) => ({
                      ...prev,
                      mode: 'green_filter',
                    }))
                  }
                  className={`px-3 py-1.5 rounded text-xs font-bold font-mono cursor-pointer flex items-center gap-1.5 transition ${
                    engineOptions.mode === 'green_filter'
                      ? 'bg-emerald-600 text-white shadow-[0_0_12px_#059669] border border-emerald-400'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Filtro visual verde</span>
                </button>

                {/* 4. Padrão (Fiel / Raw) */}
                <button
                  onClick={() =>
                    setEngineOptions((prev) => ({
                      ...prev,
                      mode: 'standard',
                    }))
                  }
                  className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition ${
                    engineOptions.mode === 'standard'
                      ? 'bg-slate-700 text-white border border-slate-500'
                      : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <span>Padrão (Fiel)</span>
                </button>
              </div>
            </div>

            {/* Avisos contextuais específicos para cada modo */}
            {engineOptions.mode === 'frame_stacking' && (
              <div className="p-2 bg-amber-950/50 border border-amber-600/50 rounded flex items-center gap-2 text-[11px] text-amber-200 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Aviso Obrigatório:</strong> Movimento durante a acumulação pode causar ghosting
                  (rastros fantasmagóricos causados pela média aritmética de múltiplos quadros consecutivos).
                </span>
              </div>
            )}

            {engineOptions.mode === 'green_filter' && (
              <div className="p-2 bg-emerald-950/40 border border-emerald-600/40 rounded flex items-center gap-2 text-[11px] text-emerald-200 font-mono">
                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Classificação:</strong> Filtro visual verde digital de fósforo. Não confere visão
                  noturna física a sensores ópticos convencionais.
                </span>
              </div>
            )}

            {/* Controles de Hardware da Câmera (Zoom e Compensação de Exposição se suportados) */}
            {(hasZoom || hasExposure) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded text-xs font-mono">
                {hasZoom && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Zoom do Sensor Físico:</span>
                      </span>
                      <span className="text-cyan-300 font-bold">{zoomValue.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={zoomRange.step}
                      value={zoomValue}
                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{zoomRange.min}x</span>
                      <span>{zoomRange.max}x</span>
                    </div>
                  </div>
                )}

                {hasExposure && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Compensação de Exposição:</span>
                      </span>
                      <span className="text-amber-300 font-bold">
                        {exposureValue > 0 ? `+${exposureValue}` : exposureValue} EV
                      </span>
                    </div>
                    <input
                      type="range"
                      min={exposureRange.min}
                      max={exposureRange.max}
                      step={exposureRange.step}
                      value={exposureValue}
                      onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{exposureRange.min} EV</span>
                      <span>+{exposureRange.max} EV</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botão de Expansão de Parâmetros Avançados do Low-Light Engine */}
            <div className="pt-1">
              <button
                onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>
                  {showAdvancedControls
                    ? 'Ocultar Parâmetros Técnicos do Low-Light Engine'
                    : 'Ajustar Parâmetros Técnicos (Gamma, Ganho, Denoise, Bordas)'}
                </span>
              </button>
            </div>

            {/* Painel de Parâmetros Técnicos Avançados */}
            {showAdvancedControls && (
              <div className="p-3 bg-slate-900/80 border border-cyan-950 rounded space-y-3 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Ganho Digital */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span>Ganho Digital Base:</span>
                      <span className="text-cyan-300 font-bold">{engineOptions.gain.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="4.0"
                      step="0.1"
                      value={engineOptions.gain}
                      onChange={(e) =>
                        setEngineOptions((prev) => ({
                          ...prev,
                          gain: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded"
                    />
                  </div>

                  {/* Curva Gamma */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span>Correção Gamma:</span>
                      <span className="text-cyan-300 font-bold">{engineOptions.gamma.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="1.8"
                      step="0.05"
                      value={engineOptions.gamma}
                      onChange={(e) =>
                        setEngineOptions((prev) => ({
                          ...prev,
                          gamma: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded"
                    />
                    <div className="text-[9px] text-slate-500">
                      Valores &lt; 1.0 clareiam sombras profundas
                    </div>
                  </div>

                  {/* Redução de Ruído Temporal */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span>Denoise Temporal:</span>
                      <span className="text-cyan-300 font-bold">
                        {Math.round(engineOptions.temporalDenoise * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.75"
                      step="0.05"
                      value={engineOptions.temporalDenoise}
                      onChange={(e) =>
                        setEngineOptions((prev) => ({
                          ...prev,
                          temporalDenoise: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded"
                    />
                  </div>

                  {/* Realce de Bordas (Edge Enhancement) */}
                  <div className="space-y-1">
                    <div className="text-slate-300 text-[11px]">Realce de Bordas (Unsharp Mask):</div>
                    <div className="flex gap-1">
                      {(['none', 'low', 'high'] as EdgeEnhanceLevel[]).map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setEngineOptions((prev) => ({ ...prev, edgeEnhance: lvl }))}
                          className={`flex-1 py-1 rounded text-[10px] font-mono cursor-pointer ${
                            engineOptions.edgeEnhance === lvl
                              ? 'bg-cyan-900 border border-cyan-400 text-white font-bold'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {lvl === 'none' ? 'Desligado' : lvl === 'low' ? 'Leve' : 'Forte'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Acumulação (Frames Count) */}
                  {engineOptions.mode === 'frame_stacking' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300 text-[11px]">
                        <span>Quadros Acumulados:</span>
                        <span className="text-amber-300 font-bold">
                          {engineOptions.frameStackCount} frames
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="8"
                        step="1"
                        value={engineOptions.frameStackCount}
                        onChange={(e) =>
                          setEngineOptions((prev) => ({
                            ...prev,
                            frameStackCount: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full accent-amber-400 cursor-pointer h-1 bg-slate-800 rounded"
                      />
                    </div>
                  )}

                  {/* Toggles (Ganho Adaptativo e Estiramento) */}
                  <div className="space-y-2 flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                      <input
                        type="checkbox"
                        checked={engineOptions.adaptiveGain}
                        onChange={(e) =>
                          setEngineOptions((prev) => ({
                            ...prev,
                            adaptiveGain: e.target.checked,
                          }))
                        }
                        className="accent-cyan-400"
                      />
                      <span>Ganho Adaptativo Automático</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                      <input
                        type="checkbox"
                        checked={engineOptions.histogramStretch}
                        onChange={(e) =>
                          setEngineOptions((prev) => ({
                            ...prev,
                            histogramStretch: e.target.checked,
                          }))
                        }
                        className="accent-cyan-400"
                      />
                      <span>Estiramento de Histograma</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Fotos Capturadas na Sessão & Cadeia de Custódia */}
      <div className="bg-[#090f1a] border border-slate-800 rounded-lg p-3 sm:p-4">
        <h3 className="text-xs font-mono font-bold text-slate-300 tracking-wider flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-cyan-400" />
            <span>FOTOGRAFIAS REGISTRADAS NA CADEIA ({photoEvidence.length})</span>
          </div>
          {photoEvidence.length > 0 && (
            <span className="text-[10px] text-slate-500 font-normal">
              Imagens salvas com marcação pericial
            </span>
          )}
        </h3>

        {photoEvidence.length === 0 ? (
          <p className="text-xs font-mono text-slate-500 text-center py-6 border border-dashed border-slate-800/80 rounded">
            Nenhuma fotografia capturada na sessão ativa. Ative a câmera e clique em "Registrar Foto na Cadeia".
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {photoEvidence.map((ev) => {
              const meta = ev.visionMetadata;
              return (
                <div
                  key={ev.id}
                  className="bg-[#0b1322] border border-slate-800 rounded overflow-hidden space-y-2 p-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="relative rounded overflow-hidden bg-black aspect-video">
                      <img
                        src={ev.photoDataUrl}
                        alt={ev.title}
                        className="w-full h-full object-cover"
                      />
                      {meta && (
                        <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-300 border border-cyan-800">
                          {meta.mode === 'low_light'
                            ? 'BAIXA LUZ'
                            : meta.mode === 'frame_stacking'
                            ? 'FRAME STACKING'
                            : meta.mode === 'green_filter'
                            ? 'FILTRO VERDE'
                            : 'PADRÃO'}
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 flex justify-between items-center">
                      <span className="text-cyan-400 font-semibold">{ev.formattedTime}</span>
                      <span className="text-slate-500">ID: {ev.id.slice(0, 12)}</span>
                    </div>

                    {meta && (
                      <div className="text-[9px] font-mono text-slate-400 grid grid-cols-2 gap-1 bg-slate-950/60 p-1 rounded border border-slate-900">
                        <div>Ganho: {meta.appliedGain || meta.gain}x</div>
                        <div>Gamma: {meta.gamma}</div>
                        <div>Luminância: {meta.avgLuminance}</div>
                        <div>Variação: {meta.motionPercent}%</div>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-300 font-sans line-clamp-2 leading-tight">
                      {ev.details}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono">
                    <span className="text-slate-500">FROC Forense</span>
                    <a
                      href={ev.photoDataUrl}
                      download={`froc_foto_${ev.id}.jpg`}
                      className="text-cyan-400 hover:text-cyan-300 hover:underline"
                    >
                      Baixar Imagem Original
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

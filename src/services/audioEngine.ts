export interface AudioMetrics {
  dbfs: number;
  rms: number;
  peakFrequencyHz: number;
  isVoiceBand: boolean;
  frequencyData: Uint8Array;
  timeData: Uint8Array;
}

export function getOptimalAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac',
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return undefined;
}

export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private freqArray: Uint8Array<ArrayBuffer> | null = null;
  private timeArray: Uint8Array<ArrayBuffer> | null = null;
  private isRecordingSession = false;
  private lastErrorMessage: string | null = null;

  public get lastError(): string | null {
    return this.lastErrorMessage;
  }

  public isMicrophoneActive(): boolean {
    return !!(
      this.micStream &&
      this.micStream.active &&
      this.micStream.getAudioTracks().some((t) => t.readyState === 'live')
    );
  }

  public async startMicrophone(deviceId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.stopMicrophone();
      this.lastErrorMessage = null;

      let stream: MediaStream | null = null;

      // 1. Tentar com deviceId especificado se fornecido
      if (deviceId) {
        try {
          const constraints: MediaStreamConstraints = {
            audio: {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (deviceErr: any) {
          console.warn('[AudioEngine] Microfone específico indisponível, tentando microfone padrão:', deviceErr?.message);
          stream = null;
        }
      }

      // 2. Tentar microfone padrão do sistema com parâmetros forenses
      if (!stream) {
        try {
          const forensicConstraints: MediaStreamConstraints = {
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          };
          stream = await navigator.mediaDevices.getUserMedia(forensicConstraints);
        } catch (forensicErr: any) {
          // 3. Fallback resiliente para Safari/iOS e navegadores móveis com restrições
          console.warn('[AudioEngine] Tentando constraints básicas de áudio:', forensicErr?.message);
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      if (!stream || stream.getAudioTracks().length === 0) {
        const msg = 'Nenhum canal de áudio retornado pelo microfone.';
        this.lastErrorMessage = msg;
        return { success: false, error: msg };
      }

      this.micStream = stream;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.65;

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.sourceNode.connect(this.analyser);

      this.freqArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeArray = new Uint8Array(this.analyser.fftSize);

      return { success: true };
    } catch (err: any) {
      console.warn('Falha ao inicializar microfone:', err);
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão de microfone negada no navegador.'
        : err?.name === 'NotFoundError'
        ? 'Nenhum microfone físico encontrado no dispositivo.'
        : err?.message || 'Falha ao acessar microfone.';
      this.lastErrorMessage = msg;
      return { success: false, error: msg };
    }
  }

  public getMetrics(): AudioMetrics {
    if (!this.analyser || !this.timeArray || !this.freqArray || !this.audioCtx) {
      return {
        dbfs: -100,
        rms: 0,
        peakFrequencyHz: 0,
        isVoiceBand: false,
        frequencyData: new Uint8Array(0),
        timeData: new Uint8Array(0),
      };
    }

    this.analyser.getByteFrequencyData(this.freqArray);
    this.analyser.getByteTimeDomainData(this.timeArray);

    // Calculate RMS from time domain (normalized -1 to 1)
    let sumSquares = 0;
    for (let i = 0; i < this.timeArray.length; i++) {
      const normalized = (this.timeArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / this.timeArray.length);

    // Digital dBFS: 20 * log10(rms)
    // -100 dBFS is digital silence floor
    const dbfs = rms > 0.00001 ? Math.max(-100, Math.min(0, 20 * Math.log10(rms))) : -100;

    // Detect peak frequency
    let maxVal = 0;
    let peakIndex = 0;
    const binCount = this.analyser.frequencyBinCount;
    const nyquist = this.audioCtx.sampleRate / 2;
    const binHz = nyquist / binCount;

    let voiceEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < binCount; i++) {
      const val = this.freqArray[i];
      const hz = i * binHz;
      totalEnergy += val;

      if (hz >= 250 && hz <= 3400) {
        voiceEnergy += val;
      }

      if (val > maxVal) {
        maxVal = val;
        peakIndex = i;
      }
    }

    const peakFrequencyHz = Math.round(peakIndex * binHz);
    const isVoiceBand = peakFrequencyHz >= 250 && peakFrequencyHz <= 3400 && voiceEnergy > (totalEnergy * 0.45);

    return {
      dbfs,
      rms,
      peakFrequencyHz,
      isVoiceBand,
      frequencyData: this.freqArray,
      timeData: this.timeArray,
    };
  }

  public startRecording(): boolean {
    if (!this.micStream || !this.isMicrophoneActive()) return false;
    try {
      this.recordedChunks = [];
      const optimalMime = getOptimalAudioMimeType();

      let recorder: MediaRecorder;
      try {
        recorder = optimalMime
          ? new MediaRecorder(this.micStream, { mimeType: optimalMime })
          : new MediaRecorder(this.micStream);
      } catch (optErr) {
        console.warn('[AudioEngine] MediaRecorder com opções rejeitado, usando construtor padrão:', optErr);
        recorder = new MediaRecorder(this.micStream);
      }

      this.mediaRecorder = recorder;
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(500); // 500ms time slices
      this.isRecordingSession = true;
      return true;
    } catch (err: any) {
      console.error('Erro ao iniciar MediaRecorder:', err);
      this.lastErrorMessage = `Erro ao iniciar gravação: ${err?.message || 'Incompatibilidade de formato'}`;
      return false;
    }
  }

  public stopRecording(): Promise<{ blob: Blob; mimeType: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve({ blob: new Blob([], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        return;
      }

      const mimeType = this.mediaRecorder.mimeType || getOptimalAudioMimeType() || 'audio/webm';

      this.mediaRecorder.onstop = () => {
        const fullBlob = new Blob(this.recordedChunks, { type: mimeType });
        this.isRecordingSession = false;
        resolve({ blob: fullBlob, mimeType });
      };

      this.mediaRecorder.onerror = (e) => {
        reject(e);
      };

      this.mediaRecorder.stop();
    });
  }

  public get isRecording(): boolean {
    return this.isRecordingSession;
  }

  public getMediaStream(): MediaStream | null {
    return this.micStream;
  }

  /**
   * Captures an isolated short chunk (e.g. 3-8 seconds) for forensic VAD / IA analysis
   * without disrupting or stopping any ongoing main recording.
   */
  public async recordChunk(durationMs: number = 4000): Promise<{ blob: Blob; mimeType: string } | null> {
    const stream = this.micStream;
    if (!stream || !stream.active) return null;
    return new Promise((resolve) => {
      try {
        const chunks: Blob[] = [];
        const optimalMime = getOptimalAudioMimeType();

        let recorder: MediaRecorder;
        try {
          recorder = optimalMime
            ? new MediaRecorder(stream, { mimeType: optimalMime })
            : new MediaRecorder(stream);
        } catch {
          recorder = new MediaRecorder(stream);
        }

        const effectiveMime = recorder.mimeType || optimalMime || 'audio/webm';

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (chunks.length === 0) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: effectiveMime });
          resolve({ blob, mimeType: effectiveMime });
        };
        recorder.onerror = () => resolve(null);
        recorder.start();
        setTimeout(() => {
          try {
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          } catch {
            resolve(null);
          }
        }, durationMs);
      } catch (err) {
        console.warn('Erro ao gravar chunk de áudio:', err);
        resolve(null);
      }
    });
  }

  public stopMicrophone() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.isRecordingSession = false;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }

  /**
   * Generates a treated copy (DSP bandpass filter 300Hz-3400Hz + gentle normalization)
   * without mutating the original raw audio blob.
   */
  public static async processTreatedAudio(rawBlob: Blob): Promise<AudioBuffer | null> {
    try {
      const arrayBuffer = await rawBlob.arrayBuffer();
      const offlineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      tempCtx.close();

      const offlineCtx = new offlineCtxClass(
        decodedBuffer.numberOfChannels,
        decodedBuffer.length,
        decodedBuffer.sampleRate
      );

      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = decodedBuffer;

      // Highpass at 300Hz (cuts wind rumble, sub-bass rumble, 60Hz hum)
      const highpass = offlineCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 300;
      highpass.Q.value = 0.7;

      // Lowpass at 3400Hz (cuts high frequency hiss, digital switching noise)
      const lowpass = offlineCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3400;
      lowpass.Q.value = 0.7;

      // Gain boost for speech clarity
      const gain = offlineCtx.createGain();
      gain.gain.value = 1.6;

      bufferSource.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(offlineCtx.destination);

      bufferSource.start(0);
      const renderedBuffer = await offlineCtx.startRendering();
      return renderedBuffer;
    } catch (err) {
      console.warn('Erro ao processar cópia tratada do áudio:', err);
      return null;
    }
  }

  /**
   * Converts an AudioBuffer to a downloadable WAV Blob
   */
  public static audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels: Float32Array[] = [];
    let sampleRate = buffer.sampleRate;
    let offset = 0;
    let pos = 0;

    function setUint16(data: number) {
      out.setUint16(pos, data, true);
      pos += 2;
    }
    function setUint32(data: number) {
      out.setUint32(pos, data, true);
      pos += 4;
    }

    // RIFF identifier
    out.setUint32(0, 0x46464952, true); // "RIFF"
    out.setUint32(4, length - 8, true); // file length - 8
    out.setUint32(8, 0x45564157, true); // "WAVE"
    pos = 12;

    // fmt sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16);         // 16 for PCM
    setUint16(1);          // Linear PCM
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2);              // block align
    setUint16(16);                         // 16-bit

    // data sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([out], { type: 'audio/wav' });
  }
}

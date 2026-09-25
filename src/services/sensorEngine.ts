export interface SensorReadings {
  magnetometer: {
    available: boolean;
    x: number;
    y: number;
    z: number;
    magnitude: number;
    baseline: number;
    delta: number;
    unit: string;
    statusText: string;
  };
  motion: {
    available: boolean;
    x: number;
    y: number;
    z: number;
    magnitude: number;
    baseline: number;
    delta: number;
    unit: string;
    statusText: string;
    includesGravity?: boolean;
    rotationRate?: {
      alpha: number | null;
      beta: number | null;
      gamma: number | null;
    };
  };
  orientation: {
    available: boolean;
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
    baselineBeta: number;
    baselineGamma: number;
    deltaBeta: number;
    deltaGamma: number;
    statusText: string;
  };
}

export class SensorEngine {
  private magnetometerInstance: any = null;
  private currentReadings: SensorReadings = {
    magnetometer: {
      available: false,
      x: 0,
      y: 0,
      z: 0,
      magnitude: 0,
      baseline: 0, // Inicia em 0 até medição real e calibração
      delta: 0,
      unit: 'µT',
      statusText: 'Verificando sensor...',
    },
    motion: {
      available: false,
      x: 0,
      y: 0,
      z: 0,
      magnitude: 0,
      baseline: 0,
      delta: 0,
      unit: 'm/s²',
      statusText: 'Verificando acelerômetro...',
    },
    orientation: {
      available: false,
      alpha: null,
      beta: null,
      gamma: null,
      baselineBeta: 0,
      baselineGamma: 0,
      deltaBeta: 0,
      deltaGamma: 0,
      statusText: 'Verificando sensor de orientação/giroscópio...',
    },
  };

  private motionListener: ((e: DeviceMotionEvent) => void) | null = null;
  private orientationListener: ((e: DeviceOrientationEvent) => void) | null = null;

  private samplesHistory = {
    mag: [] as number[],
    motion: [] as number[],
    beta: [] as number[],
    gamma: [] as number[],
  };

  private pushSample(type: 'mag' | 'motion' | 'beta' | 'gamma', value: number) {
    const list = this.samplesHistory[type];
    list.push(value);
    if (list.length > 50) list.shift();
  }

  public async initSensors(): Promise<void> {
    // 1. Try W3C Generic Sensor API for Magnetometer
    if (typeof window !== 'undefined' && 'Magnetometer' in window) {
      try {
        const SensorClass = (window as any).Magnetometer;
        this.magnetometerInstance = new SensorClass({ frequency: 10 });
        this.magnetometerInstance.addEventListener('reading', () => {
          const x = this.magnetometerInstance.x || 0;
          const y = this.magnetometerInstance.y || 0;
          const z = this.magnetometerInstance.z || 0;
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          this.pushSample('mag', magnitude);
          if (this.currentReadings.magnetometer.baseline === 0 && magnitude > 0) {
            this.currentReadings.magnetometer.baseline = Number(magnitude.toFixed(2));
          }
          const delta = Math.abs(magnitude - this.currentReadings.magnetometer.baseline);

          this.currentReadings.magnetometer = {
            ...this.currentReadings.magnetometer,
            available: true,
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            z: Number(z.toFixed(2)),
            magnitude: Number(magnitude.toFixed(2)),
            delta: Number(delta.toFixed(2)),
            statusText: 'Magnetômetro de hardware ativo (W3C Sensor API)',
          };
        });

        this.magnetometerInstance.addEventListener('error', (event: any) => {
          this.currentReadings.magnetometer.available = false;
          this.currentReadings.magnetometer.statusText = `Magnetômetro indisponível: ${event.error?.name || 'Acesso restrito'}`;
        });

        this.magnetometerInstance.start();
      } catch (e: any) {
        this.currentReadings.magnetometer.available = false;
        this.currentReadings.magnetometer.statusText = 'Magnetômetro W3C indisponível neste navegador';
      }
    } else {
      this.currentReadings.magnetometer.available = false;
      this.currentReadings.magnetometer.statusText = 'Sensor magnético não exposto pela API do navegador';
    }

    // 2. Motion / Accelerometer via DeviceMotionEvent
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        this.currentReadings.motion.statusText = 'Aguardando concessão de permissão de movimento (iOS)';
      } else {
        this.attachMotionListener();
      }
    } else {
      this.currentReadings.motion.available = false;
      this.currentReadings.motion.statusText = 'Sensor de aceleração não suportado';
    }

    // 3. Orientation / Tilt / Gyro via DeviceOrientationEvent
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        this.currentReadings.orientation.statusText = 'Aguardando concessão de permissão de orientação (iOS)';
      } else {
        this.attachOrientationListener();
      }
    } else {
      this.currentReadings.orientation.available = false;
      this.currentReadings.orientation.statusText = 'Sensor de orientação não suportado';
    }
  }

  public async requestMotionPermission(): Promise<boolean> {
    let anyGranted = false;

    // DeviceMotionEvent on iOS 13+
    if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          this.attachMotionListener();
          anyGranted = true;
        } else {
          this.currentReadings.motion.statusText = 'Permissão de movimento negada pelo usuário';
        }
      } catch (err: any) {
        this.currentReadings.motion.statusText = `Erro de permissão: ${err.message}`;
      }
    } else {
      this.attachMotionListener();
      anyGranted = true;
    }

    // DeviceOrientationEvent on iOS 13+
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          this.attachOrientationListener();
          anyGranted = true;
        } else {
          this.currentReadings.orientation.statusText = 'Permissão de orientação negada pelo usuário';
        }
      } catch (err: any) {
        this.currentReadings.orientation.statusText = `Erro de permissão: ${err.message}`;
      }
    } else {
      this.attachOrientationListener();
      anyGranted = true;
    }

    return anyGranted;
  }

  private attachMotionListener() {
    if (this.motionListener || typeof window === 'undefined') return;
    this.motionListener = (event: DeviceMotionEvent) => {
      // Prioridade: Aceleração linear pura (sem a gravidade da Terra de 9.8 m/s²)
      const hasLinear = event.acceleration && event.acceleration.x !== null;
      const acc = hasLinear ? event.acceleration! : event.accelerationIncludingGravity;
      const includesGravity = !hasLinear && !!event.accelerationIncludingGravity;

      if (acc) {
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        this.pushSample('motion', magnitude);

        if (this.currentReadings.motion.baseline === 0 && magnitude > 0) {
          this.currentReadings.motion.baseline = Number(magnitude.toFixed(2));
        }
        const delta = Math.abs(magnitude - this.currentReadings.motion.baseline);

        let rotationRate: any = undefined;
        if (event.rotationRate) {
          rotationRate = {
            alpha: event.rotationRate.alpha !== null ? Number(event.rotationRate.alpha.toFixed(2)) : null,
            beta: event.rotationRate.beta !== null ? Number(event.rotationRate.beta.toFixed(2)) : null,
            gamma: event.rotationRate.gamma !== null ? Number(event.rotationRate.gamma.toFixed(2)) : null,
          };
        }

        const statusText = hasLinear
          ? 'Acelerômetro linear puro (sem vetor gravidade)'
          : 'Acelerômetro bruto com gravidade integrada (1G)';

        this.currentReadings.motion = {
          available: true,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          magnitude: Number(magnitude.toFixed(2)),
          baseline: this.currentReadings.motion.baseline,
          delta: Number(delta.toFixed(2)),
          unit: 'm/s²',
          statusText,
          includesGravity,
          rotationRate,
        };
      }
    };
    window.addEventListener('devicemotion', this.motionListener);
  }

  private attachOrientationListener() {
    if (this.orientationListener || typeof window === 'undefined') return;
    this.orientationListener = (event: DeviceOrientationEvent) => {
      const alpha = event.alpha !== null ? Number(event.alpha.toFixed(1)) : null;
      const beta = event.beta !== null ? Number(event.beta.toFixed(1)) : null;
      const gamma = event.gamma !== null ? Number(event.gamma.toFixed(1)) : null;

      if (beta !== null) this.pushSample('beta', beta);
      if (gamma !== null) this.pushSample('gamma', gamma);

      if (this.currentReadings.orientation.baselineBeta === 0 && beta !== null) {
        this.currentReadings.orientation.baselineBeta = beta;
      }
      if (this.currentReadings.orientation.baselineGamma === 0 && gamma !== null) {
        this.currentReadings.orientation.baselineGamma = gamma;
      }

      const deltaBeta = beta !== null ? Number((beta - this.currentReadings.orientation.baselineBeta).toFixed(2)) : 0;
      const deltaGamma = gamma !== null ? Number((gamma - this.currentReadings.orientation.baselineGamma).toFixed(2)) : 0;

      this.currentReadings.orientation = {
        available: true,
        alpha,
        beta,
        gamma,
        baselineBeta: this.currentReadings.orientation.baselineBeta,
        baselineGamma: this.currentReadings.orientation.baselineGamma,
        deltaBeta,
        deltaGamma,
        statusText: 'Sensor de orientação e inclinação ativo',
      };
    };
    window.addEventListener('deviceorientation', this.orientationListener);
  }

  public calibrateMagneticBaseline(): void {
    const magList = this.samplesHistory.mag;
    if (magList.length > 0) {
      const avg = magList.reduce((a, b) => a + b, 0) / magList.length;
      this.currentReadings.magnetometer.baseline = Number(avg.toFixed(2));
      this.currentReadings.magnetometer.delta = 0;
    } else if (this.currentReadings.magnetometer.available && this.currentReadings.magnetometer.magnitude > 0) {
      this.currentReadings.magnetometer.baseline = this.currentReadings.magnetometer.magnitude;
      this.currentReadings.magnetometer.delta = 0;
    }
  }

  /**
   * Calibração Multi-Amostra: calcula a média aritmética das últimas leituras
   * para eliminar transientes e ruídos momentâneos de bancada.
   */
  public calibrateSensors(): void {
    // 1. Magnetômetro: média das amostras recentes
    this.calibrateMagneticBaseline();

    // 2. Acelerômetro: média das amostras recentes
    const motionList = this.samplesHistory.motion;
    if (motionList.length > 0) {
      const avgMotion = motionList.reduce((a, b) => a + b, 0) / motionList.length;
      this.currentReadings.motion.baseline = Number(avgMotion.toFixed(2));
      this.currentReadings.motion.delta = 0;
    } else if (this.currentReadings.motion.available && this.currentReadings.motion.magnitude > 0) {
      this.currentReadings.motion.baseline = this.currentReadings.motion.magnitude;
      this.currentReadings.motion.delta = 0;
    }

    // 3. Orientação: média das amostras recentes
    const betaList = this.samplesHistory.beta;
    if (betaList.length > 0) {
      const avgBeta = betaList.reduce((a, b) => a + b, 0) / betaList.length;
      this.currentReadings.orientation.baselineBeta = Number(avgBeta.toFixed(2));
      this.currentReadings.orientation.deltaBeta = 0;
    } else if (this.currentReadings.orientation.beta !== null) {
      this.currentReadings.orientation.baselineBeta = this.currentReadings.orientation.beta;
      this.currentReadings.orientation.deltaBeta = 0;
    }

    const gammaList = this.samplesHistory.gamma;
    if (gammaList.length > 0) {
      const avgGamma = gammaList.reduce((a, b) => a + b, 0) / gammaList.length;
      this.currentReadings.orientation.baselineGamma = Number(avgGamma.toFixed(2));
      this.currentReadings.orientation.deltaGamma = 0;
    } else if (this.currentReadings.orientation.gamma !== null) {
      this.currentReadings.orientation.baselineGamma = this.currentReadings.orientation.gamma;
      this.currentReadings.orientation.deltaGamma = 0;
    }
  }

  /**
   * Calibração Ativa Multi-Amostra com Janela Temporal de Medição
   * Coleta ativamente N amostras temporais espaçadas para calcular baseline estatístico estável.
   */
  public async calibrateSensorsMultiSample(
    sampleCount: number = 20,
    intervalMs: number = 25
  ): Promise<{
    samplesCount: number;
    magBaseline: number;
    motionBaseline: number;
    betaBaseline: number;
    gammaBaseline: number;
  }> {
    const gathered = {
      mag: [] as number[],
      motion: [] as number[],
      beta: [] as number[],
      gamma: [] as number[],
    };

    for (let i = 0; i < sampleCount; i++) {
      if (this.currentReadings.magnetometer.available && this.currentReadings.magnetometer.magnitude > 0) {
        gathered.mag.push(this.currentReadings.magnetometer.magnitude);
      }
      if (this.currentReadings.motion.available && this.currentReadings.motion.magnitude > 0) {
        gathered.motion.push(this.currentReadings.motion.magnitude);
      }
      if (this.currentReadings.orientation.available) {
        if (this.currentReadings.orientation.beta !== null) gathered.beta.push(this.currentReadings.orientation.beta);
        if (this.currentReadings.orientation.gamma !== null) gathered.gamma.push(this.currentReadings.orientation.gamma);
      }
      if (intervalMs > 0 && i < sampleCount - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    const calcAvg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const magBase = calcAvg(gathered.mag);
    const motionBase = calcAvg(gathered.motion);
    const betaBase = calcAvg(gathered.beta);
    const gammaBase = calcAvg(gathered.gamma);

    if (magBase > 0) {
      this.currentReadings.magnetometer.baseline = Number(magBase.toFixed(2));
      this.currentReadings.magnetometer.delta = 0;
    }
    if (motionBase > 0) {
      this.currentReadings.motion.baseline = Number(motionBase.toFixed(2));
      this.currentReadings.motion.delta = 0;
    }
    if (gathered.beta.length > 0) {
      this.currentReadings.orientation.baselineBeta = Number(betaBase.toFixed(2));
      this.currentReadings.orientation.deltaBeta = 0;
    }
    if (gathered.gamma.length > 0) {
      this.currentReadings.orientation.baselineGamma = Number(gammaBase.toFixed(2));
      this.currentReadings.orientation.deltaGamma = 0;
    }

    return {
      samplesCount: Math.max(gathered.mag.length, gathered.motion.length, gathered.beta.length, 1),
      magBaseline: this.currentReadings.magnetometer.baseline,
      motionBaseline: this.currentReadings.motion.baseline,
      betaBaseline: this.currentReadings.orientation.baselineBeta,
      gammaBaseline: this.currentReadings.orientation.baselineGamma,
    };
  }

  public getReadings(): SensorReadings {
    return { ...this.currentReadings };
  }

  public stop(): void {
    if (this.magnetometerInstance) {
      try {
        this.magnetometerInstance.stop();
      } catch {}
      this.magnetometerInstance = null;
    }
    if (this.motionListener && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.motionListener);
      this.motionListener = null;
    }
    if (this.orientationListener && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.orientationListener);
      this.orientationListener = null;
    }
  }
}

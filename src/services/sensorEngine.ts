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
    unit: string;
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
      baseline: 45.0, // Typical Earth magnetic field in µT
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
      unit: 'm/s²',
      statusText: 'Verificando acelerômetro...',
    },
  };

  private motionListener: ((e: DeviceMotionEvent) => void) | null = null;
  private orientationListener: ((e: DeviceOrientationEvent) => void) | null = null;

  public async initSensors(): Promise<void> {
    // 1. Try W3C Generic Sensor API for Magnetometer
    if ('Magnetometer' in window) {
      try {
        const SensorClass = (window as any).Magnetometer;
        this.magnetometerInstance = new SensorClass({ frequency: 10 });
        this.magnetometerInstance.addEventListener('reading', () => {
          const x = this.magnetometerInstance.x || 0;
          const y = this.magnetometerInstance.y || 0;
          const z = this.magnetometerInstance.z || 0;
          const magnitude = Math.sqrt(x * x + y * y + z * z);
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
      // Check iOS 13+ permission request
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        this.currentReadings.motion.statusText = 'Aguardando concessão de permissão de movimento';
      } else {
        this.attachMotionListener();
      }
    } else {
      this.currentReadings.motion.available = false;
      this.currentReadings.motion.statusText = 'Sensor de aceleração não suportado';
    }
  }

  public async requestMotionPermission(): Promise<boolean> {
    if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          this.attachMotionListener();
          return true;
        } else {
          this.currentReadings.motion.statusText = 'Permissão negada pelo usuário';
          return false;
        }
      } catch (err: any) {
        this.currentReadings.motion.statusText = `Erro de permissão: ${err.message}`;
        return false;
      }
    } else {
      this.attachMotionListener();
      return true;
    }
  }

  private attachMotionListener() {
    this.motionListener = (event: DeviceMotionEvent) => {
      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (acc) {
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        this.currentReadings.motion = {
          available: true,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          magnitude: Number(magnitude.toFixed(2)),
          unit: 'm/s²',
          statusText: 'Acelerômetro triaxial ativo',
        };
      }
    };
    window.addEventListener('devicemotion', this.motionListener);
  }

  public calibrateMagneticBaseline(): void {
    if (this.currentReadings.magnetometer.available && this.currentReadings.magnetometer.magnitude > 0) {
      this.currentReadings.magnetometer.baseline = this.currentReadings.magnetometer.magnitude;
      this.currentReadings.magnetometer.delta = 0;
    }
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
    if (this.motionListener) {
      window.removeEventListener('devicemotion', this.motionListener);
      this.motionListener = null;
    }
    if (this.orientationListener) {
      window.removeEventListener('deviceorientation', this.orientationListener);
      this.orientationListener = null;
    }
  }
}

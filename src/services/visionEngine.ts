/**
 * FROC Supernatural - Optical Low-Light Enhancement & Forensic Image Processing Engine
 *
 * Provides real-time, in-browser pixel processing for low-light investigations:
 * - Precomputed LUT Gamma Correction
 * - Adaptive Digital Gain & Ambient Luminance Analysis
 * - 256-Bin Luminance Histogram & Dynamic Range Histogram Stretching
 * - Temporal Frame Stacking (Multi-frame accumulation for CMOS sensor noise reduction)
 * - Exponential Moving Average (EMA) Temporal Denoise
 * - Edge Enhancement Convolution (Unsharp Masking for faint silhouettes)
 * - Green Visual Phosphor Filter (Explicitly marked as digital filter, NOT true thermal or NVG)
 * - Motion/Luminance Variation Delta Calculator
 */

export type VisionMode = 'standard' | 'low_light' | 'green_filter' | 'frame_stacking';
export type EdgeEnhanceLevel = 'none' | 'low' | 'high';

export interface VisionEngineOptions {
  mode: VisionMode;
  gain: number;               // 1.0 to 5.0
  gamma: number;              // 0.4 to 2.2 (values < 1.0 lift dark shadows)
  adaptiveGain: boolean;      // Automatically lift low-light levels up to target
  histogramStretch: boolean;  // Stretch dynamic range between 2nd and 98th percentiles
  temporalDenoise: number;    // 0.0 (off) to 0.8 (heavy smoothing)
  frameStackCount: number;    // 2 to 10 frames to average
  edgeEnhance: EdgeEnhanceLevel;
}

export interface VisionMetrics {
  avgLuminance: number;       // 0 to 255
  minLuminance: number;       // 0 to 255
  maxLuminance: number;       // 0 to 255
  histogram: Uint32Array;     // 256 bins
  motionPercent: number;      // 0 to 100% of pixels changed
  appliedGain: number;        // Final gain applied
  lightCategory: 'very_dark' | 'low_light' | 'moderate' | 'bright';
}

export const DEFAULT_VISION_OPTIONS: VisionEngineOptions = {
  mode: 'low_light',
  gain: 1.8,
  gamma: 0.7,
  adaptiveGain: true,
  histogramStretch: true,
  temporalDenoise: 0.35,
  frameStackCount: 4,
  edgeEnhance: 'low',
};

/**
 * Precomputes Gamma LUT for fast O(1) channel transformation
 * With gamma < 1.0 (e.g. 0.7), shadow and mid tones are boosted to brighten dark areas.
 */
export function createGammaLUT(gamma: number): Uint8Array {
  const lut = new Uint8Array(256);
  const exponent = Math.max(0.1, gamma);
  for (let i = 0; i < 256; i++) {
    const normalized = i / 255;
    const transformed = Math.pow(normalized, exponent);
    lut[i] = Math.min(255, Math.max(0, Math.round(transformed * 255)));
  }
  return lut;
}

/**
 * Computes luminance histogram (256 bins), average, min, and max
 */
export function analyzeLuminance(data: Uint8ClampedArray): {
  avgLum: number;
  minLum: number;
  maxLum: number;
  histogram: Uint32Array;
} {
  const histogram = new Uint32Array(256);
  let totalLum = 0;
  let minLum = 255;
  let maxLum = 0;
  const numPixels = data.length / 4;

  if (numPixels === 0) {
    return { avgLum: 0, minLum: 0, maxLum: 0, histogram };
  }

  // Sample every pixel for small buffers (< 100k pixels), stride for larger frames
  const step = numPixels > 400000 ? 4 : numPixels > 100000 ? 2 : 1;
  let sampleCount = 0;

  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    histogram[lum]++;
    totalLum += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    sampleCount++;
  }

  const avgLum = sampleCount > 0 ? totalLum / sampleCount : 0;
  return {
    avgLum: Number(avgLum.toFixed(1)),
    minLum,
    maxLum,
    histogram,
  };
}

/**
 * Categorizes ambient light level from average luminance
 */
export function getLightCategory(avgLum: number): 'very_dark' | 'low_light' | 'moderate' | 'bright' {
  if (avgLum < 15) return 'very_dark';
  if (avgLum < 55) return 'low_light';
  if (avgLum < 160) return 'moderate';
  return 'bright';
}

/**
 * Frame Stacker & Temporal Filter Engine
 * Stores accumulated float buffers to average out thermal & quantum shot noise in CMOS sensors
 */
export class FrameAccumulator {
  private width: number = 0;
  private height: number = 0;
  private accumulator: Float32Array | null = null;
  private ringBuffer: Uint8ClampedArray[] = [];

  public reset(): void {
    this.accumulator = null;
    this.ringBuffer = [];
  }

  public resize(width: number, height: number): void {
    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.reset();
    }
  }

  /**
   * Applies Exponential Moving Average (IIR) temporal denoise
   */
  public applyTemporalDenoise(data: Uint8ClampedArray, alpha: number): void {
    if (alpha <= 0.01) return;
    const len = data.length;

    if (!this.accumulator || this.accumulator.length !== len) {
      this.accumulator = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        this.accumulator[i] = data[i];
      }
      return;
    }

    const keepFactor = Math.min(0.85, Math.max(0.1, alpha));
    const newFactor = 1.0 - keepFactor;

    for (let i = 0; i < len; i += 4) {
      // Process RGB, keep Alpha intact
      const r = this.accumulator[i] * keepFactor + data[i] * newFactor;
      const g = this.accumulator[i + 1] * keepFactor + data[i + 1] * newFactor;
      const b = this.accumulator[i + 2] * keepFactor + data[i + 2] * newFactor;

      this.accumulator[i] = r;
      this.accumulator[i + 1] = g;
      this.accumulator[i + 2] = b;

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  /**
   * Stacks the last N frames to compute an arithmetic mean
   */
  public stackFrames(data: Uint8ClampedArray, stackCount: number): void {
    const targetCount = Math.max(2, Math.min(10, stackCount));
    const copy = new Uint8ClampedArray(data);
    this.ringBuffer.push(copy);

    while (this.ringBuffer.length > targetCount) {
      this.ringBuffer.shift();
    }

    const framesCount = this.ringBuffer.length;
    if (framesCount <= 1) return;

    const len = data.length;
    const divisor = framesCount;

    for (let i = 0; i < len; i += 4) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;

      for (let f = 0; f < framesCount; f++) {
        const frameBuf = this.ringBuffer[f];
        rSum += frameBuf[i];
        gSum += frameBuf[i + 1];
        bSum += frameBuf[i + 2];
      }

      data[i] = Math.round(rSum / divisor);
      data[i + 1] = Math.round(gSum / divisor);
      data[i + 2] = Math.round(bSum / divisor);
    }
  }

  public getStackedCount(): number {
    return this.ringBuffer.length;
  }
}

/**
 * Dynamic Range Histogram Stretching
 * Clips low (2%) and high (98%) percentiles to avoid pinhole saturation,
 * then maps remainder linearly across 0-255.
 */
export function applyHistogramStretching(data: Uint8ClampedArray, histogram: Uint32Array): void {
  let totalPixels = 0;
  for (let i = 0; i < 256; i++) {
    totalPixels += histogram[i];
  }
  if (totalPixels === 0) return;

  const lowThreshold = totalPixels * 0.02;
  const highThreshold = totalPixels * 0.98;

  let lowLum = 0;
  let cumSum = 0;
  for (let i = 0; i < 256; i++) {
    cumSum += histogram[i];
    if (cumSum >= lowThreshold) {
      lowLum = i;
      break;
    }
  }

  cumSum = 0;
  let highLum = 255;
  for (let i = 255; i >= 0; i--) {
    cumSum += histogram[i];
    if (cumSum >= (totalPixels - highThreshold)) {
      highLum = i;
      break;
    }
  }

  const range = highLum - lowLum;
  if (range <= 15) return; // Scene has almost no dynamic contrast

  const scale = 255 / range;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const val = (i - lowLum) * scale;
    lut[i] = Math.min(255, Math.max(0, Math.round(val)));
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * 3x3 Convolution Unsharp Mask for Edge Enhancement
 */
export function applyEdgeEnhancement(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  strength: EdgeEnhanceLevel
): void {
  if (strength === 'none') return;

  const k = strength === 'low' ? 0.35 : 0.75;
  const original = new Uint8ClampedArray(data);

  // Kernel: [0, -k, 0], [-k, 1+4k, -k], [0, -k, 0]
  const centerWeight = 1 + 4 * k;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width * 4;
    const rowAbove = (y - 1) * width * 4;
    const rowBelow = (y + 1) * width * 4;

    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x * 4;

      for (let c = 0; c < 3; c++) {
        const center = original[idx + c];
        const up = original[rowAbove + x * 4 + c];
        const down = original[rowBelow + x * 4 + c];
        const left = original[idx - 4 + c];
        const right = original[idx + 4 + c];

        const filtered = center * centerWeight - (up + down + left + right) * k;
        data[idx + c] = Math.min(255, Math.max(0, Math.round(filtered)));
      }
    }
  }
}

/**
 * Green Phosphor Visual Filter
 * Converts scene luminance into standard phosphor green tint
 * Notice: purely aesthetic/forensic digital filter, NOT true NVG.
 */
export function applyGreenFilter(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // Phosphor green spectrum mapping
    data[i] = Math.round(lum * 0.12);     // subtle dark red base
    data[i + 1] = Math.min(255, Math.round(lum * 1.15)); // intense green
    data[i + 2] = Math.round(lum * 0.15);    // subtle cyan/blue base
  }
}

/**
 * Computes inter-frame luminance difference
 */
export function calculateMotionDelta(
  current: Uint8ClampedArray,
  previous: Uint8ClampedArray | null,
  width: number,
  height: number
): number {
  if (!previous || previous.length !== current.length) return 0;

  let diffCount = 0;
  const total = width * height;
  if (total === 0) return 0;

  // Sample every 4th pixel for speed
  for (let i = 0; i < current.length; i += 16) {
    const lum1 = 0.299 * current[i] + 0.587 * current[i + 1] + 0.114 * current[i + 2];
    const lum2 = 0.299 * previous[i] + 0.587 * previous[i + 1] + 0.114 * previous[i + 2];
    if (Math.abs(lum1 - lum2) > 22) {
      diffCount++;
    }
  }

  const pct = (diffCount / (total / 4)) * 100;
  return Number(Math.min(100, Math.max(0, pct)).toFixed(1));
}

/**
 * Main Image Processing Entry Point
 */
export function processVisionFrame(
  imageData: ImageData,
  options: VisionEngineOptions,
  accumulator: FrameAccumulator,
  previousFrame: Uint8ClampedArray | null
): VisionMetrics {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  accumulator.resize(width, height);

  // 1. Initial luminance analysis
  const initialAnalysis = analyzeLuminance(data);
  const motion = calculateMotionDelta(data, previousFrame, width, height);

  if (options.mode === 'standard') {
    return {
      avgLuminance: initialAnalysis.avgLum,
      minLuminance: initialAnalysis.minLum,
      maxLuminance: initialAnalysis.maxLum,
      histogram: initialAnalysis.histogram,
      motionPercent: motion,
      appliedGain: 1.0,
      lightCategory: getLightCategory(initialAnalysis.avgLum),
    };
  }

  // 2. Frame Stacking or Temporal Denoise
  if (options.mode === 'frame_stacking') {
    accumulator.stackFrames(data, options.frameStackCount);
  } else if (options.temporalDenoise > 0.05) {
    accumulator.applyTemporalDenoise(data, options.temporalDenoise);
  }

  // 3. Adaptive Gain calculation
  let appliedGain = Math.max(1.0, options.gain);
  if (options.adaptiveGain) {
    const curLum = Math.max(1, initialAnalysis.avgLum);
    // If scene is under 50 luminance, apply boost factor up to max 4.5x
    if (curLum < 60) {
      const adaptiveBoost = Math.min(4.5, 60 / curLum);
      appliedGain = Math.max(appliedGain, adaptiveBoost);
    }
  }

  // 4. Apply Gain (scaling)
  if (appliedGain > 1.01) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.round(data[i] * appliedGain));
      data[i + 1] = Math.min(255, Math.round(data[i + 1] * appliedGain));
      data[i + 2] = Math.min(255, Math.round(data[i + 2] * appliedGain));
    }
  }

  // 5. Precomputed Gamma Correction
  if (Math.abs(options.gamma - 1.0) > 0.05) {
    const gammaLut = createGammaLUT(options.gamma);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = gammaLut[data[i]];
      data[i + 1] = gammaLut[data[i + 1]];
      data[i + 2] = gammaLut[data[i + 2]];
    }
  }

  // 6. Dynamic Range Histogram Stretching
  if (options.histogramStretch) {
    const midAnalysis = analyzeLuminance(data);
    applyHistogramStretching(data, midAnalysis.histogram);
  }

  // 7. Edge Enhancement
  if (options.edgeEnhance !== 'none') {
    applyEdgeEnhancement(data, width, height, options.edgeEnhance);
  }

  // 8. Green Visual Phosphor Filter
  if (options.mode === 'green_filter') {
    applyGreenFilter(data);
  }

  // Final post-processing metrics
  const finalAnalysis = analyzeLuminance(data);

  return {
    avgLuminance: finalAnalysis.avgLum,
    minLuminance: finalAnalysis.minLum,
    maxLuminance: finalAnalysis.maxLum,
    histogram: finalAnalysis.histogram,
    motionPercent: motion,
    appliedGain: Number(appliedGain.toFixed(2)),
    lightCategory: getLightCategory(finalAnalysis.avgLum),
  };
}

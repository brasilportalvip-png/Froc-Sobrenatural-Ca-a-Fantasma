import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createGammaLUT,
  analyzeLuminance,
  getLightCategory,
  FrameAccumulator,
  applyHistogramStretching,
  applyEdgeEnhancement,
  applyGreenFilter,
  calculateMotionDelta,
  processVisionFrame,
  DEFAULT_VISION_OPTIONS,
} from '../src/services/visionEngine.js';

test('Vision Engine: createGammaLUT correctly transforms shadow tones', () => {
  const lutGamma07 = createGammaLUT(0.7);
  assert.equal(lutGamma07[0], 0, 'O preto absoluto (0) permanece 0');
  assert.equal(lutGamma07[255], 255, 'O branco absoluto (255) permanece 255');

  // Gamma < 1.0 deve elevar tons escuros e médios
  const midValue = 64;
  assert.ok(
    lutGamma07[midValue] > midValue,
    `Gamma 0.7 deve elevar valor de sombra (${lutGamma07[midValue]} > ${midValue})`
  );
});

test('Vision Engine: analyzeLuminance and getLightCategory compute exact photometric values', () => {
  // Test image 4x4 (16 pixels) with known values
  const pixels = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 10;     // R
    pixels[i + 1] = 10; // G
    pixels[i + 2] = 10; // B
    pixels[i + 3] = 255;
  }

  const analysis = analyzeLuminance(pixels);
  assert.equal(analysis.avgLum, 10, 'Média de luminância deve ser 10');
  assert.equal(analysis.minLum, 10);
  assert.equal(analysis.maxLum, 10);
  assert.equal(analysis.histogram[10], 16, 'Histograma deve registrar 16 amostras no bin 10');
  assert.equal(getLightCategory(analysis.avgLum), 'very_dark', 'Luminância 10 é classificada como very_dark');
  assert.equal(getLightCategory(35), 'low_light', 'Luminância 35 é low_light');
  assert.equal(getLightCategory(120), 'moderate', 'Luminância 120 é moderate');
  assert.equal(getLightCategory(210), 'bright', 'Luminância 210 é bright');
});

test('Vision Engine: FrameAccumulator averages multiple frames (Frame Stacking)', () => {
  const accumulator = new FrameAccumulator();
  accumulator.resize(2, 2);

  // Frame 1: todos com 20
  const f1 = new Uint8ClampedArray(4 * 4);
  f1.fill(20);
  for (let i = 3; i < f1.length; i += 4) f1[i] = 255;

  // Frame 2: todos com 80
  const f2 = new Uint8ClampedArray(4 * 4);
  f2.fill(80);
  for (let i = 3; i < f2.length; i += 4) f2[i] = 255;

  accumulator.stackFrames(f1, 2);
  accumulator.stackFrames(f2, 2);

  // Média esperada: (20 + 80) / 2 = 50
  assert.equal(f2[0], 50, 'Média aritmética entre 20 e 80 deve ser 50');
  assert.equal(accumulator.getStackedCount(), 2);
});

test('Vision Engine: applyHistogramStretching increases contrast without overflow', () => {
  // Cria dados entre 20 e 60
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i += 4) {
    const v = 20 + ((i / 4) % 40);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  const analysis = analyzeLuminance(data);
  applyHistogramStretching(data, analysis.histogram);

  const postAnalysis = analyzeLuminance(data);
  assert.ok(
    postAnalysis.maxLum >= analysis.maxLum,
    'Contraste esticado deve expandir o valor máximo'
  );
  assert.ok(postAnalysis.maxLum <= 255, 'Valor máximo não pode ultrapassar 255');
});

test('Vision Engine: applyGreenFilter maps scene to phosphor spectrum', () => {
  const data = new Uint8ClampedArray(4 * 4);
  data[0] = 100; // R
  data[1] = 100; // G
  data[2] = 100; // B
  data[3] = 255;

  applyGreenFilter(data);

  // Canal verde (índice 1) deve prevalecer sobre R e B
  assert.ok(data[1] > data[0], 'Canal verde deve ser superior ao vermelho');
  assert.ok(data[1] > data[2], 'Canal verde deve ser superior ao azul');
});

test('Vision Engine: calculateMotionDelta measures variation between frames', () => {
  const f1 = new Uint8ClampedArray(16 * 4);
  f1.fill(50);
  const f2 = new Uint8ClampedArray(16 * 4);
  f2.fill(50);

  const deltaZero = calculateMotionDelta(f1, f2, 4, 4);
  assert.equal(deltaZero, 0, 'Quadros idênticos produzem 0% de delta');

  // Modifica quadro 2
  f2.fill(200);
  const deltaHigh = calculateMotionDelta(f1, f2, 4, 4);
  assert.ok(deltaHigh > 50, 'Quadros discrepantes devem registrar variação elevada');
});

test('Vision Engine: processVisionFrame produces consistent metrics in low-light mode', () => {
  const w = 8;
  const h = 8;
  const rawData = new Uint8ClampedArray(w * h * 4);
  rawData.fill(15); // Cena muito escura (luminância 15)
  for (let i = 3; i < rawData.length; i += 4) rawData[i] = 255;

  const mockImageData = {
    data: rawData,
    width: w,
    height: h,
  } as any;

  const accumulator = new FrameAccumulator();
  const metrics = processVisionFrame(
    mockImageData,
    {
      ...DEFAULT_VISION_OPTIONS,
      mode: 'low_light',
      adaptiveGain: true,
      gamma: 0.7,
    },
    accumulator,
    null
  );

  assert.ok(metrics.appliedGain >= 1.0, 'Ganho aplicado deve ser >= 1.0');
  assert.ok(metrics.avgLuminance >= 15, 'Luminância processada deve ser >= luminância bruta de entrada');
  assert.ok(metrics.histogram.length === 256, 'Histograma deve ter 256 bins');
});

test('Vision Forensic Integrity: VisionModule.tsx contains all required controls, capabilities and disclaimers', () => {
  const componentPath = path.resolve('src/components/VisionModule.tsx');
  const code = fs.readFileSync(componentPath, 'utf-8');

  // 1. Botão obrigatório: REALCE DE BAIXA LUZ
  assert.ok(code.includes('REALCE DE BAIXA LUZ'), 'Deve conter botão explícito REALCE DE BAIXA LUZ');

  // 2. Modo obrigatório: Acumulação de Frames
  assert.ok(code.includes('Acumulação de Frames'), 'Deve conter modo Acumulação de Frames');

  // 3. Aviso obrigatório de ghosting
  assert.ok(
    code.includes('Movimento durante a acumulação pode causar ghosting'),
    'Deve conter aviso obrigatório de ghosting na acumulação de frames'
  );

  // 4. Modo obrigatório: Filtro visual verde (sem alegações fraudulentas de NVG)
  assert.ok(code.includes('Filtro visual verde'), 'Deve conter modo Filtro visual verde');
  assert.ok(
    !code.toLowerCase().includes('verdadeira visão noturna') ||
    code.includes('não possuem visão noturna verdadeira'),
    'Não pode alegar visão noturna física real'
  );

  // 5. Verificação de hardware capabilities: torch, zoom, exposureCompensation
  assert.ok(code.includes('getCapabilities'), 'Deve usar MediaStreamTrack.getCapabilities()');
  assert.ok(code.includes('torch'), 'Deve verificar suporte a lanterna (torch)');
  assert.ok(code.includes('zoom'), 'Deve verificar suporte a zoom');
  assert.ok(code.includes('exposureCompensation'), 'Deve verificar compensação de exposição');

  // 6. Captura de imagem do Canvas processado
  assert.ok(code.includes('canvasRef.current'), 'Deve capturar pixels do Canvas processado');
  assert.ok(code.includes('onSavePhotoEvidence'), 'Deve salvar evidência com metadados periciais');
});

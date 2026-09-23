import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height, isMaskable = false) {
  // Simple uncompressed or deflate PNG generator
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // CRC32 implementation
  function crc32(buf) {
    let table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: height scanlines, each (1 filter byte + width * 4 bytes RGBA)
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * (isMaskable ? 0.38 : 0.45);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background: deep dark cyan-slate #080e14
      let r = 8, g = 14, b = 20, a = 255;

      // Outer radar / lab circle ring
      if (Math.abs(dist - radius) < (width * 0.02)) {
        r = 0; g = 240; b = 255; a = 220; // Cyan ring
      } else if (dist < radius) {
        // Inner reticle gradient
        const innerGrad = 1 - (dist / radius);
        r = Math.floor(10 + innerGrad * 15);
        g = Math.floor(25 + innerGrad * 35);
        b = Math.floor(40 + innerGrad * 60);

        // Sine wave across horizontal center
        const waveY = cy + Math.sin((x / width) * Math.PI * 4) * (height * 0.12);
        if (Math.abs(y - waveY) < (height * 0.025)) {
          r = 0; g = 255; b = 179; a = 255; // Neon emerald signal line
        }

        // FROC "F" symbol or center reticle crosshair
        if (Math.abs(dx) < 2 && Math.abs(dy) < radius * 0.7) {
          r = 0; g = 240; b = 255; a = 180;
        }
        if (Math.abs(dy) < 2 && Math.abs(dx) < radius * 0.7) {
          r = 0; g = 240; b = 255; a = 180;
        }
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(raw);
  const idatChunk = chunk('IDAT', idatData);
  const ihdrChunk = chunk('IHDR', ihdr);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

fs.writeFileSync('public/pwa-192x192.png', createPNG(192, 192, false));
fs.writeFileSync('public/pwa-512x512.png', createPNG(512, 512, false));
fs.writeFileSync('public/pwa-maskable-512x512.png', createPNG(512, 512, true));
fs.writeFileSync('public/apple-touch-icon.png', createPNG(180, 180, false));
console.log('PWA icons created successfully');

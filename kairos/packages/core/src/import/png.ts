/**
 * A small PNG decoder: just enough to turn a screenshot into RGBA pixels on
 * any platform without a native module. Handles 8- and 16-bit greyscale, RGB,
 * palette and alpha images; interlaced files are rejected (screenshots and
 * the app's own resized copies never are).
 */

import { unzlibSync } from 'fflate';

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, row-major. */
  data: Uint8Array | Uint8ClampedArray;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes: Uint8Array): Pixels {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  let idatLength = 0;

  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8]!;
      colorType = body[9]!;
      if (body[12] !== 0) throw new Error('Interlaced PNG is not supported');
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') {
      idat.push(body);
      idatLength += length;
    } else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!width || !height || idat.length === 0) throw new Error('Incomplete PNG file');
  if (width * height > 40_000_000) throw new Error('Image is too large');

  const packed = new Uint8Array(idatLength);
  let o = 0;
  for (const part of idat) {
    packed.set(part, o);
    o += part.length;
  }
  const raw = unzlibSync(packed);

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  if (raw.length < (stride + 1) * height) throw new Error('Truncated PNG data');

  // Undo the per-row filters in place.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp]! : 0;
      const b = y > 0 ? rows[up + x]! : 0;
      const c = x >= bpp && y > 0 ? rows[up + x - bpp]! : 0;
      const v = raw[src + x]!;
      rows[dst + x] =
        filter === 0
          ? v
          : filter === 1
            ? v + a
            : filter === 2
              ? v + b
              : filter === 3
                ? v + ((a + b) >> 1)
                : v + paeth(a, b, c);
    }
  }

  const out = new Uint8Array(width * height * 4);
  const step = depth === 16 ? 2 : 1; // 16-bit samples: keep the high byte
  const sample = (row: number, i: number): number => {
    if (depth >= 8) return rows[row + i * step]!;
    // Packed 1/2/4-bit samples (greyscale and palette only).
    const bit = i * depth;
    const byte = rows[row + (bit >> 3)]!;
    return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (colorType === 2 || colorType === 6) {
        out[p] = sample(row, x * channels);
        out[p + 1] = sample(row, x * channels + 1);
        out[p + 2] = sample(row, x * channels + 2);
        out[p + 3] = colorType === 6 ? sample(row, x * channels + 3) : 255;
      } else if (colorType === 3) {
        const i = sample(row, x);
        out[p] = palette?.[i * 3] ?? 0;
        out[p + 1] = palette?.[i * 3 + 1] ?? 0;
        out[p + 2] = palette?.[i * 3 + 2] ?? 0;
        out[p + 3] = transparency?.[i] ?? 255;
      } else {
        const g = Math.round(sample(row, x * channels) * scale);
        out[p] = out[p + 1] = out[p + 2] = g;
        out[p + 3] = colorType === 4 ? sample(row, x * channels + 1) : 255;
      }
    }
  }
  return { width, height, data: out };
}

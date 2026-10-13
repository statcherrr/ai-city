/**
 * Minimal PNG reader used to check that the WebGL canvas actually draws
 * something. Handles the 8-bit RGB/RGBA frames Chrome produces, inflates the
 * IDAT stream and reverses the per-scanline filters.
 *
 * Returns cheap aggregate statistics rather than pixels, so a 1280x860 frame
 * costs a few milliseconds to analyse.
 */

import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(base64) {
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 3;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`unsupported colour type ${colorType}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    const priorStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[rowStart + x];
      const left = x >= channels ? pixels[outStart + x - channels] : 0;
      const up = y > 0 ? pixels[priorStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[priorStart + x - channels] : 0;
      let result;
      switch (filter) {
        case 0:
          result = value;
          break;
        case 1:
          result = value + left;
          break;
        case 2:
          result = value + up;
          break;
        case 3:
          result = value + ((left + up) >> 1);
          break;
        case 4:
          result = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`unknown filter ${filter}`);
      }
      pixels[outStart + x] = result & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

/** Aggregate statistics over a sampling stride, plus a regional breakdown. */
export function pngStats(base64, options = {}) {
  const { sample = 5 } = options;
  const { width, height, channels, pixels } = decodePng(base64);
  const colors = new Set();
  let sum = 0;
  let sumSquares = 0;
  let brightPixels = 0;
  let samples = 0;
  let maxLuminance = 0;
  // Middle band of the frame, where the city sits behind the side panels.
  let citySum = 0;
  let citySamples = 0;

  const middleTop = Math.round(height * 0.25);
  const middleBottom = Math.round(height * 0.7);
  const middleLeft = Math.round(width * 0.3);
  const middleRight = Math.round(width * 0.7);

  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      const index = (y * width + x) * channels;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luminance;
      sumSquares += luminance * luminance;
      samples++;
      if (luminance > maxLuminance) maxLuminance = luminance;
      if (luminance > 90) brightPixels++;
      if (samples % 3 === 0) colors.add((r << 16) | (g << 8) | b);
      if (x >= middleLeft && x < middleRight && y >= middleTop && y < middleBottom) {
        citySum += luminance;
        citySamples++;
      }
    }
  }

  const mean = sum / samples;
  const variance = sumSquares / samples - mean * mean;

  return {
    width,
    height,
    meanLuminance: mean,
    luminanceStdDev: Math.sqrt(Math.max(0, variance)),
    maxLuminance,
    brightRatio: brightPixels / samples,
    sampledColors: colors.size,
    cityMeanLuminance: citySum / Math.max(1, citySamples),
    samples,
  };
}

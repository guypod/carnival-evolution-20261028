// Reads a PNG straight from disk, without the browser that took it, and counts
// colours the way capture.mjs does: a 4px grid, each channel cut to 4 bits.
// It is a second opinion on "blank or not", not a visual judgment.
//
//   node scripts/visual/pixels.mjs <png ...>
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG into { width, height, channels, data }. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width, height, channels;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8);
      if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colour)) {
        throw new Error(`unsupported PNG: depth ${depth}, colour ${colour}`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0;
      const b = y ? data[(y - 1) * stride + x] : 0;
      const c = x >= channels && y ? data[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][
        filter
      ];
      data[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, channels, data };
}

/** Colour count and the share of the most common colour. */
export function summarise({ width, height, channels, data }) {
  const counts = new Map();
  let samples = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * channels;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      samples++;
    }
  }
  const flatShare = Number((Math.max(...counts.values()) / samples).toFixed(3));
  return { width, height, colours: counts.size, flatShare };
}

export const isBlank = ({ colours, flatShare }) => colours < 8 || flatShare > 0.97;

if (import.meta.url === `file://${process.argv[1]}`) {
  let blank = 0;
  for (const file of process.argv.slice(2)) {
    const summary = summarise(decodePng(readFileSync(file)));
    if (isBlank(summary)) blank++;
    console.log(`${isBlank(summary) ? 'BLANK' : 'ok   '} ${file} ${JSON.stringify(summary)}`);
  }
  process.exit(blank ? 1 : 0);
}

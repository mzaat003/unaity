// Generates the PWA app icons (192px + 512px) with zero dependencies.
// Draws a purple->blue gradient tile with a white "U" and encodes a real
// PNG using Node's built-in zlib (crc32 + deflate). Run: node scripts/gen-icons.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const m = size * 0.28;          // left edge of the U
  const right = size * 0.72;      // right edge
  const top = size * 0.26;
  const bottom = size * 0.74;
  const th = size * 0.115;        // stroke thickness

  const inLeft = (x, y) => x >= m && x <= m + th && y >= top && y <= bottom;
  const inRight = (x, y) => x >= right - th && x <= right && y >= top && y <= bottom;
  const inBottom = (x, y) => y >= bottom - th && y <= bottom && x >= m && x <= right;
  const inU = (x, y) => inLeft(x, y) || inRight(x, y) || inBottom(x, y);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let r = lerp(0x6d, 0x25, t);
      let g = lerp(0x28, 0x63, t);
      let b = lerp(0xd9, 0xeb, t);
      if (inU(x, y)) { r = 255; g = 255; b = 255; }
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // rest (compression, filter, interlace) are 0

  // add filter byte (0) at the start of each scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const out = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(out, makeIcon(size));
  console.log(`wrote public/icon-${size}.png`);
}

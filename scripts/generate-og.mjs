// Generates public/og.png — the 1200×630 social preview card referenced by
// `og:image` / `twitter:image`.
//
// Dependency-free on purpose: a tiny PNG encoder (hand-rolled CRC32 + zlib
// deflate) draws the card pixel by pixel so the build never needs native image
// tooling (sharp/canvas) that may be unavailable on CI.
//
//   node scripts/generate-og.mjs
//
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { letterColor } from '../src/palette.js';

const W = 1200;
const H = 630;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const buf = Buffer.alloc(W * H * 3);

const hex = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

function px(x, y, rgb, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  if (a >= 1) {
    buf[i] = rgb[0];
    buf[i + 1] = rgb[1];
    buf[i + 2] = rgb[2];
    return;
  }
  buf[i] = Math.round(buf[i] * (1 - a) + rgb[0] * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + rgb[1] * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + rgb[2] * a);
}

/** Soft radial light. `rgb` may be a colour or a function (x, y) -> colour. */
function radial(cx, cy, radius, rgbOrFn, maxA = 1, falloff = 1) {
  const fn = typeof rgbOrFn === 'function' ? rgbOrFn : () => rgbOrFn;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      px(x, y, fn(x, y), maxA * Math.pow(1 - d, falloff));
    }
  }
}

/** Rounded rectangle. `rgbOrFn` may be a colour or (x, y) -> colour. */
function roundRect(x0, y0, w, h, rad, rgbOrFn, a = 1) {
  const r = Math.min(rad, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const qx = x < r ? r - x : x > w - 1 - r ? x - (w - 1 - r) : 0;
      const qy = y < r ? r - y : y > h - 1 - r ? y - (h - 1 - r) : 0;
      if (qx && qy && Math.hypot(qx, qy) > r) continue;
      const rgb = typeof rgbOrFn === 'function' ? rgbOrFn(x, y) : rgbOrFn;
      px(x0 + x, y0 + y, rgb, a);
    }
  }
}

function ring(cx, cy, radius, thickness, rgb, a = 1) {
  const inner = radius - thickness;
  const outer = radius + thickness;
  for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= inner && d <= outer) px(x, y, rgb, a);
    }
  }
}

// ---------------------------------------------------------------- compose ----
const BG = hex('#0d0a08');
const GOLD = hex('#e6b45c');
const GOLD_LIGHT = hex('#f5d28a');
const GOLD_DARK = hex('#c98f2f');
const INK = hex('#241a08');

// base wash
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, BG);

// warm light pooling from above, plus a cool rim on the left
radial(600, -80, 940, hex('#3a2208'), 1, 1.5);
radial(90, 240, 640, hex('#1d1a38'), 0.7, 1.4);

// reading-desk ring, echoing the 3D room (kept faint so it reads as a glow
// under the shelf rather than an arch behind it)
ring(600, 748, 372, 2, GOLD, 0.16);
ring(600, 748, 330, 1, GOLD, 0.1);

// the shelf: thirteen volumes, colours taken from the shared palette
const VOLUME_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y'];
const WIDTHS = [58, 70, 52, 64, 76, 56, 68, 60, 72, 54, 66, 58, 70];
const HEIGHTS = [128, 104, 146, 118, 136, 96, 152, 122, 110, 140, 100, 130, 116];
const GAP = 10;
const shelfBottom = 596;
const totalW = WIDTHS.reduce((a, b) => a + b, 0) + GAP * (WIDTHS.length - 1);
let sx = Math.round((W - totalW) / 2);

VOLUME_LETTERS.forEach((letter, i) => {
  const w = WIDTHS[i];
  const h = HEIGHTS[i];
  const y = shelfBottom - h;
  const base = hex(letterColor(letter));
  const leather = mix(base, hex('#120c06'), 0.42);

  roundRect(sx + 7, y + 7, w, h, 7, hex('#000000'), 0.32); // contact shadow

  roundRect(sx, y, w, h, 7, (x, yy) => {
    const t = yy / h;
    const col = mix(leather, hex('#0a0704'), t * 0.38);
    return x < 4 ? mix(col, base, 0.4) : col; // lit left edge
  });

  // gilt bands + a hint of the spine label
  roundRect(sx + 8, y + 16, w - 16, 3, 1, GOLD_LIGHT, 0.5);
  roundRect(sx + Math.round(w / 2) - 9, y + Math.round(h / 2) - 26, 18, 52, 4, GOLD, 0.4);
  roundRect(sx + 8, y + h - 26, w - 16, 3, 1, GOLD_LIGHT, 0.32);

  sx += w + GAP;
});

// brand mark: the gold rounded square with the "T" used in the app chrome
const MARK = 132;
const markX = Math.round((W - MARK) / 2);
const markY = 166;
radial(600, markY + MARK / 2, 250, GOLD, 0.14, 2.2);
roundRect(markX, markY, MARK, MARK, 30, (x, y) => {
  const t = Math.min(1, (x / MARK) * 0.35 + (y / MARK) * 0.65);
  return mix(GOLD_LIGHT, GOLD_DARK, t);
});
roundRect(markX + 28, markY + 36, 76, 15, 7, INK);
roundRect(markX + 58, markY + 36, 16, 60, 7, INK);

// a little dust, then a vignette to settle the edges
for (let i = 0; i < 90; i++) {
  const a = (i * 137.508) % 360;
  const x = Math.round(((i * 613) % W));
  const y = Math.round((Math.sin(a) * 0.5 + 0.5) * H * 0.72 + 20);
  px(x, y, GOLD_LIGHT, 0.1 + ((i % 5) / 5) * 0.16);
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.min(1, Math.hypot(dx, dy) / 1.32);
    px(x, y, BG, Math.pow(d, 2.2) * 0.6);
  }
}

// ------------------------------------------------------------ png writer ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const stride = 1 + W * 3;
const raw = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  raw[y * stride] = 0; // filter type: none
  buf.copy(raw, y * stride + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'og.png');
writeFileSync(outFile, png);

console.log(`🖼  og.png ${W}×${H} · ${(png.length / 1024).toFixed(1)} kB → public/og.png`);

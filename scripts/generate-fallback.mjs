// Generates public/library-fallback.png — the 1600×900 shelf poster shown when
// WebGL is unavailable. Same dependency-free PNG encoder as generate-og.mjs,
// but framed as a full-bleed archive shelf rather than a social card.
//
//   node scripts/generate-fallback.mjs   # then: cwebp -q 80 → library-fallback.webp
//
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { letterColor } from '../src/palette.js';

const W = 1600;
const H = 900;

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

const BG = hex('#0d0a08');
const GOLD = hex('#e6b45c');
const GOLD_LIGHT = hex('#f5d28a');
const GOLD_DARK = hex('#c98f2f');
const INK = hex('#241a08');

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, BG);

radial(800, -120, 1250, hex('#3a2208'), 1, 1.5);
radial(120, 360, 820, hex('#1d1a38'), 0.7, 1.4);

// shelf line
for (let y = 760; y <= 772; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x / W - 0.5) * 0.3 + 0.5;
    px(x, y, mix(hex('#2a1a0c'), GOLD, t), 0.8);
  }
}

const VOLUME_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y'];
const WIDTHS = [76, 92, 68, 84, 98, 72, 88, 78, 94, 70, 86, 74, 90];
const HEIGHTS = [250, 210, 286, 232, 266, 196, 298, 244, 226, 276, 206, 260, 234];
const GAP = 14;
const shelfBottom = 758;
const totalW = WIDTHS.reduce((a, b) => a + b, 0) + GAP * (WIDTHS.length - 1);
let sx = Math.round((W - totalW) / 2);

VOLUME_LETTERS.forEach((letter, i) => {
  const w = WIDTHS[i];
  const h = HEIGHTS[i];
  const y = shelfBottom - h;
  const base = hex(letterColor(letter));
  const leather = mix(base, hex('#120c06'), 0.42);

  roundRect(sx + 10, y + 10, w, h, 9, hex('#000000'), 0.34);
  roundRect(sx, y, w, h, 9, (x, yy) => {
    const col = mix(leather, hex('#0a0704'), (yy / h) * 0.38);
    return x < 5 ? mix(col, base, 0.42) : col;
  });

  roundRect(sx + 10, y + 24, w - 20, 4, 2, GOLD_LIGHT, 0.5);
  roundRect(sx + Math.round(w / 2) - 12, y + Math.round(h / 2) - 34, 24, 68, 6, GOLD, 0.42);
  roundRect(sx + 10, y + h - 34, w - 20, 4, 2, GOLD_LIGHT, 0.34);

  sx += w + GAP;
});

// brand mark, upper-left, echoing the app chrome
const MARK = 148;
const markX = 64;
const markY = 58;
radial(markX + MARK / 2, markY + MARK / 2, 300, GOLD, 0.16, 2.2);
roundRect(markX, markY, MARK, MARK, 34, (x, y) => {
  const t = Math.min(1, (x / MARK) * 0.35 + (y / MARK) * 0.65);
  return mix(GOLD_LIGHT, GOLD_DARK, t);
});
roundRect(markX + 32, markY + 40, 84, 17, 8, INK);
roundRect(markX + 64, markY + 40, 18, 68, 8, INK);

// vignette
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
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const stride = 1 + W * 3;
const raw = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  raw[y * stride] = 0;
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
const outFile = join(outDir, 'library-fallback.png');
writeFileSync(outFile, png);

console.log(`🖼  library-fallback.png ${W}×${H} · ${(png.length / 1024).toFixed(1)} kB`);

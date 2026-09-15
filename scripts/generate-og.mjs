// Generates public/og.png — the 1200×630 social preview card referenced by
// `og:image` / `twitter:image`.
//
// Dependency-free on purpose: a tiny PNG encoder (hand-rolled CRC32 + zlib
// deflate) draws the card pixel by pixel so the build never needs native image
// tooling (sharp/canvas) that may be unavailable on CI. The raster helpers
// live in scripts/lib/raster.mjs so the brand kit can reuse them.
//
//   node scripts/generate-og.mjs
//
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { letterColor } from '../src/palette.js';
import { createCanvas, hex, mix } from './lib/raster.mjs';

const W = 1200;
const H = 630;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { px, radial, roundRect, ring, vignette, toPNG } = createCanvas(W, H);

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
vignette(BG, 0.6, 1.32);

// ------------------------------------------------------------ png writer ----
const png = toPNG();

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'og.png');
writeFileSync(outFile, png);

console.log(`🖼  og.png ${W}×${H} · ${(png.length / 1024).toFixed(1)} kB → public/og.png`);

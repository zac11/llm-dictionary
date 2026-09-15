// Generates the Tokenary branding kit into branding/.
//
// Everything derives from the two sources of truth:
//   - src/palette.js   (LETTER_COLORS / CATEGORY_COLORS — imported)
//   - src/styles.css   (the :root { --… } custom properties — parsed)
//
// Raster assets use the dependency-free raster lib (scripts/lib/raster.mjs);
// text-bearing assets are SVG with a Google Fonts @import. When Chrome is
// available the SVGs are also rasterized to PNG — optional, never fatal.
//
//   npm run brand
//
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { letterColor, CATEGORY_COLORS } from '../src/palette.js';
import { createCanvas, hex, mix } from './lib/raster.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'branding');
for (const d of ['', 'logo', 'favicon', 'social', 'swatches']) {
  mkdirSync(join(outDir, d), { recursive: true });
}

// ------------------------------------------------------- sources of truth ----
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
const vars = {};
for (const m of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
  vars[m[1]] = m[2].trim();
}
const V = (name) => vars[name];

// LETTER_COLORS isn't exported; rebuild it through the public accessor.
const LETTER_COLORS = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => [L, letterColor(L)])
);

const SITE_URL = (process.env.SITE_URL || 'tokenary.netlify.app').replace(/^https?:\/\//, '').replace(/\/$/, '');

const INK_ON_TILE = '#241a08'; // the ink used on the gold tile (matches .brand-mark)
const GOLD_DEEP = '#c98f2f';

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter:wght@400;500;600&display=swap";
const FONT_IMPORT = `<style>@import url('${GOOGLE_FONTS_URL}');</style>`;
const SERIF_STACK = "Fraunces, Georgia, 'Times New Roman', serif";
const SANS_STACK = 'Inter, system-ui, sans-serif';

const written = []; // { path, bytes, use }
function out(rel, content, use) {
  const p = join(outDir, rel);
  writeFileSync(p, content);
  written.push({ path: `branding/${rel}`, bytes: statSync(p).size, use });
  return p;
}

// ------------------------------------------------------------------ colour ----
const rgb = (h) => hex(h).join(', ');
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// ------------------------------------------------------------- the mark (SVG) ----
// "book-T": a book lying flat (crossbar) over a standing spine (stem), with
// gilt bands, on the gold tile. All geometry on a 512×512 grid.
const GLYPH_RECTS = (fill, bands = null, bandFill = null) => `
    <rect x="104" y="128" width="304" height="64" rx="20" fill="${fill}"/>
    <rect x="224" y="176" width="64" height="224" rx="20" fill="${fill}"/>${
      bands
        ? `
    <rect x="238" y="228" width="36" height="6" rx="3" fill="${bandFill}" opacity="0.7"/>
    <rect x="238" y="356" width="36" height="6" rx="3" fill="${bandFill}" opacity="0.7"/>
    <rect x="136" y="142" width="6" height="36" rx="3" fill="${bandFill}" opacity="0.7"/>
    <rect x="364" y="142" width="6" height="36" rx="3" fill="${bandFill}" opacity="0.7"/>`
        : ''
    }`;

const tileDef = (id) => `
  <defs>
    <linearGradient id="${id}" x1="0.33" y1="0" x2="0.67" y2="1">
      <stop offset="0%" stop-color="${V('gold-2')}"/>
      <stop offset="60%" stop-color="${V('gold')}"/>
      <stop offset="100%" stop-color="${GOLD_DEEP}"/>
    </linearGradient>
  </defs>`;

const tileRect = (id, size = 512) =>
  `<rect width="${size}" height="${size}" rx="${(120 * size) / 512}" fill="url(#${id})"/>
  <rect width="${size}" height="${size / 2}" rx="${(120 * size) / 512}" fill="#ffffff" opacity="0.08"/>`;

const markSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${tileDef('tile')}
  ${tileRect('tile')}
  <g>${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
</svg>
`;

const markMonoSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g>${GLYPH_RECTS(INK_ON_TILE, false)}
  </g>
</svg>
`;

const markInverseSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g>${GLYPH_RECTS(V('gold'), true, V('bg'))}
  </g>
</svg>
`;

out('logo/mark.svg', markSVG(), 'Primary mark — book-T on the gold tile');
out('logo/mark-mono.svg', markMonoSVG(), 'Ink glyph only, for single-colour use');
out('logo/mark-inverse.svg', markInverseSVG(), 'Gold glyph only, for dark surfaces');

// ------------------------------------------------------- wordmark & lockups ----
const wordmarkSVG = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 140" width="560" height="140">
  ${FONT_IMPORT}
  <text x="0" y="108" font-family="${SERIF_STACK}" font-weight="700" font-size="112" fill="${fill}">Tokenary</text>
</svg>
`;

const lockupH = (textFill, tagFill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 200" width="980" height="200">
  ${FONT_IMPORT}
  ${tileDef('tile')}
  <g transform="translate(8,16) scale(0.328125)">
    ${tileRect('tile')}
    ${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
  <text x="212" y="102" font-family="${SERIF_STACK}" font-weight="700" font-size="76" fill="${textFill}">Tokenary</text>
  <text x="216" y="148" font-family="${SANS_STACK}" font-weight="500" font-size="21" letter-spacing="0.08em" fill="${tagFill}">THE AI ENGINEERING DICTIONARY</text>
</svg>
`;

const lockupS = (textFill, tagFill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 500" width="640" height="500">
  ${FONT_IMPORT}
  ${tileDef('tile')}
  <g transform="translate(224,8) scale(0.375)">
    ${tileRect('tile')}
    ${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
  <text x="320" y="330" text-anchor="middle" font-family="${SERIF_STACK}" font-weight="700" font-size="86" fill="${textFill}">Tokenary</text>
  <text x="320" y="392" text-anchor="middle" font-family="${SANS_STACK}" font-weight="500" font-size="22" letter-spacing="0.08em" fill="${tagFill}">THE AI ENGINEERING DICTIONARY</text>
</svg>
`;

out('logo/wordmark.svg', wordmarkSVG(V('ink')), 'Fraunces 700 wordmark (dark surfaces)');
out('logo/wordmark-light.svg', wordmarkSVG(INK_ON_TILE), 'Wordmark for light surfaces');
out('logo/lockup-horizontal.svg', lockupH(V('ink'), V('ink-dim')), 'Mark + wordmark + tagline, horizontal (dark)');
out('logo/lockup-horizontal-light.svg', lockupH(INK_ON_TILE, V('paper-dim')), 'Horizontal lockup (light)');
out('logo/lockup-stacked.svg', lockupS(V('ink'), V('ink-dim')), 'Mark over wordmark + tagline (dark)');
out('logo/lockup-stacked-light.svg', lockupS(INK_ON_TILE, V('paper-dim')), 'Stacked lockup (light)');

// --------------------------------------------------------------- mark PNGs ----
// Rasterized at 4× then box-downsampled so the rounded corners stay smooth at
// favicon sizes. The raster lib keeps its buffer private, so we mirror every
// px write into a readable copy for downsampling.
function drawMarkSS(size) {
  const S = size * 4;
  const pixels = Buffer.alloc(S * S * 3);
  const spx = (x, y, col, a = 1) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 3;
    if (a >= 1) {
      pixels[i] = col[0]; pixels[i + 1] = col[1]; pixels[i + 2] = col[2];
    } else {
      pixels[i] = Math.round(pixels[i] * (1 - a) + col[0] * a);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - a) + col[1] * a);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - a) + col[2] * a);
    }
  };
  const srr = (x0, y0, w, h, rad, colOrFn, a = 1) => {
    const r = Math.min(rad, w / 2, h / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const qx = x < r ? r - x : x > w - 1 - r ? x - (w - 1 - r) : 0;
        const qy = y < r ? r - y : y > h - 1 - r ? y - (h - 1 - r) : 0;
        if (qx && qy && Math.hypot(qx, qy) > r) continue;
        const col = typeof colOrFn === 'function' ? colOrFn(x, y) : colOrFn;
        spx(x0 + x, y0 + y, col, a);
      }
    }
  };
  const r = (120 * S) / 512;
  const gold2 = hex(V('gold-2'));
  const gold = hex(V('gold'));
  const deep = hex(GOLD_DEEP);
  const ink = hex(INK_ON_TILE);
  const sc = S / 512;
  const RR = (x, y, w, h, rad, col, a = 1) =>
    srr(Math.round(x * sc), Math.round(y * sc), Math.round(w * sc), Math.round(h * sc), Math.round(rad * sc), col, a);

  srr(0, 0, S, S, r, (x, y) => {
    const tt = Math.min(1, (x / S) * 0.35 + (y / S) * 0.65);
    return tt < 0.6 ? mix(gold2, gold, tt / 0.6) : mix(gold, deep, (tt - 0.6) / 0.4);
  });
  RR(104, 128, 304, 64, 20, ink);
  RR(224, 176, 64, 224, 20, ink);
  for (const [x, y, w, h] of [
    [238, 228, 36, 6],
    [238, 356, 36, 6],
    [136, 142, 6, 36],
    [364, 142, 6, 36],
  ]) RR(x, y, w, h, 3, gold2, 0.7);
  for (let y = 0; y < S / 2; y++) {
    for (let x = 0; x < S; x++) {
      const qx = x < r ? r - x : x > S - 1 - r ? x - (S - 1 - r) : 0;
      const qy = y < r ? r - y : y > S - 1 - r ? y - (S - 1 - r) : 0;
      if (qx && qy && Math.hypot(qx, qy) > r) continue;
      spx(x, y, [255, 255, 255], 0.08);
    }
  }

  const d = createCanvas(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let yy = 0; yy < 4; yy++) {
        for (let xx = 0; xx < 4; xx++) {
          const i = ((y * 4 + yy) * S + x * 4 + xx) * 3;
          acc[0] += pixels[i]; acc[1] += pixels[i + 1]; acc[2] += pixels[i + 2];
        }
      }
      d.px(x, y, acc.map((v) => Math.round(v / 16)));
    }
  }
  return d.toPNG();
}

for (const size of [32, 64, 128, 256, 512, 1024]) {
  out(`logo/mark-${size}.png`, drawMarkSS(size), `Tile mark PNG, ${size}px`);
}

// ----------------------------------------------------------------- favicons ----
const fav16 = drawMarkSS(16);
const fav32 = drawMarkSS(32);
const fav48 = drawMarkSS(48);
out('favicon/favicon-16.png', fav16, 'Browser tab icon');
out('favicon/favicon-32.png', fav32, 'Browser tab icon @2x');
out('favicon/favicon-48.png', fav48, 'Browser tab icon @3x');
out('favicon/apple-touch-icon.png', drawMarkSS(180), 'iOS home-screen icon, 180px');
out('favicon/icon-192.png', drawMarkSS(192), 'Web manifest icon, 192px');
out('favicon/icon-512.png', drawMarkSS(512), 'Web manifest icon, 512px');

// ICO container: 6-byte header + 16-byte directory entries, PNG payloads.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dirs = images.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d[2] = 0;
    d[3] = 0;
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([header, ...dirs, ...images.map((i) => i.data)]);
}
out(
  'favicon/favicon.ico',
  ico([
    { size: 16, data: fav16 },
    { size: 32, data: fav32 },
    { size: 48, data: fav48 },
  ]),
  'Multi-size ICO (16/32/48 PNG entries)'
);

out(
  'favicon/site.webmanifest',
  JSON.stringify(
    {
      name: 'Tokenary — The AI Engineering Dictionary',
      short_name: 'Tokenary',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: V('bg'),
      background_color: V('bg'),
      display: 'standalone',
    },
    null,
    2
  ) + '\n',
  'PWA manifest'
);

// ------------------------------------------------------------- social SVGs ----
const VOLUME_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y'];
const WIDTHS = [58, 70, 52, 64, 76, 56, 68, 60, 72, 54, 66, 58, 70];
const HEIGHTS = [128, 104, 146, 118, 136, 96, 152, 122, 110, 140, 100, 130, 116];

function shelfSVG(W, H, k = 1) {
  const GAP = 10 * k;
  const bottom = H * 0.945;
  const ws = WIDTHS.map((w) => w * k);
  const totalW = ws.reduce((a, b) => a + b, 0) + GAP * (ws.length - 1);
  let sx = (W - totalW) / 2;
  let s = '';
  VOLUME_LETTERS.forEach((letter, i) => {
    const w = ws[i];
    const h = HEIGHTS[i] * k;
    const y = bottom - h;
    const base = letterColor(letter);
    const [r0, g0, b0] = hex(base);
    const leather = `rgb(${mix(hex(base), hex('#120c06'), 0.42).join(',')})`;
    s += `<rect x="${sx.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${7 * k}" fill="${leather}"/>
<rect x="${sx.toFixed(1)}" y="${y.toFixed(1)}" width="${(4 * k).toFixed(1)}" height="${h.toFixed(1)}" rx="${2 * k}" fill="${base}" opacity="0.45"/>
<rect x="${(sx + 8 * k).toFixed(1)}" y="${(y + 16 * k).toFixed(1)}" width="${(w - 16 * k).toFixed(1)}" height="${3 * k}" rx="${k}" fill="${V('gold-2')}" opacity="0.5"/>
<rect x="${(sx + w / 2 - 9 * k).toFixed(1)}" y="${(y + h / 2 - 26 * k).toFixed(1)}" width="${18 * k}" height="${52 * k}" rx="${4 * k}" fill="${V('gold')}" opacity="0.4"/>
<rect x="${(sx + 8 * k).toFixed(1)}" y="${(y + h - 26 * k).toFixed(1)}" width="${(w - 16 * k).toFixed(1)}" height="${3 * k}" rx="${k}" fill="${V('gold-2')}" opacity="0.32"/>
`;
    sx += w + GAP;
  });
  return s;
}

function bannerSVG(W, H) {
  const k = Math.min(W / 1200, H / 630) * 1.15;
  const mark = 132 * k;
  const cx = W / 2;
  const markY = H * 0.16;
  const wmY = markY + mark + 96 * k;
  const tagY = wmY + 44 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONT_IMPORT}
  <defs>
    <radialGradient id="glow" cx="0.5" cy="-0.13" r="1.1">
      <stop offset="0%" stop-color="#3a2208"/><stop offset="100%" stop-color="${V('bg')}"/>
    </radialGradient>
    <radialGradient id="rim" cx="0.07" cy="0.38" r="0.6">
      <stop offset="0%" stop-color="#1d1a38" stop-opacity="0.7"/><stop offset="100%" stop-color="#1d1a38" stop-opacity="0"/>
    </radialGradient>
    ${tileDef('tile').replace(/<\/?defs>/g, '')}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#rim)"/>
  <g transform="translate(${(cx - mark / 2).toFixed(1)},${markY.toFixed(1)}) scale(${mark / 512})">
    ${tileRect('tile')}
    ${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
  <text x="${cx}" y="${wmY.toFixed(0)}" text-anchor="middle" font-family="${SERIF_STACK}" font-weight="700" font-size="${(92 * k).toFixed(0)}" fill="${V('ink')}">Tokenary</text>
  <text x="${cx}" y="${tagY.toFixed(0)}" text-anchor="middle" font-family="${SANS_STACK}" font-weight="500" font-size="${(22 * k).toFixed(0)}" letter-spacing="${(2 * k).toFixed(1)}" fill="${V('ink-dim')}">THE AI ENGINEERING DICTIONARY</text>
  ${shelfSVG(W, H, k)}
  <text x="${W - 20}" y="34" text-anchor="end" font-family="${SANS_STACK}" font-weight="500" font-size="${(15 * k).toFixed(0)}" fill="${V('ink-faint')}">${SITE_URL}</text>
</svg>
`;
}

const avatarSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  ${tileDef('tile')}
  <g transform="scale(0.78125)">
    ${tileRect('tile')}
    ${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
</svg>
`;

const readmeHeaderSVG = () => {
  const W = 1200, H = 300;
  const mark = 168;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONT_IMPORT}
  <defs>
    <radialGradient id="glow" cx="0.5" cy="-0.4" r="1.4">
      <stop offset="0%" stop-color="#3a2208"/><stop offset="100%" stop-color="${V('bg')}"/>
    </radialGradient>
    <radialGradient id="rim" cx="0.05" cy="0.5" r="0.8">
      <stop offset="0%" stop-color="#1d1a38" stop-opacity="0.7"/><stop offset="100%" stop-color="#1d1a38" stop-opacity="0"/>
    </radialGradient>
    ${tileDef('tile').replace(/<\/?defs>/g, '')}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#rim)"/>
  <g transform="translate(90,${(H - mark) / 2}) scale(${mark / 512})">
    ${tileRect('tile')}
    ${GLYPH_RECTS(INK_ON_TILE, true, V('gold-2'))}
  </g>
  <text x="300" y="150" font-family="${SERIF_STACK}" font-weight="700" font-size="84" fill="${V('ink')}">Tokenary</text>
  <text x="304" y="200" font-family="${SANS_STACK}" font-weight="500" font-size="24" letter-spacing="1.9" fill="${V('ink-dim')}">THE AI ENGINEERING DICTIONARY</text>
  <text x="${W - 40}" y="${H - 32}" text-anchor="end" font-family="${SANS_STACK}" font-size="18" fill="${V('ink-faint')}">${SITE_URL}</text>
</svg>
`;
};

const socials = {
  'social/og-1200x630.svg': [bannerSVG(1200, 630), 'Open Graph card 1200×630'],
  'social/twitter-1500x500.svg': [bannerSVG(1500, 500), 'X/Twitter header-style card 1500×500'],
  'social/linkedin-1584x396.svg': [bannerSVG(1584, 396), 'LinkedIn banner 1584×396'],
  'social/github-social-1280x640.svg': [bannerSVG(1280, 640), 'GitHub social preview 1280×640'],
  'social/avatar-400.svg': [avatarSVG(), 'Avatar / profile image 400×400'],
  'social/readme-header-1200x300.svg': [readmeHeaderSVG(), 'README hero banner 1200×300'],
};
for (const [rel, [svg, use]] of Object.entries(socials)) out(rel, svg, use);

// ---------------------------------------------------------------- swatches ----
function swatchRow(x, y, name, value, note = '') {
  return `<rect x="${x}" y="${y}" width="180" height="64" rx="10" fill="${value}" stroke="rgba(255,255,255,0.12)"/>
  <text x="${x}" y="${y + 88}" font-family="${SANS_STACK}" font-size="13" font-weight="600" fill="${V('ink')}">${name}</text>
  <text x="${x}" y="${y + 106}" font-family="${SANS_STACK}" font-size="12" fill="${V('ink-dim')}">${value}${note ? ' · ' + note : ''}</text>`;
}

{
  const entries = [
    ['bg', V('bg'), 'page'], ['bg-2', V('bg-2'), 'raised'], ['panel-solid', V('panel-solid'), 'cards'],
    ['ink', V('ink'), 'text'], ['ink-dim', V('ink-dim'), 'secondary'], ['ink-faint', V('ink-faint'), 'hints'],
    ['gold', V('gold'), 'brand'], ['gold-2', V('gold-2'), 'highlight'], ['accent', V('accent'), 'links'],
    ['accent-2', V('accent-2'), 'info'], ['good', V('good'), 'ok'], ['paper', V('paper'), 'pages'],
    ['paper-edge', V('paper-edge'), 'page edge'], ['paper-ink', V('paper-ink'), 'page text'],
    ['paper-dim', V('paper-dim'), 'page secondary'], ['paper-gold', V('paper-gold'), 'page accent'],
  ];
  const cols = 4, cw = 210, ch = 130;
  const W = cols * cw + 40, H = Math.ceil(entries.length / cols) * ch + 100;
  let body = '';
  entries.forEach(([n, v, note], i) => {
    body += swatchRow(20 + (i % cols) * cw, 60 + Math.floor(i / cols) * ch, `--${n}`, v, note);
  });
  out(
    'swatches/palette.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONT_IMPORT}
  <rect width="${W}" height="${H}" fill="${V('bg')}"/>
  <text x="20" y="34" font-family="${SANS_STACK}" font-weight="600" font-size="16" fill="${V('ink')}">Tokenary — brand colours</text>
  ${body}
</svg>
`,
    'All brand colour swatches, labelled'
  );
}

{
  // the 26 letter spine colours as a mini shelf
  const bw = 34, gap = 6, pad = 24, shelfH = 120;
  const W = 26 * (bw + gap) - gap + pad * 2, H = shelfH + 110;
  let s = '';
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((L, i) => {
    const x = pad + i * (bw + gap);
    const h = shelfH - ((i * 37) % 34);
    const y = shelfH - h + 20;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${letterColor(L)}"/>
<rect x="${x + 5}" y="${y + 10}" width="${bw - 10}" height="2.5" fill="${V('gold-2')}" opacity="0.55"/>
<text x="${x + bw / 2}" y="${shelfH + 44}" text-anchor="middle" font-family="${SANS_STACK}" font-size="13" font-weight="600" fill="${V('ink-dim')}">${L}</text>
`;
  });
  s += `<rect x="${pad - 8}" y="${shelfH + 20}" width="${W - 2 * pad + 16}" height="6" rx="3" fill="${V('gold')}" opacity="0.5"/>`;
  out(
    'swatches/letters.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONT_IMPORT}
  <rect width="${W}" height="${H}" fill="${V('bg')}"/>
  <text x="${pad}" y="${18}" font-family="${SANS_STACK}" font-weight="600" font-size="15" fill="${V('ink')}">Letter spine colours — functional wayfinding, A–Z</text>
  ${s}
</svg>
`,
    'A–Z letter spine colours as a mini shelf'
  );
}

{
  const cats = Object.entries(CATEGORY_COLORS);
  const seen = new Map();
  for (const [k, v] of cats) if (!seen.has(k)) seen.set(k, v);
  const uniq = [...seen.entries()];
  const cw = 260, ch = 46, cols = 3;
  const W = cols * cw + 40, H = Math.ceil(uniq.length / cols) * ch + 80;
  let s = '';
  uniq.forEach(([name, col], i) => {
    const x = 20 + (i % cols) * cw, y = 50 + Math.floor(i / cols) * ch;
    s += `<rect x="${x}" y="${y}" width="14" height="14" rx="7" fill="${col}"/>
<text x="${x + 24}" y="${y + 12}" font-family="${SANS_STACK}" font-size="13" fill="${V('ink')}">${name}</text>
<text x="${x + 24}" y="${y + 28}" font-family="${SANS_STACK}" font-size="11" fill="${V('ink-faint')}">${col}</text>
`;
  });
  out(
    'swatches/categories.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONT_IMPORT}
  <rect width="${W}" height="${H}" fill="${V('bg')}"/>
  <text x="20" y="30" font-family="${SANS_STACK}" font-weight="600" font-size="15" fill="${V('ink')}">Category chip colours</text>
  ${s}
</svg>
`,
    'Category chip colours'
  );
}

// ------------------------------------------------------------------ tokens ----
const hexEntry = (h) => ({ hex: h, rgb: hex(h) });
const tokens = {
  name: 'Tokenary',
  tagline: 'The AI Engineering Dictionary',
  colors: {
    brand: Object.fromEntries(
      ['bg', 'bg-2', 'panel-solid', 'ink', 'ink-dim', 'ink-faint', 'gold', 'gold-2', 'accent', 'accent-2', 'good'].map((k) => [
        { bg: 'bg', 'bg-2': 'bg2', 'panel-solid': 'panel', 'ink-dim': 'inkDim', 'ink-faint': 'inkFaint', 'gold-2': 'gold2', 'accent-2': 'accent2' }[k] || k,
        hexEntry(V(k)),
      ])
    ),
    paper: Object.fromEntries(
      ['paper', 'paper-edge', 'paper-ink', 'paper-dim', 'paper-gold'].map((k) => [
        { 'paper-edge': 'edge', 'paper-ink': 'ink', 'paper-dim': 'dim', 'paper-gold': 'gold' }[k] || k,
        hexEntry(V(k)),
      ])
    ),
    letters: Object.fromEntries(Object.entries(LETTER_COLORS).map(([k, v]) => [k, hexEntry(v)])),
    categories: Object.fromEntries(Object.entries(CATEGORY_COLORS).map(([k, v]) => [k, hexEntry(v)])),
  },
  typography: {
    serif: vars.serif,
    sans: vars.sans,
    scale: { h1: '2.25rem', h2: '1.5rem', h3: '1.25rem', body: '1rem', small: '0.875rem' },
  },
  radius: vars.radius,
  ease: vars.ease,
  fonts: { googleFontsUrl: GOOGLE_FONTS_URL },
};
out('tokens.json', JSON.stringify(tokens, null, 2) + '\n', 'Design tokens (JSON)');

{
  const lines = [':root {'];
  const add = (name, val) => lines.push(`  --tk-${name}: ${val};`);
  for (const k of ['bg', 'bg-2', 'panel-solid', 'ink', 'ink-dim', 'ink-faint', 'gold', 'gold-2', 'accent', 'accent-2', 'good', 'paper', 'paper-edge', 'paper-ink', 'paper-dim', 'paper-gold']) {
    add(k, V(k));
  }
  for (const [L, v] of Object.entries(LETTER_COLORS)) add(`letter-${L.toLowerCase()}`, v);
  add('serif', vars.serif);
  add('sans', vars.sans);
  add('radius', vars.radius);
  add('ease', vars.ease);
  lines.push('}');
  out('tokens.css', lines.join('\n') + '\n', 'Design tokens as --tk-* custom properties');
}

// ----------------------------------------------------------------- brand.html ----
const swatchHTML = (name, val) => `
      <div class="sw"><div class="chip" style="background:${val}"></div>
      <div class="sw-name">${name}</div><div class="sw-hex">${val}</div></div>`;

const brandHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tokenary — Brand</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="${GOOGLE_FONTS_URL.replace('Fraunces:opsz,wght@9..144,700', 'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700')}" rel="stylesheet"/>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${SANS_STACK}; color: ${V('ink')};
    background: radial-gradient(1200px 700px at 50% -10%, #241608 0%, ${V('bg')} 55%); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 48px 32px 96px; }
  header { display: flex; align-items: center; gap: 20px; margin-bottom: 56px; }
  header img { height: 72px; }
  h1 { font-family: ${SERIF_STACK}; font-weight: 700; font-size: 40px; margin: 0; }
  h2 { font-family: ${SERIF_STACK}; font-weight: 600; font-size: 26px; margin: 56px 0 18px;
       padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.09); }
  p, li { color: ${V('ink-dim')}; line-height: 1.65; font-size: 15px; }
  .card { background: ${V('panel-solid')}; border: 1px solid rgba(255,255,255,0.08);
          border-radius: ${vars.radius}; padding: 32px; }
  .card.light { background: ${V('paper')}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
  .centre { display: grid; place-items: center; min-height: 200px; }
  .centre img { max-width: 80%; max-height: 160px; }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr)); gap: 16px; }
  .chip { height: 56px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); }
  .sw-name { font-size: 13px; font-weight: 600; margin-top: 8px; }
  .sw-hex { font-size: 12px; color: ${V('ink-faint')}; font-family: ui-monospace, monospace; }
  .shelf { display: flex; align-items: flex-end; gap: 5px; height: 110px; }
  .shelf div { width: 26px; border-radius: 4px 4px 0 0; position: relative; }
  .shelf span { position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
                font-size: 10px; color: ${V('ink-faint')}; margin-top: 6px; }
  .type-display { font-family: ${SERIF_STACK}; font-weight: 700; font-size: 56px; margin: 8px 0; }
  .type-h { font-family: ${SERIF_STACK}; font-weight: 600; font-size: 28px; margin: 8px 0; }
  .type-ui { font-size: 15px; } .type-tag { font-size: 13px; letter-spacing: 0.08em;
    text-transform: uppercase; color: ${V('ink-dim')}; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  th { color: ${V('ink-faint')}; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
  td { color: ${V('ink-dim')}; } td:first-child { color: ${V('ink')}; font-family: ui-monospace, monospace; font-size: 12px; }
  .banner { width: 100%; border-radius: 10px; display: block; margin: 10px 0; }
  blockquote { margin: 12px 0; padding: 14px 18px; border-left: 3px solid ${V('gold')};
    background: rgba(230,180,92,0.07); border-radius: 0 8px 8px 0; color: ${V('ink')}; }
  .clearspace { position: relative; display: inline-block; padding: 32px; }
  .clearspace .frame { position: absolute; inset: 0; border: 1px dashed ${V('gold')}; border-radius: 8px; }
  .clearspace .lbl { position: absolute; top: 6px; left: 50%; transform: translateX(-50%);
     font-size: 11px; color: ${V('gold')}; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img src="logo/mark.svg" alt="Tokenary mark"/>
    <div>
      <h1>Tokenary</h1>
      <div class="type-tag">The AI Engineering Dictionary · Brand kit</div>
    </div>
  </header>

  <h2>Logo</h2>
  <div class="grid3">
    <div class="card centre"><img src="logo/mark.svg"/></div>
    <div class="card centre"><img src="logo/mark-inverse.svg"/></div>
    <div class="card light centre"><img src="logo/mark-mono.svg"/></div>
  </div>
  <div class="grid2" style="margin-top:20px">
    <div class="card centre"><img src="logo/lockup-horizontal.svg"/></div>
    <div class="card light centre"><img src="logo/lockup-horizontal-light.svg"/></div>
    <div class="card centre"><img src="logo/lockup-stacked.svg"/></div>
    <div class="card light centre"><img src="logo/wordmark-light.svg"/></div>
  </div>
  <p>The <strong>book-T</strong>: a book lying flat forms the crossbar, a standing
  spine forms the stem, with gilt bands in pale gold. The tile carries the same
  160° gold gradient as the app chrome.</p>
  <h3>Clear space</h3>
  <div class="card centre">
    <span class="clearspace"><span class="frame"></span><span class="lbl">¼ tile width on all sides</span>
    <img src="logo/mark.svg" style="height:96px"/></span>
  </div>

  <h2>Colour</h2>
  <div class="swatches">
    ${['bg', 'bg-2', 'panel-solid', 'ink', 'ink-dim', 'ink-faint', 'gold', 'gold-2', 'accent', 'accent-2', 'good']
      .map((k) => swatchHTML('--' + k, V(k))).join('')}
  </div>
  <h3>Paper</h3>
  <div class="swatches">
    ${['paper', 'paper-edge', 'paper-ink', 'paper-dim', 'paper-gold'].map((k) => swatchHTML('--' + k, V(k))).join('')}
  </div>
  <h3>Letter spines A–Z <span style="font-size:12px;color:${V('ink-faint')};font-weight:400">(functional wayfinding — never decorative text colour)</span></h3>
  <div class="card"><div class="shelf">
    ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L, i) =>
      `<div style="background:${letterColor(L)};height:${66 + ((i * 37) % 34)}px"><span>${L}</span></div>`).join('')}
  </div></div>
  <h3>Categories</h3>
  <div class="swatches">
    ${[...new Map(Object.entries(CATEGORY_COLORS))].map(([k, v]) => swatchHTML(k, v)).join('')}
  </div>

  <h2>Typography</h2>
  <div class="card">
    <div class="type-tag">Fraunces · display &amp; book pages</div>
    <div class="type-display">Tokenary</div>
    <div class="type-h">Decode the language of LLMs, GenAI &amp; AI Engineering.</div>
    <div class="type-tag" style="margin-top:24px">Inter · UI &amp; captions</div>
    <p class="type-ui">The quick brown fox pulls a volume off the shelf — 0123456789.
    Fallbacks: Georgia / Times New Roman (serif), system-ui (sans).</p>
  </div>

  <h2>Social banners</h2>
  <img class="banner" src="social/og-1200x630.svg" alt="Open Graph"/>
  <img class="banner" src="social/readme-header-1200x300.svg" alt="README header"/>
  <img class="banner" src="social/linkedin-1584x396.svg" alt="LinkedIn"/>
  <div class="grid2">
    <img class="banner" src="social/twitter-1500x500.svg" alt="Twitter"/>
    <img class="banner" src="social/github-social-1280x640.svg" alt="GitHub"/>
  </div>

  <h2>Voice &amp; messaging</h2>
  <div class="card">
    <p><strong style="color:${V('ink')}">Scholarly but playful.</strong> Precise, cited,
    written the way a dictionary writes: term, category, one-line definition, detail, citation.
    Short declarative sentences. Never hype — no "revolutionary".</p>
    <blockquote>Decode the language of LLMs, GenAI &amp; AI Engineering.</blockquote>
    <blockquote>Tokenary is an interactive 3D dictionary of AI and machine-learning
    terms — pull a volume off the shelf and read it like a real dictionary.</blockquote>
  </div>

  <h2>Asset index</h2>
  <div class="card"><table>
    <tr><th>File</th><th>Size</th><th>Use</th></tr>
    ${written.map((f) => `<tr><td>${f.path.replace('branding/', '')}</td><td>${(f.bytes / 1024).toFixed(1)} kB</td><td>${f.use}</td></tr>`).join('')}
  </table></div>

  <p style="margin-top:48px;font-size:12px;color:${V('ink-faint')}">Generated by
  <code>npm run brand</code> · sources of truth: src/palette.js, src/styles.css ·
  motion: ease ${vars.ease}</p>
</div>
</body>
</html>
`;
out('brand.html', brandHTML, 'Self-contained brand guidelines page');

// ------------------------------------------------------------------ BRAND.md ----
const ratio = (a, b) => contrast(a, b).toFixed(2);
const brandMD = `# Tokenary — Brand Guidelines

> Generated by \`npm run brand\`. Sources of truth: \`src/palette.js\` and the
> \`:root\` custom properties in \`src/styles.css\`. Do not edit by hand.

## Name & tagline

**Tokenary** — *The AI Engineering Dictionary.*

## The story

"Tokenary" = **token** + **dictionary**. The language of LLMs and AI engineering
grew faster than any glossary could keep up — we couldn't find a dictionary for
LLM terms, so we built one: in 3D, on a shelf you can browse, with every entry
backed by a citation to the original paper.

## Logo

The mark is the **book-T**: a book lying flat forms the crossbar of the T, a
standing spine forms the stem, joined so they read as one letter. Gilt bands in
pale gold decorate both. The tile is a rounded square carrying the app's 160°
gold gradient (\`--gold-2\` → \`--gold\` → \`${GOLD_DEEP}\`), lit from above.

| File | Use |
|---|---|
| \`logo/mark.svg\` | Primary mark — tile + glyph |
| \`logo/mark-mono.svg\` | Ink glyph only, single-colour contexts |
| \`logo/mark-inverse.svg\` | Gold glyph, dark surfaces |
| \`logo/wordmark.svg\` / \`-light\` | "Tokenary" in Fraunces 700 |
| \`logo/lockup-horizontal.svg\` / \`-light\` | Tile + wordmark + tagline, side by side |
| \`logo/lockup-stacked.svg\` / \`-light\` | Tile above wordmark + tagline |
| \`logo/mark-{32…1024}.png\` | Raster exports of the tile mark |
| \`favicon/*\` | favicon.ico (16/32/48), apple-touch-icon, manifest icons |

- **Clear space:** ¼ of the tile width on all sides.
- **Minimum size:** 24 px for the tile mark; 16 px for the favicon.
- **Don'ts:** don't recolour the tile; don't outline it; don't set the T in
  another typeface; don't place the tile on gold backgrounds.

## Colour

Dark leather library, brass/gold accents, parchment paper.

| Token | Hex | RGB | Usage |
|---|---|---|---|
${['bg', 'bg-2', 'panel-solid', 'ink', 'ink-dim', 'ink-faint', 'gold', 'gold-2', 'accent', 'accent-2', 'good']
  .map((k) => `| \`--${k}\` | ${V(k)} | rgb(${V(k).startsWith('#') ? rgb(V(k)) : V(k)}) | ${{ bg: 'page background', 'bg-2': 'raised surfaces', 'panel-solid': 'cards & panels', ink: 'primary text', 'ink-dim': 'secondary text', 'ink-faint': 'hints & captions', gold: 'brand gold', 'gold-2': 'gold highlight', accent: 'links & focus', 'accent-2': 'info accent', good: 'success' }[k]} |`)
  .join('\n')}

**Paper** (the reading spread):

| Token | Hex | Usage |
|---|---|---|
${['paper', 'paper-edge', 'paper-ink', 'paper-dim', 'paper-gold']
  .map((k) => `| \`--${k}\` | ${V(k)} | ${{ paper: 'page background', 'paper-edge': 'page edges', 'paper-ink': 'page text', 'paper-dim': 'page secondary', 'paper-gold': 'page accent' }[k]} |`)
  .join('\n')}

**Letters** — the 26 spine colours are a **functional wayfinding palette**
(see \`swatches/letters.svg\`). Never use them decoratively for UI text.

**Categories** — chip colours for term categories (\`swatches/categories.svg\`).

**Contrast (WCAG, vs \`--bg\`):**
- ink on bg: **${ratio(V('ink'), V('bg'))}:1** — passes AAA
- ink-dim on bg: **${ratio(V('ink-dim'), V('bg'))}:1** — passes AA
- gold on bg: **${ratio(V('gold'), V('bg'))}:1** — AA for large text
- paper-ink on paper: **${ratio(V('paper-ink'), V('paper'))}:1**

## Typography

- **Fraunces** (700 display, 600 headings, 400 book pages) — scholarly serif.
- **Inter** (400/500/600) — UI, captions, taglines (500, 0.08em, uppercase).
- Fallbacks: \`${vars.serif}\` · \`${vars.sans}\`
- Google Fonts: <${GOOGLE_FONTS_URL}>
- Scale: h1 2.25rem · h2 1.5rem · h3 1.25rem · body 1rem · small 0.875rem

## Voice & tone

Scholarly but playful. Precise. Always cite sources. Short declarative
sentences. Avoid hype words ("revolutionary", "game-changing"). Write terms the
way a dictionary does: **term → category → one-line definition → detail →
citation**.

## Messaging

**One-liner:** Decode the language of LLMs, GenAI & AI Engineering.

**25 words:** Tokenary is an interactive 3D dictionary of AI and machine-learning
terms — pull a volume off the shelf, open it, and read it like a real dictionary.

**50 words:** Tokenary is an interactive, alphabetized dictionary of LLM and
machine-learning terms, A–Z. Rendered as a cozy 3D library: click a volume and
it slides onto the reading desk, swings open, and gives you the term on a
two-page paper spread — every entry cited to its original paper.

**100 words:** Couldn't find a dictionary for LLM terms — so we built one, in
3D. Tokenary collects 1,502 AI and machine-learning terms, A–Z, each with a real
citation to the original paper or source, and renders them as a browsable
three.js library. Drag to look around, click a volume to pull it off the shelf
onto the reading desk, pick a word from its contents page, and read the entry on
a two-page parchment spread with page turns — then jump straight to the source.
Share any term with a deep link; search jumps straight to the right volume.

## Visual language

Dark leather library; brass/gold; parchment paper; 3D volumes with gilt spine
bands; warm light pooling from above with a cool rim. Motion uses
\`ease ${vars.ease}\` — things slide and swing like physical books, never bounce.

## Asset index

| File | Size | Use |
|---|---|---|
${written.map((f) => `| \`${f.path.replace('branding/', '')}\` | ${(f.bytes / 1024).toFixed(1)} kB | ${f.use} |`).join('\n')}

## Regeneration

\`\`\`bash
npm run brand
\`\`\`

Everything is derived from \`src/palette.js\` and \`src/styles.css\` — change the
tokens there and regenerate. When Chrome is available the social SVGs and
\`brand.html\` are also rasterized to PNG automatically.
`;
out('BRAND.md', brandMD, 'Brand guidelines document');

// ------------------------------------------------------ public/ + Chrome PNGs ----
for (const f of ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest']) {
  copyFileSync(join(outDir, 'favicon', f), join(root, 'public', f));
}

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  for (const name of ['google-chrome', 'chromium']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch {}
  }
  return null;
}

const chrome = findChrome();
const chromeJobs = [];
for (const rel of Object.keys(socials)) {
  const m = rel.match(/(\d+)x(\d+)/) || rel.match(/-(\d+)\.svg$/)?.slice(1).concat(rel.match(/-(\d+)\.svg$/)[1]);
  if (rel.includes('avatar')) chromeJobs.push([join(outDir, rel), join(outDir, rel.replace('.svg', '.png')), 400, 400]);
  else if (m) chromeJobs.push([join(outDir, rel), join(outDir, rel.replace('.svg', '.png')), +m[1], +m[2]]);
}
chromeJobs.push([join(outDir, 'logo/mark.svg'), join(outDir, 'logo/mark-preview.png'), 512, 512]);
chromeJobs.push([join(outDir, 'logo/lockup-horizontal.svg'), join(outDir, 'logo/lockup-horizontal-preview.png'), 980, 200]);
chromeJobs.push([join(outDir, 'brand.html'), join(outDir, 'brand-preview.png'), 1400, 3000]);

if (!chrome) {
  console.log('ℹ️  Chrome not found — skipping SVG→PNG rasterization (set CHROME_PATH to enable).');
} else {
  for (const [src, dst, w, h] of chromeJobs) {
    try {
      execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--virtual-time-budget=5000',
        `--screenshot=${dst}`, `--window-size=${w},${h}`, `file://${src}`,
      ], { stdio: 'pipe' });
      written.push({ path: `branding/${relative(outDir, dst)}`, bytes: statSync(dst).size, use: 'Chrome-rasterized PNG' });
      console.log(`  📸 ${relative(outDir, dst)}`);
    } catch (e) {
      console.log(`  ⚠️  rasterize failed for ${relative(outDir, src)} (non-fatal)`);
    }
  }
}

console.log(`\n🎨 branding kit → branding/ (${written.length} files)`);

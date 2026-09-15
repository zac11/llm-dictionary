// Tiny dependency-free raster canvas + PNG encoder.
//
// Hand-rolled on purpose (CRC32 + zlib deflate, pixel buffers) so image
// generation never needs native tooling (sharp/canvas) that may be
// unavailable on CI.
//
import { deflateSync } from 'node:zlib';

//   import { createCanvas, hex, mix } from './lib/raster.mjs';
//   const c = createCanvas(1200, 630);            // opaque RGB
//   const t = createCanvas(512, 512, { alpha: true }); // transparent RGBA
//
export const hex = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

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

/**
 * Pixel canvas. With `{ alpha: true }` the buffer is RGBA (PNG colour type 6)
 * and pixels are source-over composited onto a transparent background;
 * otherwise it's RGB (colour type 2) and `px` blends colour only.
 */
export function createCanvas(W, H, { alpha = false } = {}) {
  const bpp = alpha ? 4 : 3;
  const buf = Buffer.alloc(W * H * bpp);

  function px(x, y, rgb, a = 1) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * bpp;
    if (a >= 1) {
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      if (alpha) buf[i + 3] = 255;
      return;
    }
    if (!alpha) {
      buf[i] = Math.round(buf[i] * (1 - a) + rgb[0] * a);
      buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + rgb[1] * a);
      buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + rgb[2] * a);
      return;
    }
    // source-over compositing onto a transparent-capable pixel
    const A = buf[i + 3] / 255;
    const oa = a + A * (1 - a);
    if (oa <= 0) return;
    buf[i] = Math.round((rgb[0] * a + buf[i] * A * (1 - a)) / oa);
    buf[i + 1] = Math.round((rgb[1] * a + buf[i + 1] * A * (1 - a)) / oa);
    buf[i + 2] = Math.round((rgb[2] * a + buf[i + 2] * A * (1 - a)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  }

  /** Fill the whole canvas with a solid colour. */
  function fill(rgb, a = 1) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, rgb, a);
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

  /** Darken the edges: d measured in half-width units, / radius, ^ 2.2. */
  function vignette(rgb, strength, radius = 1.32) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2);
        const dy = (y - H / 2) / (H / 2);
        const d = Math.min(1, Math.hypot(dx, dy) / radius);
        px(x, y, rgb, Math.pow(d, 2.2) * strength);
      }
    }
  }

  function toPNG() {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = alpha ? 6 : 2; // colour type: RGBA / truecolour
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace

    const stride = 1 + W * bpp;
    const raw = Buffer.alloc(H * stride);
    for (let y = 0; y < H; y++) {
      raw[y * stride] = 0; // filter type: none
      buf.copy(raw, y * stride + 1, y * W * bpp, (y + 1) * W * bpp);
    }

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  return { W, H, px, fill, radial, roundRect, ring, vignette, toPNG };
}

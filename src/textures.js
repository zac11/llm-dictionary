// Canvas-generated textures shared by the shelf books and the animated book.
import * as THREE from 'three';
import { letterColor } from './palette.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

export function cssColor(hex, alpha = 1) {
  const col = new THREE.Color(hex);
  return `rgba(${Math.round(col.r * 255)}, ${Math.round(col.g * 255)}, ${Math.round(
    col.b * 255
  )}, ${alpha})`;
}

export function softShadowTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 122);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function creamTexture() {
  const { c, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = '#e6d9bb';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(120,100,70,0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 64; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Simple plank wood texture for the shelf unit, desk and floor. */
export function woodTexture({ base = '#4a3423', dark = '#33231500', plank = 128, w = 512, h = 512, horizontal = true } = {}) {
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // grain strokes
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * h;
    const alpha = 0.04 + Math.random() * 0.08;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,220,170,${alpha * 0.7})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    const wobble = 4 + Math.random() * 10;
    if (horizontal) {
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * wobble, w * 0.7, y + (Math.random() - 0.5) * wobble, w, y);
    } else {
      const x = Math.random() * w;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (Math.random() - 0.5) * wobble, h * 0.3, x + (Math.random() - 0.5) * wobble, h * 0.7, x, h);
    }
    ctx.stroke();
  }

  // plank seams
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  for (let p = plank; p < (horizontal ? h : w); p += plank) {
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
    } else {
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
    }
    ctx.stroke();
  }

  // warm vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Front-cover design for a dictionary volume (portrait). */
export function makeCoverTexture({ label, letters, count, c1, c2, roman }) {
  const W = 512;
  const H = 700;
  const { c, ctx } = makeCanvas(W, H);

  const base = new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.58);
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.22);
  const deep = base.clone().multiplyScalar(0.55);

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, cssColor(base.getStyle()));
  grad.addColorStop(0.55, cssColor(light.getStyle()));
  grad.addColorStop(1, cssColor(deep.getStyle()));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.72);
  vignette.addColorStop(0, 'rgba(255,255,255,0)');
  vignette.addColorStop(1, 'rgba(20,8,4,0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // gold double border
  ctx.strokeStyle = 'rgba(245,210,138,0.95)';
  ctx.lineWidth = 8;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = 'rgba(245,210,138,0.35)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  ctx.fillStyle = 'rgba(245,210,138,0.85)';
  ctx.font = '600 23px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('✦  T O K E N A R Y  ·  D I C T I O N A R Y  ✦', W / 2, 96);

  // big range label — shrunk until it sits inside the gold border
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#f9ecd6';
  let labelSize = 240;
  ctx.font = `600 ${labelSize}px Georgia, "Times New Roman", serif`;
  while (labelSize > 110 && ctx.measureText(label).width > W - 130) {
    labelSize -= 10;
    ctx.font = `600 ${labelSize}px Georgia, "Times New Roman", serif`;
  }
  ctx.fillText(label, W / 2, H * 0.46);
  ctx.shadowBlur = 0;

  // letter chips row
  const chipY = H * 0.68;
  const chipGap = 132;
  const chipR = 60;
  letters.forEach((ch, i) => {
    const cx = W / 2 + (i - (letters.length - 1) / 2) * chipGap;
    const col = new THREE.Color(letterColor(ch));
    ctx.beginPath();
    ctx.arc(cx, chipY, chipR, 0, Math.PI * 2);
    ctx.fillStyle = cssColor(col.getStyle(), 0.16);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = cssColor(col.getStyle(), 0.9);
    ctx.stroke();
    ctx.font = '600 64px Georgia, serif';
    ctx.fillStyle = '#fff8ea';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, cx, chipY + 3);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 32px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.85)';
  ctx.fillText(`V O L U M E  ${roman}`, W / 2, H - 118);
  ctx.font = 'italic 500 26px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.62)';
  ctx.fillText(`${count} ${count === 1 ? 'TERM' : 'TERMS'} · TOKENARY`, W / 2, H - 76);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Narrow spine design seen while the volume stands on the shelf. */
export function makeSpineTexture({ label, letters, count, c1, c2, roman }) {
  const W = 224;
  const H = 800;
  const { c, ctx } = makeCanvas(W, H);

  const base = new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.5);
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.18);
  const deep = base.clone().multiplyScalar(0.5);

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, cssColor(deep.getStyle()));
  grad.addColorStop(0.5, cssColor(light.getStyle()));
  grad.addColorStop(1, cssColor(deep.getStyle()));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // gold bands top & bottom
  ctx.fillStyle = 'rgba(245,210,138,0.9)';
  ctx.fillRect(14, 40, W - 28, 5);
  ctx.fillRect(14, 62, W - 28, 2);
  ctx.fillRect(14, H - 66, W - 28, 5);
  ctx.fillRect(14, H - 44, W - 28, 2);

  ctx.textAlign = 'center';

  // big range letters stacked: A – B
  ctx.fillStyle = '#f9ecd6';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 10;
  ctx.font = '600 120px Georgia, serif';
  ctx.fillText(label[0], W / 2, 210);
  ctx.font = '600 60px Georgia, serif';
  ctx.fillStyle = 'rgba(245,210,138,0.9)';
  ctx.fillText('–', W / 2, 268);
  ctx.font = '600 120px Georgia, serif';
  ctx.fillStyle = '#f9ecd6';
  ctx.fillText(letters[1], W / 2, 388);
  ctx.shadowBlur = 0;

  // title, rotated like a real spine
  ctx.save();
  ctx.translate(W / 2, H * 0.66);
  ctx.rotate(Math.PI / 2);
  ctx.font = '600 34px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.85)';
  ctx.fillText('TOKENARY', 0, 12);
  ctx.restore();

  ctx.font = '600 30px Georgia, serif';
  ctx.fillStyle = 'rgba(245,210,138,0.85)';
  ctx.fillText(roman, W / 2, H - 120);

  ctx.font = 'italic 500 24px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.6)';
  ctx.fillText(`${count} ${count === 1 ? 'term' : 'terms'}`, W / 2, H - 86);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Spine of a background "filler" book — leather gradient, raised hub bands,
 * a gilt title and gentle shelf wear, so the shelf reads as real books rather
 * than coloured boxes. `horizontal` renders a wide strip for books lying
 * flat in a stack (spine along the long edge).
 */
export function fillerSpineTexture({ base = '#6b3f2e', title = '', horizontal = false, rand = Math.random } = {}) {
  const W = horizontal ? 512 : 128;
  const H = horizontal ? 96 : 512;
  const { c, ctx } = makeCanvas(W, H);

  const baseCol = new THREE.Color(base);
  const light = baseCol.clone().lerp(new THREE.Color('#ffffff'), 0.16);
  const deep = baseCol.clone().multiplyScalar(0.5);

  // edges darker than the centre → the spine looks rounded
  const grad = horizontal
    ? ctx.createLinearGradient(0, 0, 0, H)
    : ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, cssColor(deep.getStyle()));
  grad.addColorStop(0.5, cssColor(light.getStyle()));
  grad.addColorStop(1, cssColor(deep.getStyle()));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // grain streaks running along the spine
  for (let i = 0; i < 60; i++) {
    const a = 0.03 + rand() * 0.06;
    ctx.strokeStyle = rand() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,235,200,${a * 0.8})`;
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    if (horizontal) {
      const y = rand() * H;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + (rand() - 0.5) * 6);
    } else {
      const x = rand() * W;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rand() - 0.5) * 6, H);
    }
    ctx.stroke();
  }

  const gilt = 'rgba(232,201,138,0.92)';
  const giltDim = 'rgba(232,201,138,0.45)';

  // raised hub bands (highlight ridge + shadow + faint gilt rule)
  const bands = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < bands; i++) {
    const p = (i + 1) / (bands + 1) + (rand() - 0.5) * 0.06;
    if (horizontal) {
      const x = W * p;
      ctx.fillStyle = 'rgba(255,240,210,0.16)';
      ctx.fillRect(x - 4, 0, 5, H);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(x + 1, 0, 3, H);
      ctx.fillStyle = giltDim;
      ctx.fillRect(x - 7, 0, 1.5, H);
    } else {
      const y = H * p;
      ctx.fillStyle = 'rgba(255,240,210,0.16)';
      ctx.fillRect(0, y - 4, W, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(0, y + 1, W, 3);
      ctx.fillStyle = giltDim;
      ctx.fillRect(0, y - 7, W, 1.5);
    }
  }

  // gilt title — rotated along upright spines, horizontal on flat stacks
  if (title) {
    ctx.fillStyle = gilt;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 2;
    if (horizontal) {
      let size = 36;
      ctx.font = `600 ${size}px Georgia, serif`;
      while (size > 14 && ctx.measureText(title).width > W - 70) {
        size -= 2;
        ctx.font = `600 ${size}px Georgia, serif`;
      }
      ctx.fillText(title, W / 2, H / 2 + 2);
    } else {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI / 2);
      let size = 30;
      ctx.font = `600 ${size}px Georgia, serif`;
      while (size > 12 && ctx.measureText(title).width > H * 0.72) {
        size -= 2;
        ctx.font = `600 ${size}px Georgia, serif`;
      }
      ctx.fillText(title.toUpperCase(), 0, 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  // small gilt ornament + rules near the tail
  ctx.strokeStyle = giltDim;
  ctx.fillStyle = gilt;
  if (horizontal) {
    ctx.beginPath();
    ctx.moveTo(W - 34, H / 2 - 8);
    ctx.lineTo(W - 24, H / 2);
    ctx.lineTo(W - 34, H / 2 + 8);
    ctx.lineTo(W - 44, H / 2);
    ctx.closePath();
    ctx.fill();
  } else {
    const y = H * 0.88;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(26, y - 22);
    ctx.lineTo(W - 26, y - 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, y - 8);
    ctx.lineTo(W / 2 + 9, y);
    ctx.lineTo(W / 2, y + 8);
    ctx.lineTo(W / 2 - 9, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, y + 22);
    ctx.lineTo(W - 26, y + 22);
    ctx.stroke();
  }

  // shelf-wear vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Ruled cream page used on the page block and the loose pages. */
export function makePageTexture({ letters }) {
  const W = 512;
  const H = 700;
  const { c, ctx } = makeCanvas(W, H);

  ctx.fillStyle = '#f3e9d2';
  ctx.fillRect(0, 0, W, H);

  // faint ruled lines
  ctx.strokeStyle = 'rgba(120,95,60,0.18)';
  ctx.lineWidth = 1.5;
  for (let y = 110; y < H - 60; y += 34) {
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(W - 56, y);
    ctx.stroke();
  }

  // watermark letters
  ctx.textAlign = 'center';
  ctx.font = '600 190px Georgia, serif';
  ctx.fillStyle = 'rgba(120,95,60,0.12)';
  ctx.fillText(letters.join('·'), W / 2, H / 2 + 60);

  // header rule + running title
  ctx.font = 'italic 500 24px Georgia, serif';
  ctx.fillStyle = 'rgba(120,95,60,0.4)';
  ctx.fillText('Tokenary · AI Engineering', W / 2, 56);
  ctx.strokeStyle = 'rgba(120,95,60,0.35)';
  ctx.beginPath();
  ctx.moveTo(56, 74);
  ctx.lineTo(W - 56, 74);
  ctx.stroke();

  // page-edge vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(90,60,25,0.22)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

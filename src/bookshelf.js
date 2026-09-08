import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { letterColor } from './palette.js';

// ---------- tiny helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function cssColor(hex, alpha = 1) {
  const col = new THREE.Color(hex);
  return `rgba(${Math.round(col.r * 255)}, ${Math.round(col.g * 255)}, ${Math.round(
    col.b * 255
  )}, ${alpha})`;
}

function softShadowTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 122);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---------- book cover label texture ----------
function makeLabelTexture({ label, letters, count, c1, c2, roman }) {
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

  // subtle leather-ish inner shading at edges
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

  // top ornament band
  ctx.fillStyle = 'rgba(245,210,138,0.85)';
  ctx.font = '600 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('✦  L L M  ·  D I C T I O N A R Y  ✦', W / 2, 96);

  // big range label
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 250px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#f9ecd6';
  ctx.fillText(label, W / 2, H * 0.5 + 70);
  ctx.shadowBlur = 0;

  // letters chips row under range
  const chipY = H * 0.62 + 150;
  const chipGap = 140;
  const chipR = 78;
  ctx.textAlign = 'center';
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
    ctx.font = '600 86px Georgia, serif';
    ctx.fillStyle = '#fff8ea';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, cx, chipY + 4);
  });

  // bottom info
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 34px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.85)';
  ctx.fillText(`V O L U M E  ${roman}`, W / 2, H - 148);
  ctx.font = 'italic 500 28px Georgia, serif';
  ctx.fillStyle = 'rgba(249,236,214,0.62)';
  ctx.fillText(`${count} ${count === 1 ? 'TERM' : 'TERMS'} · LEXLLM`, W / 2, H - 96);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function creamTexture() {
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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];

export class Bookshelf {
  constructor(container, volumes, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.volumes = volumes;

    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(container.clientWidth, container.clientHeight);
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    container.appendChild(this._renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0912');
    this.scene.fog = new THREE.Fog('#0b0912', 42, 78);

    this._buildLights();
    this._buildStage();
    this._buildBooks();
    this._buildDust();
    this._buildBackglow();

    this._camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    this._camera.position.set(0, 3.2, 16.5);

    this.controls = new OrbitControls(this._camera, this._renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.3, 0);
    this.controls.minDistance = 6;
    this.controls.maxDistance = 36;
    this.controls.minPolarAngle = 1.05;
    this.controls.maxPolarAngle = 1.52;
    this.controls.minAzimuthAngle = -1.0;
    this.controls.maxAzimuthAngle = 1.0;
    this.controls.addEventListener('start', () => (this._userDrag = true));
    this.controls.addEventListener('end', () => setTimeout(() => (this._userDrag = false), 400));

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._hover = null;
    this._selectedFolder = null;

    this._clock = new THREE.Clock();
    this._elapsed = 0;
    this._focusAnim = null;

    this._bindEvents();
    this._animate();
  }

  // ---------------- build helpers ----------------
  _buildLights() {
    const hemi = new THREE.HemisphereLight('#fff2e0', '#2b2040', 1.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#ffe6c0', 1.35);
    key.position.set(6, 12, 8);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#9f7cff', 0.7);
    rim.position.set(-8, 6, -8);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight('#6ea8fe', 0.35);
    fill.position.set(0, 2, -10);
    this.scene.add(fill);
  }

  _buildStage() {
    // platform
    const wood = new THREE.MeshStandardMaterial({
      color: '#3a2c20',
      roughness: 0.85,
      metalness: 0.05,
    });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(21, 22.5, 0.9, 96), wood);
    plat.position.y = -0.45;
    this.scene.add(plat);

    // platform inlay glow ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#6b4a78',
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(17.4, 0.07, 12, 120), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    // center pedestal disc with subtle emblem
    const emblemMat = new THREE.MeshStandardMaterial({
      color: '#241a2e',
      roughness: 0.6,
      metalness: 0.5,
      emissive: '#120d18',
    });
    const emblem = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.28, 48), emblemMat);
    emblem.position.y = 0.14;
    this.scene.add(emblem);

    // glowing ring on top of pedestal
    const goldMat = new THREE.MeshBasicMaterial({
      color: '#e6b45c',
      transparent: true,
      opacity: 0.9,
    });
    const gold = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.03, 10, 60), goldMat);
    gold.rotation.x = Math.PI / 2;
    gold.position.y = 0.29;
    this.scene.add(gold);
    this._pedestalGold = gold;
  }

  _buildBooks() {
    this.items = [];
    const group = new THREE.Group();
    this.scene.add(group);
    this._bookGroup = group;

    const N = this.volumes.length;
    // arrange in a gentle arc bulging toward the camera for a "rotunda" feel
    const arcRadius = 30;
    const baseGap = 2.55;

    this.volumes.forEach((vol, i) => {
      const t = N === 1 ? 0 : i / (N - 1) - 0.5; // -0.5 .. 0.5
      const x = t * (N - 1) * baseGap;
      const z = -(arcRadius - Math.sqrt(Math.max(0, arcRadius * arcRadius - x * x))) + 0.35;
      const height = 2.25 + Math.min(vol.count, 8) * 0.075 + (i % 3) * 0.08;
      const width = 1.9;
      const thickness = 0.72;

      const c1 = letterColor(vol.letters[0]);
      const c2 = letterColor(vol.letters[1]);

      const label = makeLabelTexture({
        label: vol.label.replace(/\s/g, ''),
        letters: vol.letters,
        count: vol.count,
        c1,
        c2,
        roman: ROMAN[i],
      });

      const cover = new THREE.MeshStandardMaterial({
        map: label,
        roughness: 0.62,
        metalness: 0.12,
      });
      const backColor = new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.32);
      const sideColor = new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.42);
      const back = new THREE.MeshStandardMaterial({
        color: backColor,
        roughness: 0.7,
        metalness: 0.1,
      });
      const side = new THREE.MeshStandardMaterial({
        color: sideColor,
        roughness: 0.8,
        metalness: 0.08,
      });
      const pageMat = new THREE.MeshStandardMaterial({
        map: creamTexture(),
        roughness: 0.9,
      });
      const pageMat2 = pageMat.clone();
      pageMat2.map = creamTexture();

      // box face order: +x -x +y -y +z -z  (cover on +z faces the camera)
      const geo = new THREE.BoxGeometry(width, height, thickness);
      const mats = [pageMat, side, pageMat2, back, cover, back];
      const mesh = new THREE.Mesh(geo, mats);

      const tiltX = (Math.random() - 0.5) * 0.05;
      const yaw = (Math.random() - 0.5) * 0.07;
      const book = new THREE.Group();
      mesh.position.y = height / 2 + 0.02;
      mesh.rotation.y = yaw;
      mesh.rotation.z = tiltX;
      book.add(mesh);
      book.position.set(x, 0, z);

      // soft fake shadow under book
      const shTex = softShadowTexture();
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 2.6),
        new THREE.MeshBasicMaterial({
          map: shTex,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      shadow.scale.set(1.15, 1, 1);
      book.add(shadow);

      // selection glow ring under the book
      const glowMat = new THREE.MeshBasicMaterial({
        color: '#e6b45c',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.62, 48), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.05;
      book.add(glow);

      group.add(book);

      this.items.push({
        vol,
        group: book,
        mesh,
        baseX: x,
        baseY: 0,
        baseZ: z,
        height,
        width,
        c1,
        c2,
        shadow,
        glow,
        glowMat,
        riseDelay: 0.12 + i * 0.055,
        jitter: Math.random() * Math.PI * 2,
        userData: { folder: vol.folder, mesh },
      });
      mesh.userData = { folder: vol.folder };
    });
  }

  _buildDust() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 26;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.2 + Math.random() * 9;
      pos[i * 3 + 2] = Math.sin(a) * r * 0.6;
      sizes[i] = 1 + Math.random() * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: '#e8c98a',
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this._dust = { pts, geo };
  }

  _buildBackglow() {
    const { c, ctx } = makeCanvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(120,90,220,0.28)');
    g.addColorStop(0.5, 'rgba(90,60,180,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sprite.scale.set(46, 24, 1);
    sprite.position.set(0, 1.5, -8);
    this.scene.add(sprite);
    this._backglow = sprite;
  }

  // ---------------- events ----------------
  _bindEvents() {
    const el = this._renderer.domElement;
    el.style.cursor = 'grab';
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerdown', (e) => {
      el.style.cursor = 'grabbing';
      this._downed = true;
    });
    el.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointerup', () => {
      if (this._downed) {
        this._downed = false;
        el.style.cursor = this._hover ? 'pointer' : 'grab';
      }
    });
    el.addEventListener('click', this._onClick);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
  }

  _pick(ev) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this._camera);
    const meshes = this.items.map((it) => it.mesh);
    const hits = this._raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    let node = hits[0].object;
    while (node && !node.userData.folder) node = node.parent;
    return node ? node.userData.folder : null;
  }

  _onMove = (e) => {
    const folder = this._pick(e);
    if (folder !== this._hover) {
      this._hover = folder;
      const el = this._renderer.domElement;
      el.style.cursor = folder ? 'pointer' : this._downed ? 'grabbing' : 'grab';
      this._setHover(folder);
    }
  };

  _onClick = (e) => {
    const folder = this._pick(e);
    if (folder && !this._downed) {
      this._downed = false;
      if (this.hooks.onSelectVolume) this.hooks.onSelectVolume(folder);
    }
    this._downed = false;
  };

  _onUp = () => {
    if (this._downed) {
      this._downed = false;
      this._renderer.domElement.style.cursor = this._hover ? 'pointer' : 'grab';
    }
  };

  _setHover(folder) {
    for (const it of this.items) {
      const on = it.vol.folder === folder;
      it.mesh.material.forEach((m) => {
        if (m.userData && m.userData.baseEmissive !== undefined) {
          m.emissive.setHex(on ? 0xffffff : m.userData.baseEmissive);
        }
      });
    }
  }

  // ---------------- public API ----------------
  select(folder, { fly = true } = {}) {
    this._selectedFolder = folder;
    const item = this.items.find((it) => it.vol.folder === folder);
    if (item) this._focusOn(item, fly);
    this._hover = folder;
  }

  _focusOn(item, fly) {
    this._focusAnim = {
      item,
      x: item.baseX,
      camX: item.baseX,
      start: this._elapsed,
      done: false,
    };
    if (!fly) {
      this._camera.position.x = item.baseX;
      this.controls.target.x = item.baseX;
      this.controls.update();
    }
  }

  clearSelection() {
    this._selectedFolder = null;
    this._setHover(null);
  }

  /** Project a volume's screen-space centre (CSS pixels) for raycast testing/highlighting. */
  screenPointOf(folder) {
    const item = this.items.find((it) => it.vol.folder === folder);
    if (!item) return null;
    const v = new THREE.Vector3();
    item.mesh.getWorldPosition(v);
    v.project(this._camera);
    const rect = this._renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z < 1,
    };
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  // ---------------- loop ----------------
  _animate = () => {
    requestAnimationFrame(this._animate);
    const dt = Math.min(this._clock.getDelta(), 0.05);
    this._elapsed += dt;
    const t = this._elapsed;

    // entrance: books rise with a soft overshoot, staggered
    for (const it of this.items) {
      const p = THREE.MathUtils.clamp((t - it.riseDelay) / 0.7, 0, 1);
      const ease =
        p >= 1 ? 1 : 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 2.2);
      const sel = it.vol.folder === this._selectedFolder;
      const hover = it.vol.folder === this._hover && !sel;
      const raise = sel ? 0.55 : hover ? 0.16 : 0;
      const zPush = sel ? 0.7 : hover ? 0.18 : 0;
      it.group.position.y = it.baseY + ease * (raise + 0) + (sel ? Math.sin(t * 3.2) * 0.02 : 0);
      it.group.position.x = it.baseX + (sel ? Math.sin(t * 0.6 + it.jitter) * 0.02 : 0);
      it.group.position.z = it.baseZ + zPush * ease;
      it.mesh.scale.y = Math.max(0.0001, ease) * (hover && !sel ? 1.02 : 1);
      it.mesh.scale.x = 1 + (sel ? 0.04 * (0.5 + 0.5 * Math.sin(t * 3.2)) : 0);
      it.mesh.scale.z = 1;

      // glow pulse when selected
      const glowTarget = sel ? 0.55 + 0.35 * Math.sin(t * 3.2) : 0;
      it.glowMat.opacity += (Math.max(0, glowTarget) - it.glowMat.opacity) * 0.18;

      // emissive feedback on hover/selected
      const mats = Array.isArray(it.mesh.material) ? it.mesh.material : [it.mesh.material];
      const boost = sel ? 0.35 : hover ? 0.16 : 0;
      mats.forEach((m, idx) => {
        if (!m) return;
        if (idx === 4) {
          m.emissive.setScalar(Math.max(0, boost) * 0.5);
          m.emissiveIntensity = 1;
        } else if (idx === 0 || idx === 2) {
          m.emissive && m.emissive.setScalar(0);
        }
      });
    }

    // gentle pedestal spin
    if (this._pedestalGold) {
      this._pedestalGold.rotation.z += dt * 0.35;
    }

    // dust drift
    if (this._dust) {
      const pos = this._dust.geo.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length / 3; i += 2) {
        arr[i * 3 + 1] += dt * 0.02;
        if (arr[i * 3 + 1] > 9) arr[i * 3 + 1] = 0.2;
      }
      pos.needsUpdate = true;
    }

    // slow idle camera drift until the user takes over
    if (!this._userDrag && !this._focusAnim) {
      this._camera.position.x += (Math.sin(t * 0.12) * 0.6 - this._camera.position.x) * 0.0012;
    }

    // focus animation toward a volume
    if (this._focusAnim) {
      const f = this._focusAnim;
      const k = Math.min(1, (t - f.start) / 0.7);
      const e = 1 - Math.pow(1 - k, 3);
      this.controls.target.x += (f.item.baseX - this.controls.target.x) * 0.1;
      this._camera.position.x += (f.item.baseX - this._camera.position.x) * 0.1;
      if (e >= 1 && Math.abs(this.controls.target.x - f.item.baseX) < 0.02) {
        this._focusAnim = null;
      }
    }

    this.controls.update();
    this._renderer.render(this.scene, this._camera);
  };

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro && this._ro.disconnect();
    const el = this._renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerup', this._onUp);
    el.removeEventListener('click', this._onClick);
    this._renderer.dispose();
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

// Library — the 3D reading room: bookshelf wall, filler books, reading desk,
// lighting, dust, camera choreography and the pull-out / put-back ritual.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { letterColor } from './palette.js';
import { TweenRunner, easeInOutCubic, easeOutCubic, lerp } from './anim.js';
import { makeSpineTexture, fillerSpineTexture, creamTexture, woodTexture, softShadowTexture, makeCanvas } from './textures.js';
import { AnimatedBook, W as BOOK_W, SLIDE } from './book3d.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];

// --- room layout constants ---
const SHELF_FRONT = -4.5; // front face of the shelf boards
const SLOT_Z = SHELF_FRONT - 0.06 - BOOK_W / 2; // book centre while on the shelf
const ROW_BOTTOM = 0.62; // plinth top — volumes O–P … Y–Z
const ROW_TOP = 3.7; // middle board top — volumes A–B … M–N
const TOP_ROW_COUNT = 7;
// volumes stand in alphabetical order but spread across the whole shelf wall,
// with filler books between them — a real library never clusters them together
const SLOT_X_MIN = -11.4;
const SLOT_X_MAX = 11.4;
const SHELF_X_MIN = -13.1;
const SHELF_X_MAX = 13.1;

const DESK_TOP = 1.32;
const LECTERN_TILT = -0.35;

const OVERVIEW_POSE = { pos: [0, 3.8, 13.4], target: [0, 3.2, -4.8] };
const READING_POSE = { pos: [0, 3.05, 7.7], target: [0, 2.3, 2.6] };

const FILLER_COLORS = [
  '#6b3f2e', '#2e4a3a', '#3a3f6b', '#6b5a2e', '#5a2e4a',
  '#4a4a52', '#7a4a2e', '#2e3a4a', '#503018', '#39504a',
];

// faux scholarly titles for the filler-book spines
const FILLER_TITLES = [
  'Principia', 'Ars Combinatoria', 'The Analytical Engine', 'On the Nature of Signals',
  'Gradient Arts', 'Logica Machinalis', 'De Computis', 'Harmonics of Thought',
  'The Calculus of Ideas', 'Syntactic Structures', 'Cybernetica', 'Morphic Fields',
  'A Treatise on Tokens', 'The Engines of Reason', 'Weights & Measures', 'On Learning',
  'The Grammar of Machines', 'Entropy & Order', 'Machina Sapiens', 'The Pattern Makers',
  'Codex Mathematica', 'The Silent Archive', 'Fragments on Mind', 'Opticks & Axioms',
  'The Turing Lectures', 'Bayesian Meditations', 'The Loom of Language', 'Annotations',
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Library {
  constructor(container, volumes, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.volumes = volumes;
    this.anim = new TweenRunner();

    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(container.clientWidth, container.clientHeight);
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    container.appendChild(this._renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d0a08');
    this.scene.fog = new THREE.Fog('#0d0a08', 16, 44);

    this._buildLights();
    this._buildRoom();
    this._slots = this._computeSlots(); // shelf position of every volume
    this._buildShelfWall();
    this._buildVolumes();
    this._buildDesk();
    this._buildDust();
    this._buildBackglow();

    this._camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    this._camera.position.set(0, 4.8, 18.5);

    this.controls = new OrbitControls(this._camera, this._renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.target.set(0, 3.4, -4.8);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 19;
    this.controls.minPolarAngle = 0.85;
    this.controls.maxPolarAngle = 1.62;
    this.controls.minAzimuthAngle = -0.55;
    this.controls.maxAzimuthAngle = 0.55;
    this.controls.addEventListener('start', () => (this._userDrag = true));
    this.controls.addEventListener('end', () => setTimeout(() => (this._userDrag = false), 400));

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._hover = null;
    this._pulled = null; // item currently on the desk
    this._ritual = 0; // increments to cancel stale async sequences
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._clock = new THREE.Clock();
    this._elapsed = 0;

    this._bindEvents();
    this._animate();

    // cinematic intro dolly
    this.controls.enabled = false;
    this._intro = this.anim.delay(0.25).then(() => this._camTo(OVERVIEW_POSE, 1.9));
  }

  // ---------------- construction ----------------
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight('#ffedd0', '#241811', 0.7));

    const key = new THREE.SpotLight('#ffd9a0', 190, 50, 0.62, 0.55, 1.4);
    key.position.set(5, 10.5, 6.5);
    key.target.position.set(0, 3.2, -5);
    this.scene.add(key, key.target);

    const rim = new THREE.DirectionalLight('#8a6cff', 0.45);
    rim.position.set(-9, 7, -2);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight('#ffcf9a', 0.3);
    fill.position.set(0, 4, 12);
    this.scene.add(fill);

    // wall sconces
    this._sconces = [];
    for (const x of [-11.6, 11.6]) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 12),
        new THREE.MeshBasicMaterial({ color: '#ffcf9a' })
      );
      bulb.position.set(x, 4.7, -4.15);
      this.scene.add(bulb);
      const pt = new THREE.PointLight('#ffb46a', 17, 13, 1.8);
      pt.position.copy(bulb.position).z += 0.3;
      this.scene.add(pt);
      this._sconces.push(pt);
    }
  }

  _buildRoom() {
    const floorTex = woodTexture({ base: '#33241a', plank: 96, horizontal: false });
    floorTex.repeat.set(5, 3.2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 50),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 8);
    this.scene.add(floor);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 24),
      new THREE.MeshStandardMaterial({ color: '#161009', roughness: 1 })
    );
    wall.position.set(0, 8, -6.7);
    this.scene.add(wall);

    // rug under the desk
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 64),
      new THREE.MeshStandardMaterial({ color: '#43222e', roughness: 1 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 3.4);
    this.scene.add(rug);
    const rugRing = new THREE.Mesh(
      new THREE.RingGeometry(4.45, 4.8, 64),
      new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.9 })
    );
    rugRing.rotation.x = -Math.PI / 2;
    rugRing.position.set(0, 0.014, 3.4);
    this.scene.add(rugRing);
  }

  _buildShelfWall() {
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture({ base: '#4a3423' }), roughness: 0.72 });
    const woodDark = new THREE.MeshStandardMaterial({ color: '#241811', roughness: 0.9 });
    const group = new THREE.Group();
    this.scene.add(group);

    const add = (w, h, d, x, y, z, mat = wood) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      group.add(m);
      return m;
    };

    const boardZ = SHELF_FRONT - 1.95 / 2 + 0.02;
    add(27, ROW_BOTTOM, 1.95, 0, ROW_BOTTOM / 2, boardZ); // plinth
    add(27, 0.18, 1.95, 0, ROW_TOP - 0.09, boardZ); // middle board
    add(27.6, 0.3, 2.15, 0, 6.92, boardZ + 0.05); // cornice
    add(0.28, 6.9, 1.95, -13.5, 3.45, boardZ); // sides
    add(0.28, 6.9, 1.95, 13.5, 3.45, boardZ);
    add(27, 6.9, 0.12, 0, 3.45, -6.33, woodDark); // back panel

    this._buildFillers();
  }

  /** Shelf position of every volume: alphabetical, spread across the row. */
  _computeSlots() {
    const topCount = Math.min(TOP_ROW_COUNT, this.volumes.length);
    return this.volumes.map((vol, i) => {
      const topRow = i < topCount;
      const rowIndex = topRow ? i : i - topCount;
      const rowCount = topRow ? topCount : this.volumes.length - topCount;
      const x =
        rowCount === 1 ? 0 : SLOT_X_MIN + (rowIndex / (rowCount - 1)) * (SLOT_X_MAX - SLOT_X_MIN);
      return { x, shelfTop: topRow ? ROW_TOP : ROW_BOTTOM, z: SLOT_Z };
    });
  }

  _buildFillers() {
    const rand = mulberry32(42);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const group = new THREE.Group();
    this.scene.add(group);

    // shared materials: cream page edges + one plain cover per colour
    const pages = new THREE.MeshStandardMaterial({ map: creamTexture(), roughness: 0.9 });
    const cover = {};
    for (const col of FILLER_COLORS) {
      cover[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.82 });
    }

    // a few titled spine variants per colour — upright, and flat for stacks
    const spine = {};
    const spineFlat = {};
    for (const col of FILLER_COLORS) {
      spine[col] = [];
      spineFlat[col] = [];
      for (let i = 0; i < 3; i++) {
        spine[col].push(
          new THREE.MeshStandardMaterial({
            map: fillerSpineTexture({
              base: col,
              title: FILLER_TITLES[Math.floor(rand() * FILLER_TITLES.length)],
              rand,
            }),
            roughness: 0.72,
          })
        );
        spineFlat[col].push(
          new THREE.MeshStandardMaterial({
            map: fillerSpineTexture({
              base: col,
              title: FILLER_TITLES[Math.floor(rand() * FILLER_TITLES.length)],
              horizontal: true,
              rand,
            }),
            roughness: 0.72,
          })
        );
      }
    }
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    const fillRow = (shelfTop, keepOuts) => {
      let x = SHELF_X_MIN;
      while (x < SHELF_X_MAX - 0.4) {
        const blocked = (w) => keepOuts.find(([a, b]) => x + w > a - 0.05 && x < b + 0.05);

        // occasionally lay a small stack of flat books instead of upright ones
        if (rand() < 0.1) {
          const w = 0.95 + rand() * 0.3;
          if (!blocked(w) && x + w < SHELF_X_MAX - 0.3) {
            let y = shelfTop;
            const n = 2 + Math.floor(rand() * 3);
            for (let i = 0; i < n; i++) {
              const col = FILLER_COLORS[Math.floor(rand() * FILLER_COLORS.length)];
              const th = 0.16 + rand() * 0.1;
              const mesh = new THREE.Mesh(geo, [pages, pages, cover[col], cover[col], pick(spineFlat[col]), pages]);
              mesh.scale.set(w - rand() * 0.12, th, 1.3 + rand() * 0.2);
              mesh.position.set(x + w / 2 + (rand() - 0.5) * 0.06, y, SLOT_Z + (rand() - 0.5) * 0.1);
              mesh.rotation.y = (rand() - 0.5) * 0.14;
              group.add(mesh);
              y += th + 0.005;
            }
            x += w + 0.06 + rand() * 0.14;
            continue;
          }
        }

        const t = 0.38 + rand() * 0.5;
        const hit = blocked(t);
        if (hit) {
          x = hit[1] + 0.05 + rand() * 0.1;
          continue;
        }
        if (x + t > SHELF_X_MAX) break;
        const h = 1.7 + rand() * 1.2;
        const d = 1.45 + rand() * 0.25;
        const col = FILLER_COLORS[Math.floor(rand() * FILLER_COLORS.length)];
        const mesh = new THREE.Mesh(geo, [cover[col], cover[col], pages, cover[col], pick(spine[col]), pages]);
        mesh.scale.set(t, h, d);
        mesh.position.set(x + t / 2, shelfTop, SLOT_Z + (rand() - 0.5) * 0.1);
        if (rand() < 0.14) mesh.rotation.z = (rand() - 0.5) * 0.1; // gently leaning
        group.add(mesh);
        x += t + 0.02 + rand() * 0.1;
        if (rand() < 0.06) x += 0.25 + rand() * 0.5; // breathing gap, like a real shelf
      }
    };

    // fill the shelf wall around the volumes' slots, never over them
    const keepOut = (row) =>
      this._slots
        .filter((s) => s.shelfTop === row)
        .map((s) => [s.x - 0.62, s.x + 0.62])
        .sort((a, b) => a[0] - b[0]);
    fillRow(ROW_TOP, keepOut(ROW_TOP));
    fillRow(ROW_BOTTOM, keepOut(ROW_BOTTOM));
  }

  _buildVolumes() {
    this.items = [];
    const group = new THREE.Group();
    this.scene.add(group);

    this.volumes.forEach((vol, i) => {
      const slot = this._slots[i];
      const h = 2.3 + Math.min(vol.count, 8) * 0.06 + (i % 3) * 0.06;

      const c1 = letterColor(vol.letters[0]);
      const c2 = letterColor(vol.letters[1]);
      const label = vol.label.replace(/\s/g, '');
      const roman = ROMAN[i];

      const spineMat = new THREE.MeshStandardMaterial({
        map: makeSpineTexture({ label, letters: vol.letters, count: vol.count, c1, c2, roman }),
        roughness: 0.62,
        metalness: 0.12,
        emissive: new THREE.Color(c1),
        emissiveIntensity: 0,
      });
      const leather = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.32),
        roughness: 0.68,
      });
      const pages = new THREE.MeshStandardMaterial({ map: creamTexture(), roughness: 0.9 });

      // box faces: +x -x covers · +y -y page edges · +z spine · -z fore-edge
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, h, BOOK_W),
        [leather, leather, pages, leather, spineMat, pages]
      );
      mesh.position.y = h / 2;
      mesh.userData = { folder: vol.folder };

      const book = new THREE.Group();
      book.add(mesh);
      book.position.set(slot.x, slot.shelfTop, SLOT_Z - 0.9); // starts recessed, slides in on load
      group.add(book);

      vol.c1 = c1;
      vol.c2 = c2;

      const book3d = new AnimatedBook(vol, roman, this.anim, { h });
      this.scene.add(book3d.group);

      this.items.push({
        vol,
        group: book,
        mesh,
        spineMat,
        book3d,
        h,
        slot,
        hoverK: 0,
        enterDelay: 0.35 + i * 0.06,
      });
    });
  }

  _buildDesk() {
    const wood = new THREE.MeshStandardMaterial({
      map: woodTexture({ base: '#3a2818', plank: 84 }),
      roughness: 0.6,
    });
    const desk = new THREE.Group();
    this.scene.add(desk);

    const top = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 3.4), wood);
    top.position.set(0, DESK_TOP - 0.08, 2.7);
    desk.add(top);
    for (const lx of [-2.45, 2.45]) {
      for (const lz of [1.3, 4.1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, DESK_TOP - 0.16, 0.26), wood);
        leg.position.set(lx, (DESK_TOP - 0.16) / 2, lz);
        desk.add(leg);
      }
    }

    // lectern the pulled book rests on
    const slope = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.07, 1.85), wood);
    slope.position.set(0, 1.52, 2.2);
    slope.rotation.x = LECTERN_TILT;
    desk.add(slope);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 0.1), wood);
    lip.position.set(0, 1.36, 3.06);
    desk.add(lip);
    for (const sx of [-1.1, 1.1]) {
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 1.5), wood);
      wedge.position.set(sx, 1.42, 2.25);
      wedge.rotation.x = LECTERN_TILT;
      desk.add(wedge);
    }

    // soft shadow + gold ring that appear under the pulled book
    this._deskShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.8),
      new THREE.MeshBasicMaterial({
        map: softShadowTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this._deskShadow.rotation.x = -Math.PI / 2;
    this._deskShadow.position.set(0, DESK_TOP + 0.006, 2.75);
    this.scene.add(this._deskShadow);

    this._deskRing = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.45, 48),
      new THREE.MeshBasicMaterial({
        color: '#e6b45c',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this._deskRing.rotation.x = -Math.PI / 2;
    this._deskRing.position.set(0, DESK_TOP + 0.009, 2.75);
    this.scene.add(this._deskRing);
  }

  _buildDust() {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 32;
      pos[i * 3 + 1] = 0.2 + Math.random() * 8;
      pos[i * 3 + 2] = -6 + Math.random() * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: '#e8c98a',
      size: 0.05,
      transparent: true,
      opacity: 0.5,
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
    g.addColorStop(0, 'rgba(255,170,80,0.22)');
    g.addColorStop(0.5, 'rgba(200,120,50,0.09)');
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
    sprite.scale.set(38, 16, 1);
    sprite.position.set(0, 4.2, -6.2);
    this.scene.add(sprite);
  }

  // ---------------- events ----------------
  _bindEvents() {
    const el = this._renderer.domElement;
    el.style.cursor = 'grab';
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerdown', () => {
      el.style.cursor = 'grabbing';
      this._downed = true;
    });
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
    const meshes = this.items.filter((it) => it.group.visible).map((it) => it.mesh);
    const hits = this._raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.folder : null;
  }

  _onMove = (e) => {
    if (this._pulled || this.anim.busy) {
      if (this._hover) this._setHover(null);
      return;
    }
    const folder = this._pick(e);
    if (folder !== this._hover) {
      this._hover = folder;
      this._renderer.domElement.style.cursor = folder ? 'pointer' : this._downed ? 'grabbing' : 'grab';
    }
  };

  _onClick = (e) => {
    // a click during an animation fast-forwards it instead of picking
    if (this.anim.busy) {
      this.anim.finishAll();
      return;
    }
    if (this._pulled) return;
    const folder = this._pick(e);
    if (folder && this.hooks.onSelectVolume) this.hooks.onSelectVolume(folder);
  };

  _setHover(folder) {
    this._hover = folder;
  }

  // ---------------- camera ----------------
  _camTo(pose, dur) {
    const pos0 = this._camera.position.clone();
    const tgt0 = this.controls.target.clone();
    const pos1 = new THREE.Vector3(...pose.pos);
    const tgt1 = new THREE.Vector3(...pose.target);
    this.controls.enabled = false;
    return this.anim
      .add(dur, (k) => {
        this._camera.position.lerpVectors(pos0, pos1, k);
        this.controls.target.lerpVectors(tgt0, tgt1, k);
      }, easeInOutCubic)
      .then(() => {
        this.controls.enabled = true;
      });
  }

  _focusPose(item) {
    return {
      pos: [item.slot.x * 0.5, 3.4, 8.8],
      target: [item.slot.x * 0.75, item.slot.shelfTop + item.h / 2, -5.0],
    };
  }

  _anchor(item) {
    // centre of the book standing on the lectern, leaning back
    const cos = Math.cos(LECTERN_TILT);
    const sin = Math.sin(LECTERN_TILT);
    return {
      pos: new THREE.Vector3(0, DESK_TOP + 0.03 + cos * (item.h / 2), 3.02 + sin * (item.h / 2)),
      rotX: LECTERN_TILT,
    };
  }

  _fadeDeskProps(shadowOpacity) {
    const s0 = this._deskShadow.opacity;
    return this.anim.add(0.6, (k) => {
      this._deskShadow.opacity = lerp(s0, shadowOpacity, k);
    }, easeOutCubic);
  }

  // ---------------- the ritual ----------------
  /** Glide to the shelf, slide the volume out, fly it to the desk, open it. */
  async pullOutBook(folder) {
    const item = this.items.find((it) => it.vol.folder === folder);
    if (!item || this._pulled) return;
    const ritual = ++this._ritual;
    const stale = () => ritual !== this._ritual;

    this._pulled = item;
    this._setHover(null);

    await this._intro; // never fight the opening dolly for the camera
    if (stale()) return;

    if (this._reducedMotion) {
      item.book3d.snapOpen(this._anchor(item));
      item.group.visible = false;
      this._deskShadow.opacity = 0.55;
      await this._camTo(READING_POSE, 0.6);
      return;
    }

    item.book3d.poseAtShelf(item.slot);
    item.group.visible = false;

    await this._camTo(this._focusPose(item), 0.85);
    if (stale()) return;
    await item.book3d.slideOut();
    if (stale()) return;
    await Promise.all([
      item.book3d.flyToDesk(this._anchor(item)),
      this._camTo(READING_POSE, 0.95),
      this._fadeDeskProps(0.55),
    ]);
    if (stale()) return;
    await item.book3d.open();
  }

  /** Close the book, fly it back and slide it into its slot. */
  async returnBook() {
    const item = this._pulled;
    if (!item) return;
    const ritual = ++this._ritual;
    const stale = () => ritual !== this._ritual;
    this._pulled = null;

    const slotPose = {
      pos: new THREE.Vector3(item.slot.x, item.slot.shelfTop + item.h / 2, item.slot.z + SLIDE),
    };

    if (this._reducedMotion) {
      item.book3d.group.visible = false;
      item.group.visible = true;
      this._deskShadow.opacity = 0;
      await this._camTo(OVERVIEW_POSE, 0.6);
      return;
    }

    await item.book3d.close();
    if (stale()) return;
    await Promise.all([
      item.book3d.flyBack(slotPose),
      this._camTo(OVERVIEW_POSE, 0.95),
      this._fadeDeskProps(0),
    ]);
    if (stale()) return;
    await item.book3d.slideIn();
    if (stale()) return;
    item.book3d.group.visible = false;
    item.group.position.z = item.slot.z;
    item.group.visible = true;
  }

  overview() {
    return this._camTo(OVERVIEW_POSE, 0.9);
  }

  /** Project a volume's screen-space centre (CSS pixels). */
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

    this.anim.tick(dt);

    for (const it of this.items) {
      // entrance: volumes slide into the shelf, staggered
      const p = THREE.MathUtils.clamp((t - it.enterDelay) / 0.7, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);

      // hover lean (books peek out of the shelf)
      const hoverTarget = it.vol.folder === this._hover && !this._pulled ? 1 : 0;
      it.hoverK += (hoverTarget - it.hoverK) * 0.16;

      if (it.group.visible) {
        const pulled = this._pulled === it;
        if (!pulled) {
          it.group.position.z = it.slot.z - 0.9 * (1 - ease) + it.hoverK * 0.24;
          it.spineMat.emissiveIntensity = it.hoverK * 0.35;
        }
      }
    }

    // sconce flicker
    this._sconces.forEach((pt, i) => {
      pt.intensity = 17 + Math.sin(t * 7 + i * 2.3) * 0.9 + Math.sin(t * 13 + i) * 0.5;
    });

    // gold ring pulse while a book is on the desk
    const ringTarget = this._pulled ? 0.42 + 0.16 * Math.sin(t * 2.6) : 0;
    this._deskRing.material.opacity += (ringTarget - this._deskRing.material.opacity) * 0.1;
    this._deskRing.rotation.z += dt * 0.25;

    // dust drift
    if (this._dust) {
      const pos = this._dust.geo.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length / 3; i += 2) {
        arr[i * 3 + 1] += dt * 0.02;
        if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = 0.2;
      }
      pos.needsUpdate = true;
    }

    // gentle idle sway until the user takes over
    if (!this._userDrag && !this._pulled && !this.anim.busy) {
      this._camera.position.x += (Math.sin(t * 0.1) * 0.55 - this._camera.position.x) * 0.001;
    }

    this.controls.update();
    this._renderer.render(this.scene, this._camera);
  };

  dispose() {
    this._ro && this._ro.disconnect();
    const el = this._renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('click', this._onClick);
    this._renderer.dispose();
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

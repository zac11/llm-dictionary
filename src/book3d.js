// AnimatedBook — an openable 3D dictionary volume.
// Lifecycle per ritual (driven by Library):
//   poseAtShelf → slideOut → flyToDesk → open  →  (reading)  →  close → flyBack → slideIn
import * as THREE from 'three';
import { makeCoverTexture, makePageTexture, creamTexture } from './textures.js';
import { easeInOutCubic, easeOutCubic, easeOutBack, lerp } from './anim.js';

export const W = 1.7; // cover width (hinge → fore-edge)
const T = 0.8; // thickness (front cover → back cover)
// The front cover is hinged on the book's LEFT edge (the spine), so a
// NEGATIVE yaw lifts its free edge up off the pages toward the viewer and
// folds it back over the spine — the way a real book opens on a lectern.
// A positive angle drives the cover through the page block instead.
const OPEN_ANGLE = -(160 * Math.PI) / 180;
export const SLIDE = 1.35; // how far the book slides out of the shelf

export class AnimatedBook {
  constructor(vol, roman, anim, { h = 2.5 } = {}) {
    this.vol = vol;
    this.anim = anim;
    this.h = h;

    const c1 = vol.c1;
    const c2 = vol.c2;
    const leather = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c1).lerp(new THREE.Color(c2), 0.5).multiplyScalar(0.32),
      roughness: 0.62,
      metalness: 0.12,
    });
    const cream = new THREE.MeshStandardMaterial({ map: creamTexture(), roughness: 0.9 });
    const pageTex = makePageTexture({ letters: vol.letters });
    const coverTex = makeCoverTexture({
      label: vol.label.replace(/\s/g, ''),
      letters: vol.letters,
      count: vol.count,
      c1,
      c2,
      roman,
    });

    const group = new THREE.Group();
    this.group = group;

    // back cover
    const backCover = new THREE.Mesh(new THREE.BoxGeometry(W, h, 0.08), leather);
    backCover.position.z = -T / 2 + 0.04;
    group.add(backCover);

    // page block — its +z face is the right-hand page once the book is open
    const blockDepth = T - 0.24;
    const pageBlock = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.14, h - 0.14, blockDepth),
      [cream, cream, cream, cream, new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.92 }), cream]
    );
    pageBlock.position.set(0.01, 0, -0.03);
    group.add(pageBlock);

    // loose pages that flutter while the cover opens
    this._loosePivots = [];
    const looseMat = new THREE.MeshStandardMaterial({
      map: pageTex,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(-(W - 0.14) / 2 + 0.02, 0, 0.24 + i * 0.02);
      const page = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, h - 0.2), looseMat);
      page.position.x = (W - 0.2) / 2;
      pivot.add(page);
      group.add(pivot);
      this._loosePivots.push(pivot);
    }

    // front cover, hinged at the spine (left edge)
    this._frontPivot = new THREE.Group();
    this._frontPivot.position.set(-W / 2, 0, T / 2 - 0.06);
    const coverMats = [
      leather,
      leather,
      leather,
      leather,
      new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.62, metalness: 0.12 }),
      cream, // inside of the cover
    ];
    const frontCover = new THREE.Mesh(new THREE.BoxGeometry(W, h, 0.08), coverMats);
    frontCover.position.set(W / 2, 0, 0.04);
    this._frontPivot.add(frontCover);
    group.add(this._frontPivot);

    group.visible = false;
  }

  /** Closed, standing on the shelf with its spine facing the room (+z). */
  poseAtShelf(slot) {
    this.group.position.set(slot.x, slot.shelfTop + this.h / 2, slot.z);
    this.group.rotation.set(0, Math.PI / 2, 0);
    this._frontPivot.rotation.y = 0;
    this._loosePivots.forEach((p) => (p.rotation.y = 0));
    this.group.visible = true;
  }

  slideOut() {
    const z0 = this.group.position.z;
    return this.anim.add(0.45, (k) => {
      this.group.position.z = z0 + SLIDE * k;
    }, easeOutCubic);
  }

  slideIn() {
    const z0 = this.group.position.z;
    return this.anim.add(0.4, (k) => {
      this.group.position.z = z0 - SLIDE * k;
    }, easeInOutCubic);
  }

  /** Arc from the shelf mouth down onto the reading-desk lectern. */
  flyToDesk(anchor) {
    return this._fly(anchor, false);
  }

  flyBack(slot) {
    return this._fly(slot, true);
  }

  _fly(target, toShelf) {
    const startPos = this.group.position.clone();
    const endPos = target.pos;
    const startRotY = this.group.rotation.y;
    const endRotY = toShelf ? Math.PI / 2 : 0;
    const startRotX = this.group.rotation.x;
    const endRotX = toShelf ? 0 : target.rotX;
    return this.anim.add(0.95, (k) => {
      this.group.position.lerpVectors(startPos, endPos, k);
      this.group.position.y += Math.sin(Math.PI * k) * 1.05; // arc lift
      this.group.rotation.y = lerp(startRotY, endRotY, k);
      this.group.rotation.x = lerp(startRotX, endRotX, k);
    }, easeInOutCubic);
  }

  /** Swing the cover open with a flutter of loose pages. */
  async open() {
    const cover = this.anim.add(0.75, (k) => {
      this._frontPivot.rotation.y = OPEN_ANGLE * k;
    }, (t) => easeOutBack(t, 1.4));
    const pages = this._loosePivots.map((pivot, i) =>
      this.anim.delay(0.16 + i * 0.12).then(() =>
        this.anim.add(0.5, (k) => {
          pivot.rotation.y = (OPEN_ANGLE + 0.14 + i * 0.09) * k;
        }, easeInOutCubic)
      )
    );
    await Promise.all([cover, ...pages]);
  }

  async close() {
    const pages = this._loosePivots.map((pivot, i) =>
      this.anim.delay(i * 0.06).then(() =>
        this.anim.add(0.32, (k) => {
          pivot.rotation.y = (OPEN_ANGLE + 0.14 + i * 0.09) * (1 - k);
        }, easeInOutCubic)
      )
    );
    const cover = this.anim.delay(0.18).then(() =>
      this.anim.add(0.5, (k) => {
        this._frontPivot.rotation.y = OPEN_ANGLE * (1 - k);
      }, easeInOutCubic)
    );
    await Promise.all([cover, ...pages]);
  }

  /** Instantly snap to the fully open pose on the desk (reduced motion). */
  snapOpen(anchor) {
    this.group.position.copy(anchor.pos);
    this.group.rotation.set(anchor.rotX, 0, 0);
    this._frontPivot.rotation.y = OPEN_ANGLE;
    this._loosePivots.forEach((p, i) => (p.rotation.y = OPEN_ANGLE + 0.14 + i * 0.09));
    this.group.visible = true;
  }
}
